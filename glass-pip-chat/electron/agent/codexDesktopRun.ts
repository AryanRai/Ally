import { randomUUID } from 'node:crypto';
import { CodexDesktopClient, CodexChatUnownedError, CodexDesktopUnavailableError, desktopTurns, assertDesktopCanStart, steerDesktopTurn, updateDesktopAccess } from './codexDesktop.js';
import type { AccessControl } from './access.js';
import { CodexEventParser } from './codexEvents.js';
import type { AgentEvent, AgentRunOptions, AgentInteractionHandler } from './types.js';
import { codexApprovalPolicy } from './approvalPolicy.js';
import { approvalRoutes } from './codexApprovalRoutes.js';

/** Apply the desktop's Immer patches without mutating retained snapshots. */
export function applyDesktopPatches(state: any, patches: any[]): any {
  for (const patch of patches) {
    if (!['add', 'replace', 'remove'].includes(patch.op) || !Array.isArray(patch.path)
      || patch.path.some((key: unknown) => (typeof key !== 'string' && typeof key !== 'number') || ['__proto__', 'prototype', 'constructor'].includes(String(key)))) throw new Error('Unsupported desktop patch');
    if (!patch.path.length) { if (patch.op === 'remove') throw new Error('Desktop removed its snapshot'); state = patch.value; continue; }
    const copy = (value: any): any => {
      if (!value || typeof value !== 'object') throw new Error('Desktop patch path does not exist');
      return Array.isArray(value) ? [...value] : { ...value };
    };
    state = copy(state);
    let parent = state;
    for (const key of patch.path.slice(0, -1)) { parent[key] = copy(parent[key]); parent = parent[key]; }
    const rawKey = patch.path.at(-1);
    // JSON patch paths can encode array indexes as canonical numeric strings.
    const key = Array.isArray(parent) && typeof rawKey === 'string' && /^(0|[1-9]\d*)$/.test(rawKey) ? Number(rawKey) : rawKey;
    if (Array.isArray(parent)) {
      if (key === 'length' && patch.op === 'replace' && Number.isSafeInteger(patch.value) && patch.value >= 0 && patch.value <= parent.length) parent.length = patch.value;
      else {
        if (!Number.isSafeInteger(key) || key < 0 || key > parent.length || (patch.op !== 'add' && key === parent.length)) throw new Error('Invalid desktop array patch');
        if (patch.op === 'add') parent.splice(key, 0, patch.value);
        else if (patch.op === 'remove') parent.splice(key, 1);
        else parent[key] = patch.value;
      }
    } else if (patch.op === 'remove') delete parent[key];
    else parent[key] = patch.value;
  }
  return state;
}

export function desktopTurnRequest(opts: AgentRunOptions, messageId: string) {
  const sandboxPolicy = opts.permission === 'full' ? { type: 'dangerFullAccess' }
    : opts.permission === 'readonly' ? { type: 'readOnly', networkAccess: true }
    : { type: 'workspaceWrite', writableRoots: [opts.cwd], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false };
  return {
    conversationId: opts.sessionId,
    turnStart: {
      request: {
        threadId: opts.sessionId, clientUserMessageId: messageId,
        input: [{ type: 'text', text: opts.prompt, text_elements: [] }, ...(opts.images ?? []).map(path => ({ type: 'localImage', path }))],
        ...codexApprovalPolicy(opts.permission), sandboxPolicy,
        ...(opts.model && opts.model !== 'default' ? { model: opts.model } : {}),
        ...(opts.reasoningEffort ? { effort: opts.reasoningEffort } : {}),
      },
      context: { inheritThreadSettings: true },
    },
  };
}


/** One user turn, through the existing owner. Never retries a submitted message. */
export function runCodexDesktopTurn(opts: AgentRunOptions, emit: (event: AgentEvent) => void, interact?: AgentInteractionHandler, unowned?: (emit: (event: AgentEvent) => void) => { stop: () => void; steer?: (text: string, images?: string[]) => Promise<boolean> } & AccessControl, prepareOwner?: (cancelled: () => boolean) => Promise<void>): { stop: () => void; steer: (text: string, images?: string[]) => Promise<boolean> } & AccessControl {
  const id = opts.sessionId!;
  let fallback: ({ stop: () => void; steer?: (text: string, images?: string[]) => Promise<boolean> } & AccessControl) | undefined;
  const messageId = randomUUID();
  const parser = new CodexEventParser(id);
  const startedAt = Date.now();
  let client: CodexDesktopClient | undefined, owner: string | undefined, state: any, revision: number | undefined;
  let dispatched = false, finished = false, stopped = false, turnId: string | undefined, refreshing = false, interrupting = false;
  let priorEffort: string | null | undefined, priorModel: string | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const texts = new Map<string, string>(), completed = new Set<string>(), started = new Set<string>();
  const approvals = new Map<string | number, AbortController>();
  const handledApprovals = new Set<string | number>();
  const finish = (event: AgentEvent) => {
    if (finished) return;
    if (event.kind !== 'done') { emit(event); return; }
    finished = true; clearInterval(heartbeat);
    for (const controller of approvals.values()) controller.abort();
    const complete = () => {
      client?.close();
      emit({ ...event, sessionId: id, usage: { ...event.usage, durationMs: Date.now() - startedAt } });
    };
    if (opts.reasoningEffort && dispatched && priorEffort !== undefined && client && owner) {
      void client.request('thread-follower-update-thread-settings', {
        conversationId: id, threadSettings: { effort: priorEffort },
        condition: { ifEffortEquals: opts.reasoningEffort, ...(priorModel ? { ifModelEquals: priorModel } : {}) },
      }, owner, 3000).catch(() => {
        emit({ kind: 'stderr', text: 'Study could not restore the previous reasoning setting. Check it in Codex before the next typed reply.' });
      }).finally(complete);
    } else complete();
  };
  const fail = (error: unknown) => finish({ kind: 'done', delivery: dispatched ? turnId ? 'accepted' : 'uncertain' : 'not_sent', isError: true, error: `${error instanceof Error ? error.message : error}${dispatched ? ' Check the same chat in Codex before retrying; your message may already have been accepted.' : ' Your message was not sent.'}` });
  const refresh = () => {
    if (refreshing || finished || !client || !owner) return;
    refreshing = true;
    // Resynchronize reads only. Never replay turn/start after a patch gap.
    void client.snapshot(id, owner).catch(fail).finally(() => { refreshing = false; });
  };
  const interrupt = async () => {
    if (!client || !owner || !turnId || finished || interrupting) return;
    interrupting = true;
    try {
      await client.request('thread-follower-interrupt-turn', { conversationId: id, expectedTurnId: turnId, mode: 'user-stop' }, owner);
      finish({ kind: 'done' });
    } catch (error) { fail(error); }
  };
  const processState = () => {
    if (!state || !dispatched || finished) return;
    const turns = desktopTurns(state);
    const turn = turns.find(turn => turnId ? turn.turnId === turnId : turn.params?.clientUserMessageId === messageId);
    if (!turn) return;
    turnId ??= turn.turnId;
    if (stopped) { void interrupt(); return; }
    for (const item of turn.items ?? []) {
      if (!item.id || completed.has(item.id)) continue;
      if (item.type === 'agentMessage') {
        // Register phase before emitting deltas. Otherwise every streamed
        // commentary was permanently recorded as unphased answer text.
        for (const event of parser.handle('item/started', { threadId: id, item })) finish(event);
        const previous = texts.get(item.id) ?? '', text = item.text ?? '';
        if (text.startsWith(previous) && text.length > previous.length) {
          for (const event of parser.handle('item/agentMessage/delta', { threadId: id, itemId: item.id, delta: text.slice(previous.length) })) finish(event);
          texts.set(item.id, text);
        }
      } else if (!started.has(item.id)) {
        started.add(item.id);
        for (const event of parser.handle('item/started', { threadId: id, item })) finish(event);
      }
      if (turn.status !== 'inProgress' || turn.completedItemIds?.[item.id]) {
        completed.add(item.id);
        for (const event of parser.handle('item/completed', { threadId: id, item })) finish(event);
      }
    }
    const requests = (state.requests ?? []).filter((request: any) => request.params?.threadId === id && (!request.params.turnId || request.params.turnId === turnId));
    for (const [requestId, controller] of approvals) if (!requests.some((request: any) => request.id === requestId)) { controller.abort(); approvals.delete(requestId); }
    for (const request of requests) {
      if (handledApprovals.has(request.id)) continue;
      handledApprovals.add(request.id);
      const route = approvalRoutes[request.method];
      if (!route || !interact) {
        emit({ kind: 'tool_start', id: `desktop-question-${request.id}`, name: 'Decision needed in Codex desktop', input: { detail: 'This native desktop question is not yet supported by Ally. Open the same chat in Codex to answer.' } });
        continue;
      }
      const controller = new AbortController(); approvals.set(request.id, controller);
      void interact(request.method, { ...request.params, item: turn.items?.find((item: any) => item.id === request.params.itemId) }, controller.signal).then(async response => {
        if (controller.signal.aborted || finished || stopped) return;
        // Recheck the live owner's request before applying a user decision.
        const latest = await client!.snapshot(id, owner!);
        if (!latest.requests?.some((r: any) => r.id === request.id && r.method === request.method && r.params?.turnId === request.params.turnId)) return;
        await client!.request(route.method, { conversationId: id, requestId: request.id, [route.field]: route.field === 'decision' ? (response as any)?.decision : response }, owner);
      }).catch(error => { if (!controller.signal.aborted && !finished) emit({ kind: 'stderr', text: `Answer this request in Codex desktop: ${error instanceof Error ? error.message : error}` }); });
    }
    if (turn.status !== 'inProgress') {
      for (const event of parser.handle('turn/completed', { threadId: id, turn })) finish(event);
    }
  };
  void (async () => {
    try {
      if (!id || opts.ephemeral) throw new Error('Select an existing Codex desktop chat');
      if (opts.robot) throw new Error('Robot tools require the standard Codex connection; disable the desktop experiment for Robot mode');
      if (prepareOwner) await prepareOwner(() => stopped || finished);
      if (stopped || finished) { finish({ kind: 'done' }); return; }
      client = await CodexDesktopClient.connect();
      if (stopped || finished) { client.close(); finish({ kind: 'done' }); return; }
      owner = await client.owner(id);
      client.listeners.add(message => {
        if (message.method === 'client-status-changed' && message.params?.clientId === owner && message.params.status === 'disconnected') { fail(new Error('Codex desktop owner disconnected')); return; }
        if (message.method !== 'thread-stream-state-changed' || message.sourceClientId !== owner || message.params?.conversationId !== id || message.params.hostId !== 'local') return;
        try {
          if (message.version !== 11) throw new Error('Unsupported Codex desktop stream version');
          const change = message.params.change;
          if (change?.type === 'snapshot') { state = change.conversationState; revision = change.revision; }
          else if (change?.type === 'patches' && state && change.baseRevision === revision) {
            try { state = applyDesktopPatches(state, change.patches); revision = change.revision; }
            catch { refresh(); return; }
          }
          else { if (state) refresh(); return; }
          processState();
        } catch (error) { fail(error); }
      });
      state = await client.snapshot(id, owner);
      assertDesktopCanStart(state, id);
      priorEffort = state.latestReasoningEffort ?? null;
      priorModel = opts.model && opts.model !== 'default' ? opts.model : state.latestModel;
      if (stopped || finished) { finish({ kind: 'done' }); return; }
      emit({ kind: 'session', sessionId: id });
      emit({ kind: 'tool_start', id: 'ally-desktop-connection', name: 'Codex desktop', input: { detail: 'Continuing the same chat through its desktop connection' } });
      dispatched = true;
      let response;
      try {
        response = await client.request('thread-follower-start-turn', desktopTurnRequest(opts, messageId), owner, 20000);
      } catch (error) {
        // The router explicitly rejected delivery to a vanished client. Unlike
        // a timeout/disconnect this confirms no owner received this submission.
        // Account changes can replace the owner between discovery and start.
        if (!(error instanceof Error) || error.message !== 'no-client-found' || turnId || finished) throw error;
        dispatched = false;
        owner = await client.owner(id);
        state = await client.snapshot(id, owner);
        assertDesktopCanStart(state, id);
        priorEffort = state.latestReasoningEffort ?? null;
        priorModel = opts.model && opts.model !== 'default' ? opts.model : state.latestModel;
        if (stopped || finished) { finish({ kind: 'done' }); return; }
        emit({ kind: 'stderr', text: 'Codex connection changed. Reconnected to the same chat.' });
        dispatched = true;
        try { response = await client.request('thread-follower-start-turn', desktopTurnRequest(opts, messageId), owner, 20000); }
        catch (retryError) {
          if (retryError instanceof Error && retryError.message === 'no-client-found' && !turnId) {
            dispatched = false;
            throw new Error('The Codex account connection is still changing. Open this same chat in Codex and try again once it has loaded.');
          }
          throw retryError;
        }
      }
      const accepted = response.result?.result?.turn?.id;
      if (typeof accepted !== 'string' || (turnId && turnId !== accepted)) throw new Error('Desktop did not confirm the expected turn');
      turnId = accepted;
      emit({ kind: 'accepted', sessionId: id, turnId });
      if (finished) return;
      emit({ kind: 'tool_end', id: 'ally-desktop-connection', output: 'Connected to the existing chat' });
      if (stopped) { await interrupt(); return; }
      processState();
      if (finished) return;
      // Connectivity check only: no model runs. Streaming normally arrives as patches.
      heartbeat = setInterval(() => {
        if (refreshing || finished) return;
        refreshing = true;
        void client!.snapshot(id, owner!).catch(fail).finally(() => { refreshing = false; });
      }, 15000);
    } catch (error) {
      if (stopped && !dispatched) finish({ kind: 'done' });
      else if ((error instanceof CodexChatUnownedError || error instanceof CodexDesktopUnavailableError) && !dispatched && !finished && unowned) {
        client?.close(); client = undefined;
        try { fallback = unowned(finish); } catch (failure) { fail(failure); }
      } else fail(error);
    }
  })();
  return { setPermission: async permission => {
    if (finished || stopped) throw Error('This reply has finished; choose the access level again for the next message.');
    if (fallback) {
      if (!fallback.setPermission) return 'next_message';
      return fallback.setPermission(permission);
    }
    if (!client || !owner || !turnId) throw Error('Still connecting. Try changing access once the reply starts.');
    return updateDesktopAccess(client, owner, id, permission);
  }, steer: async (text, images) => {
    if (finished || stopped) throw new Error('This response has finished. Send your input as a new message.');
    if (fallback?.steer) return fallback.steer(text, images);
    if (!client || !owner || !turnId) return false;
    return steerDesktopTurn(client, owner, id, text, undefined, images);
  }, stop: () => {
    if (finished || stopped) return;
    stopped = true;
    if (fallback) { fallback.stop(); return; }
    for (const controller of approvals.values()) controller.abort();
    if (!dispatched) finish({ kind: 'done' });
    else if (turnId) void interrupt();
    // If start is in flight, wait for its response and interrupt only its exact ID.
  } };
}
