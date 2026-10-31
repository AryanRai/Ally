import { interruptedSessions, RESUME_PROMPT } from './interrupted.js';
import { recordProviderUsage, observeClaudeAllowance } from './providerUsage.js';
import { completeUnread } from './unread.js';
// Spawning agent turns and streaming their normalized events.
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { childEnv, isWin, launcherFor, resolveAgentBinary } from './binaries.js';
import { ClaudeStreamParser, StreamParser } from './parsers.js';
import { codexAccounts } from './codexAccounts.js';
import { runCodexTurnCycling } from './codexCycle.js';
import { markAllyCodexTurn } from './codexAppLimits.js';
import { runCodexTurn } from './codexRun.js';
import { runCodexDesktopTurn } from './codexDesktopRun.js';
import { recoverExactCodexOwner } from './codexOwnerRecovery.js';
import { trackRunningSession, finishRunningSession } from './runningSessions.js';
import { FollowupReceipts, type FollowupIntent, type FollowupMode } from './followups.js';
import { messageQueue, queuedPrompt, queueUnavailable } from './messageQueue.js';
import { thumbnails } from './thumbs.js';
import { claudeResumeLaunch } from './claudeResume.js';
import { allyChatsMcpServers } from '../chatsMcp/registry.js';
import type { AgentEvent, AgentRobotContext, AgentRunOptions, AgentInteractionHandler } from './types.js';
import { validateAccess, type AccessControl, type AccessScope } from './access.js';
import type { AgentPermission } from './types.js';

interface ActiveRun {
  child: ChildProcess;
  cleanup: () => void;
}

const runs = new Map<string, ActiveRun>();
const codexRuns = new Map<string, { stop: () => void; steer?: (text: string, images?: string[]) => Promise<boolean> } & AccessControl>();
const managedRuns = new Map<string, { key: () => string; stop: () => void; setPermission: (permission: AgentPermission) => Promise<AccessScope>; steer: (text: string, requestId: string, intent?: FollowupIntent, images?: string[]) => Promise<FollowupMode> }>();
let runCounter = 0;

/** MCP servers Robot mode hands the agent, by server name: perception (HowYouSeeMe) and motion (DroidCore). */
export function robotMcpServers(robot?: AgentRobotContext): Record<string, string> {
  const servers: Record<string, string> = {};
  if (robot?.mcpUrl) servers.howyouseeme = robot.mcpUrl;
  if (robot?.motionMcpUrl) servers.droidcore = robot.motionMcpUrl;
  return servers;
}

/**
 * Robot context and MCP servers go through temp files so long text never hits the
 * command line. Every non-ephemeral run also gets Ally's ally_chats server.
 */
function writeRobotFiles(runId: string, opts: AgentRunOptions, context?: string): { files: string[]; promptFile?: string; mcpFile?: string } {
  const servers = Object.entries({ ...robotMcpServers(opts.robot), ...allyChatsMcpServers(opts) });
  if (!opts.robot && !servers.length && !context) return { files: [] };
  const dir = path.join(os.tmpdir(), 'ally-agent');
  fs.mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  let promptFile: string | undefined;
  if (opts.robot || context) {
    promptFile = path.join(dir, `${runId}-prompt.md`);
    fs.writeFileSync(promptFile, [opts.robot?.instructions, context].filter(Boolean).join('\n\n'));
    files.push(promptFile);
  }
  let mcpFile: string | undefined;
  if (servers.length) {
    mcpFile = path.join(dir, `${runId}-mcp.json`);
    const mcpServers = Object.fromEntries(servers.map(([name, url]) => [name, { type: 'http', url }]));
    fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers }));
    files.push(mcpFile);
  }
  return { files, promptFile, mcpFile };
}

export function claudeArgs(opts: AgentRunOptions, robot: { promptFile?: string; mcpFile?: string }): string[] {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  if (opts.ephemeral) args.push('--no-session-persistence', '--tools', '');
  const mode = opts.permission === 'full' ? 'bypassPermissions' : opts.permission === 'readonly' ? 'plan' : 'acceptEdits';
  args.push('--permission-mode', mode);
  if (opts.model && opts.model !== 'default') args.push('--model', opts.model);
  if (opts.sessionId) args.push('--resume', opts.sessionId);
  if (robot.promptFile) args.push('--append-system-prompt-file', robot.promptFile);
  if (robot.mcpFile) args.push('--mcp-config', robot.mcpFile);
  // Non-interactive runs can't answer permission prompts: pre-allow Ally's own chat tools (read-only ones for read-only runs)
  if (Object.keys(allyChatsMcpServers(opts)).length) {
    args.push('--allowedTools', opts.permission === 'readonly'
      ? ['ally_list_chats', 'ally_search_chats', 'ally_read_chat', 'study_open', 'visual_tutor_read', 'visual_tutor_draw', 'study_diagram', 'native_study_reference', 'chat_request_access'].map(t => `mcp__ally_chats__${t}`).join(',')
      : 'mcp__ally_chats');
  }
  // Images can't ride on a plain-text prompt; send the turn as a stream-json user message
  if (opts.images?.length) args.push('--input-format', 'stream-json');
  return args;
}

/** stdin payload: plain prompt, or a stream-json user message carrying images (Claude). */
export function stdinPayload(opts: AgentRunOptions): string {
  if (opts.provider !== 'claude' || !opts.images?.length) return opts.prompt;
  const images = opts.images.map(file => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: /\.jpe?g$/i.test(file) ? 'image/jpeg' : /\.gif$/i.test(file) ? 'image/gif' : /\.webp$/i.test(file) ? 'image/webp' : 'image/png',
      data: fs.readFileSync(file).toString('base64'),
    },
  }));
  const message = { type: 'user', message: { role: 'user', content: [...images, { type: 'text', text: opts.prompt }] } };
  return JSON.stringify(message) + '\n';
}

// Only reached for .cmd shims we couldn't unwrap: flags, model names, UUIDs, temp paths
const SHELL_SAFE_ARG = /^[\w.:=\-"/\\@]+$/;

/**
 * Start an agent turn. Events stream to `emit`; resolves with the run id as soon
 * as the process is spawned so the caller can stop it.
 */
export async function startAgentRun(
  opts: AgentRunOptions,
  emit: (runId: string, ev: AgentEvent) => void,
  binOverride?: string,
  interact?: AgentInteractionHandler,
  interactionSurface: 'watch' | 'desktop' = 'watch',
): Promise<string> {
  if (opts.provider === 'codex') {
    const codexAccountId = codexAccounts.route(opts.sessionId, opts.codexAccountId);
    if (opts.sessionId && !opts.ephemeral) codexAccounts.bind(opts.sessionId, codexAccountId);
    opts = { ...opts, codexAccountId, codexDesktop: codexAccountId === 'default' && opts.codexDesktop };
  }
  if (opts.resumeToken !== undefined) {
    if (!opts.sessionId || opts.ephemeral) throw Error('Resume needs the original saved chat.');
    opts = { ...opts, prompt: RESUME_PROMPT, images: undefined };
  }
  const publicId = `conversation-${Date.now()}-${++runCounter}`;
  let sessionId = opts.sessionId, currentId: string | undefined;
  let stopped = false, finished = false, ending = false;
  let queueKey = opts.ephemeral ? publicId : opts.queueKey || (sessionId ? `${opts.provider}:${sessionId}` : publicId);
  const sendQueuedNow = async (item: import('./messageQueue.js').QueuedMessage) => {
    const live = currentId ? codexRuns.get(currentId) : undefined;
    if (finished || stopped || ending || !live?.steer) throw queueUnavailable('Send now is unavailable here. This message stays in the queue; it can run after the response.');
    if (!await live.steer(queuedPrompt(item), item.images)) throw queueUnavailable('Send now is unavailable here. This message stays in the queue.');
    emit(publicId, { kind: 'input', text: item.text, mode: 'steered', queuedId: item.id });
  };
  let unregisterQueue = messageQueue.register(queueKey, sendQueuedNow);
  try { if (!opts.ephemeral) interruptedSessions.starting(queueKey, opts.resumeToken); }
  catch (error) { unregisterQueue(); throw error; }
  const queued = () => messageQueue.snapshot(queueKey).items;
  const pending = new Set<Promise<unknown>>();
  const receipts = new FollowupReceipts();
  const summary = () => sessionId && !opts.ephemeral ? { provider: opts.provider, id: sessionId, title: opts.title?.trim() || opts.prompt.slice(-80), cwd: opts.cwd, updatedAt: Date.now() } : undefined;
  const complete = (event: AgentEvent) => {
    if (finished) return;
    finished = true;
    if (stopped && sessionId && !opts.ephemeral) interruptedSessions.stopped(`${opts.provider}:${sessionId}`);
    if (event.kind === 'done' && stopped) event = { ...event, stopped: true };
    unregisterQueue();
    if (stopped || (event.kind === 'done' && event.isError)) messageQueue.pause(queueKey, 'Current work stopped. Queued messages are kept; send or cancel them when ready.');
    if (sessionId && !opts.ephemeral && event.kind === 'done' && !stopped && !event.isError) completeUnread(opts.provider, sessionId, publicId);
    managedRuns.delete(publicId);
    finishRunningSession(publicId);
    emit(publicId, event);
  };
  const launch = async (prompt: string, initial = false, images?: string[]) => {
    ending = false;
    currentId = undefined;
    if (opts.provider === 'codex') markAllyCodexTurn(sessionId);
    const id = await startTrackedRun({ ...opts, prompt, sessionId, images: initial ? opts.images : images }, (_id, event) => {
      if (finished) return;
      // The Codex-app limit watcher must leave Ally's own turns to codexCycle.
      if (opts.provider === 'codex') markAllyCodexTurn(sessionId ?? (event.kind === 'session' ? event.sessionId : undefined));
      if (event.kind === 'session') {
        sessionId = event.sessionId;
        // New conversations acquire their canonical identity before accepting input.
        if (!opts.ephemeral && queueKey !== `${opts.provider}:${sessionId}`) {
          unregisterQueue(); const previousKey = queueKey; queueKey = `${opts.provider}:${sessionId}`;
          messageQueue.move(previousKey, queueKey); unregisterQueue = messageQueue.register(queueKey, sendQueuedNow);
        }
      }
      if (event.kind === 'done') {
        if (ending) return;
        ending = true;
        recordProviderUsage(opts.provider, { ...event.usage, costUsd: event.usage?.costUsd ?? event.costUsd });
        if (event.sessionId) sessionId = event.sessionId;
        void (async () => {
          await Promise.allSettled([...pending]);
          await messageQueue.settled(queueKey);
          const item = !stopped && !event.isError && sessionId ? messageQueue.claim(queueKey) : undefined;
          if (item && sessionId) {
            const next = queuedPrompt(item);
            const images = item.images;
            emit(publicId, { kind: 'continuation' });
            emit(publicId, { kind: 'input', text: item.text, mode: 'steered', queuedId: item.id });
            try {
              const previous = currentId ? runs.get(currentId) : undefined;
              if (previous) await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => { previous.child.off('close', released); reject(new Error('Previous agent process is still closing. Queued input was not sent: ' + next)); }, 5000);
                const released = () => { clearTimeout(timer); resolve(); };
                previous.child.once('close', released);
              });
              if (stopped) { messageQueue.fail(queueKey, item.id, 'Stopped before sending'); complete({ kind: 'done', sessionId, isError: true, error: 'Stopped by you. Queued input was not sent: ' + next }); return; }
              await launch(next, false, images?.length ? images : undefined);
              messageQueue.sent(queueKey, item.id);
            } catch (error) { messageQueue.fail(queueKey, item.id, String(error), true); complete({ kind: 'done', sessionId, isError: true, error: String(error) }); }
          } else {
            complete(queued().length ? { ...event, isError: true, error: `${event.error || (stopped ? 'Stopped by you.' : 'Could not continue this session.')} Queued input was not sent: ${queued().map(input => input.text).join(' / ')}` } : event);
          }
        })();
      } else {
        trackRunningSession(publicId, summary());
        emit(publicId, event);
      }
    }, binOverride, interact, interactionSurface);
    currentId = id;
    if (stopped) stopAgentRun(id);
  };
  managedRuns.set(publicId, {
    key: () => queueKey,
    stop: () => { stopped = true; if (currentId) stopAgentRun(currentId); },
    setPermission: async permission => {
      validateAccess(permission);
      if (finished || stopped || ending) throw Error('The reply is finishing. Try changing access again.');
      if (opts.provider === 'codex' && !currentId) throw Error('Still connecting. Try changing access once the reply starts.');
      const operation = (async () => {
        const live = currentId ? codexRuns.get(currentId) : undefined;
        const scope = live?.setPermission ? await live.setPermission(permission) : 'next_message';
        // Queued follow-ups inherit the explicitly selected access, without replaying input.
        opts = { ...opts, permission };
        return scope;
      })();
      pending.add(operation);
      try { return await operation; } finally { pending.delete(operation); }
    },
    steer: (text, requestId, intent = 'auto', images) => receipts.submit(requestId, text, async () => {
      if (finished || stopped || ending) throw new Error('This response has finished. Send your input as a new message.');
      const operation = (async (): Promise<FollowupMode> => {
        const live = currentId ? codexRuns.get(currentId) : undefined;
        if (intent !== 'queue' && live?.steer && await live.steer(text, images)) { emit(publicId, { kind: 'input', text, mode: 'steered' }); return 'steered'; }
        if (intent === 'steer') throw new Error('Steer now is unavailable on this connection. Your draft is kept; choose Queue to send after this response.');
        // Unsupported connections continue in the same session after this response.
        messageQueue.enqueue(queueKey, { id: requestId, text, images });
        emit(publicId, { kind: 'input', text, mode: 'queued' });
        return 'queued';
      })();
      pending.add(operation);
      try { return await operation; } finally { pending.delete(operation); }
    }, intent, JSON.stringify(images ?? [])),
  });
  try { await launch(opts.prompt, true); }
  catch (error) { unregisterQueue(); managedRuns.delete(publicId); finishRunningSession(publicId); throw error; }
  if (!finished) trackRunningSession(publicId, summary());
  return publicId;
}

export async function steerAgentRun(runId: string, text: string, requestId: string, intent: FollowupIntent = 'auto', images?: string[]): Promise<FollowupMode> {
  const run = managedRuns.get(runId);
  if (!run) throw new Error('This response is no longer active. Send your input as a new message.');
  if (!['auto', 'steer', 'queue'].includes(intent)) throw new Error('Invalid input mode');
  return run.steer(text, requestId, intent, images);
}

export async function changeAgentSessionAccess(key: string, permission: AgentPermission): Promise<AccessScope | undefined> {
  validateAccess(permission);
  const run = [...managedRuns.values()].find(run => run.key() === key);
  return run?.setPermission(permission);
}

async function startTrackedRun(
  opts: AgentRunOptions,
  emit: (runId: string, ev: AgentEvent) => void,
  binOverride?: string,
  interact?: AgentInteractionHandler,
  interactionSurface: 'watch' | 'desktop' = 'watch',
): Promise<string> {
  // One attempt on one account; codexCycle moves the same chat to the next account on a usage limit.
  const startCodex = (o: AgentRunOptions, e: (ev: AgentEvent) => void, bin?: string) => o.codexDesktop && o.sessionId && !o.ephemeral
    ? runCodexDesktopTurn(o, e, interact, emitFallback => runCodexTurn(o, emitFallback, binOverride, interact, interactionSurface,
      emitRecovered => runCodexDesktopTurn(o, emitRecovered, interact, undefined, cancelled => recoverExactCodexOwner(o.sessionId!, cancelled))))
    : runCodexTurn(o, e, bin ?? binOverride, interact, interactionSurface);
  if (opts.provider === 'codex' && opts.codexDesktop && opts.sessionId && !opts.ephemeral) {
    const runId = `run-${Date.now()}-${++runCounter}`;
    const run = runCodexTurnCycling(opts, ev => {
      if (ev.kind === 'done') codexRuns.delete(runId);
      if (ev.kind === 'tool_end' && ev.images) ev = { ...ev, images: thumbnails(ev.images) };
      emit(runId, ev);
    }, (o, e) => startCodex(o, e));
    codexRuns.set(runId, run);
    return runId;
  }
  const bin = await resolveAgentBinary(opts.provider, binOverride);
  if (!bin) {
    throw new Error(opts.provider === 'claude'
      ? 'Claude Code CLI not found. Install it with `npm i -g @anthropic-ai/claude-code`, or set its path in Settings.'
      : 'Codex CLI not found. Install the Codex app or `npm i -g @openai/codex`, or set its path in Settings.');
  }
  if (!opts.cwd || !fs.existsSync(opts.cwd)) {
    throw new Error(`Working folder does not exist: ${opts.cwd || '(none)'}`);
  }

  const runId = `run-${Date.now()}-${++runCounter}`;
  if (opts.provider === 'codex') {
    const run = runCodexTurnCycling(opts, ev => {
      if (ev.kind === 'done') codexRuns.delete(runId);
      if (ev.kind === 'tool_end' && ev.images) ev = { ...ev, images: thumbnails(ev.images) };
      emit(runId, ev);
    }, (o, e) => startCodex(o, e, bin));
    codexRuns.set(runId, run);
    return runId;
  }
  const launch = claudeResumeLaunch(opts.cwd, opts.sessionId);
  const robot = writeRobotFiles(runId, opts, launch.context);
  const cleanup = () => robot.files.forEach(f => fs.rmSync(f, { force: true }));

  const args = claudeArgs(opts, robot);
  const launcher = launcherFor(bin);
  if (launcher.shell && !args.every(a => SHELL_SAFE_ARG.test(a))) {
    cleanup();
    throw new Error(`Can't launch ${bin} safely; set the agent's .exe path in Settings`);
  }

  const child = spawn(launcher.command, [...launcher.prefixArgs, ...args], {
    cwd: launch.cwd,
    env: childEnv(),
    shell: launcher.shell,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  runs.set(runId, { child, cleanup });
  child.stdin?.end(stdinPayload(opts));

  const parser: StreamParser = new ClaudeStreamParser();
  let finished = false;
  const startedAt = Date.now();
  const send = (ev: AgentEvent) => {
    if (ev.kind === 'done') {
      if (finished) return;
      finished = true;
      ev = { ...ev, usage: { ...ev.usage, durationMs: ev.usage?.durationMs ?? Date.now() - startedAt } };
    }
    if (ev.kind === 'tool_end' && ev.images) ev = { ...ev, images: thumbnails(ev.images) };
    emit(runId, ev);
  };

  const rl = readline.createInterface({ input: child.stdout! });
  rl.on('line', line => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return;
    let obj: unknown;
    try { obj = JSON.parse(trimmed); } catch { return; }
    observeClaudeAllowance(obj);
    for (const ev of parser.handle(obj)) send(ev);
  });

  let stderrTail = '';
  child.stderr?.on('data', (buf: Buffer) => {
    const text = buf.toString();
    stderrTail = (stderrTail + text).slice(-2000);
    send({ kind: 'stderr', text });
  });

  const finish = () => {
    runs.delete(runId);
    cleanup();
  };

  child.on('error', err => {
    finish();
    send({ kind: 'done', isError: true, error: err.message });
  });

  child.on('close', code => {
    finish();
    rl.close();
    if (code === 0 || code === null) {
      send({ kind: 'done', sessionId: parser.sessionId });
      return;
    }
    const error = /already has an active writer/.test(stderrTail)
      ? 'This thread is open in the Codex app. Close it there to continue it here.'
      : stderrTail.trim().split(/\r?\n/).slice(-4).join('\n') || `Agent exited with code ${code}`;
    send({ kind: 'done', sessionId: parser.sessionId, isError: true, error });
  });

  return runId;
}

export function canStopAgentSession(key: string): boolean {
  return [...managedRuns.values()].some(run => run.key() === key);
}
export function stopAgentSession(key: string): boolean {
  const run = [...managedRuns.values()].find(run => run.key() === key);
  if (!run) return false;
  run.stop(); return true;
}

export function stopAgentRun(runId: string): boolean {
  const managed = managedRuns.get(runId);
  if (managed) { managed.stop(); return true; }
  finishRunningSession(runId);
  const codex = codexRuns.get(runId);
  if (codex) { codex.stop(); return true; }
  const run = runs.get(runId);
  if (!run) return false;
  const pid = run.child.pid;
  if (isWin && pid) {
    // Kill the whole tree — the CLI spawns its own tool subprocesses
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  } else {
    run.child.kill('SIGTERM');
  }
  runs.delete(runId);
  run.cleanup();
  return true;
}

export function stopAllAgentRuns(): void {
  for (const run of managedRuns.values()) run.stop();
  for (const [id, run] of codexRuns) { finishRunningSession(id); run.stop(); }
  for (const id of [...runs.keys()]) stopAgentRun(id);
}
