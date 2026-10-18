import { chatTitle } from './chatTitle.js';
import { CodexRpc } from './codexRpc.js';
import { CodexEventParser } from './codexEvents.js';
import { interactiveCodexSession } from './codexMigration.js';
import type { AgentEvent, AgentRunOptions, AgentInteractionHandler } from './types.js';
import { startUserQuestions, WATCH_QUESTION_INSTRUCTIONS } from './userQuestions.js';
import { ALLY_BROWSER_INSTRUCTIONS } from './browserContext.js';
import { allyChatsMcpServers } from '../chatsMcp/registry.js';

export function codexThreadConfig(opts: AgentRunOptions, interactive = false): Record<string, unknown> {
  const servers: Record<string, { url: string }> = {};
  if (opts.robot?.mcpUrl) servers.howyouseeme = { url: opts.robot.mcpUrl };
  if (opts.robot?.motionMcpUrl) servers.droidcore = { url: opts.robot.motionMcpUrl };
  // Ally's cross-chat tools (find / read / forward to other chats)
  for (const [name, url] of Object.entries(allyChatsMcpServers(opts))) servers[name] = { url };
  return {
    cwd: opts.cwd, approvalPolicy: interactive ? 'on-request' : 'never',
    // Full access reduces eligible prompts through Codex's supported reviewer.
    // Keep on-request and the UI handler: mandatory browser forms still need a human.
    ...(interactive ? { approvalsReviewer: opts.permission === 'full' ? 'auto_review' : 'user' } : {}),
    sandbox: opts.permission === 'full' ? 'danger-full-access' : opts.permission === 'readonly' ? 'read-only' : 'workspace-write',
    ...(opts.model && opts.model !== 'default' ? { model: opts.model } : {}),
    ...(!opts.ephemeral || opts.robot ? { developerInstructions: [!opts.ephemeral && ALLY_BROWSER_INSTRUCTIONS, opts.robot?.instructions].filter(Boolean).join('\n\n') } : {}),
    ...(Object.keys(servers).length ? { config: { mcp_servers: servers } } : {}),
  };
}

/** Starts asynchronously so stop remains available even during initialization/resume. */
export function runCodexTurn(opts: AgentRunOptions, emit: (event: AgentEvent) => void, binary?: string, interact?: AgentInteractionHandler, interactionSurface: 'watch' | 'desktop' = 'watch'): { stop: () => void; steer: (text: string, images?: string[]) => Promise<boolean> } {
  let rpc: CodexRpc | undefined;
  let sessionId: string | undefined;
  let turnId: string | undefined;
  let stopped = false;
  let finished = false;
  let dispatched = false;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  let userQuestions: Awaited<ReturnType<typeof startUserQuestions>> | undefined;
  const startedAt = Date.now();
  const interactions = new Map<string | number, AbortController>();
  const items = new Map<string, unknown>();
  const finish = (event: AgentEvent) => {
    if (finished) return;
    if (event.kind !== 'done') { emit(event); return; }
    finished = true;
    for (const controller of interactions.values()) controller.abort();
    interactions.clear();
    userQuestions?.close();
    clearTimeout(stopTimer);
    // Close before publishing completion, releasing writer ownership to Codex.
    rpc?.close();
    emit({ ...event, sessionId, usage: { ...event.usage, durationMs: Date.now() - startedAt } });
  };
  void (async () => {
    try {
      rpc = await CodexRpc.connect(binary);
      if (finished) { rpc.close(); return; }
      if (stopped) { finish({ kind: 'done' }); return; }
      rpc.onClose = error => finish({ kind: 'done', isError: !stopped, error: stopped ? undefined : error.message });
      rpc.onRequest = async (method, params, id) => {
        if (!interact) {
          finish({ kind: 'done', isError: true, error: `Codex requested ${method}. Continue this interaction in Codex.` });
          throw new Error('No interactive client');
        }
        if (finished || stopped || params.threadId !== sessionId || (params.turnId && turnId && params.turnId !== turnId)) throw new Error('This request is no longer active');
        const controller = new AbortController(); interactions.set(id, controller);
        try { return await interact(method, { ...params, item: items.get(params.itemId) }, controller.signal); }
        finally { interactions.delete(id); }
      };
      const config = codexThreadConfig(opts, !!interact);
      if (interact && interactionSurface === 'watch') {
        userQuestions = await startUserQuestions(interact);
        if (finished || stopped) { userQuestions.close(); finish({ kind: 'done' }); return; }
        const extra = (config.config ?? {}) as Record<string, any>;
        config.config = { ...extra, mcp_servers: { ...extra.mcp_servers, ally_watch: userQuestions.config } };
        config.developerInstructions = [config.developerInstructions, WATCH_QUESTION_INSTRUCTIONS].filter(Boolean).join('\n\n');
      }
      if (opts.sessionId && !opts.ephemeral) {
        sessionId = await interactiveCodexSession(rpc, opts.sessionId, config);
        if (stopped) { finish({ kind: 'done' }); return; }
        await rpc.request('thread/resume', { threadId: sessionId, ...config, excludeTurns: true });
      } else {
        sessionId = (await rpc.request('thread/start', { ...config, ephemeral: !!opts.ephemeral })).thread.id;
        if (!opts.ephemeral) await rpc.request('thread/name/set', { threadId: sessionId, name: chatTitle(opts.prompt) }).catch(() => { /* Naming must never prevent an authorized send. */ });
      }
      if (!opts.ephemeral && !finished) emit({ kind: 'session', sessionId: sessionId! });
      if (finished || stopped) { finish({ kind: 'done' }); return; }
      const parser = new CodexEventParser(sessionId!);
      rpc.onNotification = (method, p) => {
        if (p.threadId !== sessionId) return;
        if (method === 'serverRequest/resolved') interactions.get(p.requestId)?.abort();
        if (method === 'item/started') items.set(p.item.id, p.item);
        if (method === 'item/completed') items.delete(p.item.id);
        if (method === 'turn/started') turnId = p.turn.id;
        for (const ev of parser.handle(method, p)) finish(ev);
      };
      dispatched = true;
      const result = await rpc.request('turn/start', {
        threadId: sessionId,
        input: [{ type: 'text', text: opts.prompt }, ...(opts.images ?? []).map(file => ({ type: 'localImage', path: file }))],
      });
      turnId = result.turn.id;
      if (!finished) emit({ kind: 'accepted', sessionId: sessionId!, turnId });
      if (stopped && !finished) await rpc.request('turn/interrupt', { threadId: sessionId, turnId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const writerError = dispatched
        ? 'Codex reported a chat ownership conflict after submission. Check the same chat in Codex before retrying; your message may already have been accepted. Ally did not resend it or create a copy.'
        : opts.codexDesktop
          ? 'Ally could not connect to this chat through its Codex desktop owner. Open the same chat in Codex and retry. Your message was not sent. No copy was created.'
          : 'This chat is open in Codex. Enable Codex desktop connection in Ally Settings to continue it here. Your message was not sent. No copy was created.';
      finish({ kind: 'done', isError: !stopped, error: stopped ? undefined : /active writer/i.test(message) ? writerError : message });
    }
  })();
  return { steer: async (text, images) => {
    if (finished || stopped) throw new Error('This response has finished. Send your input as a new message.');
    if (!rpc || !sessionId || !turnId) return false;
    const expected = turnId;
    const result = await rpc.request('turn/steer', { threadId: sessionId, expectedTurnId: expected, input: [{ type: 'text', text }, ...(images ?? []).map(path => ({ type: 'localImage', path }))] });
    if (result.turnId !== expected) throw new Error('Codex did not confirm this input. Check the chat before sending it again.');
    return true;
  }, stop: () => {
    if (finished || stopped) return;
    stopped = true;
    userQuestions?.close();
    for (const controller of interactions.values()) controller.abort();
    if (rpc && sessionId && turnId) void rpc.request('turn/interrupt', { threadId: sessionId, turnId }, 3000).catch(() => finish({ kind: 'done' }));
    // Graceful interrupt first; force connection shutdown if setup/tool execution stalls.
    stopTimer = setTimeout(() => finish({ kind: 'done' }), 4000);
  } };
}
