// Reverse-engineered local client coordination protocol, Codex 26.1013.3656.
// This connects as Ally, not as a native tool executor. It never creates a router.
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { codexAccessSettings, validateAccess, type AccessScope } from './access.js';
import type { AgentPermission } from './types.js';

const versions: Record<string, number> = {
  initialize: 0,
  'thread-owner-discovery': 1,
  'thread-follower-read-model-settings': 1,
  'thread-follower-update-thread-settings': 2,
  'thread-follower-load-complete-history': 1,
  'thread-follower-start-turn': 2,
  'thread-follower-steer-turn': 1,
  'thread-follower-interrupt-turn': 4,
  'thread-follower-command-approval-decision': 1,
  'thread-follower-file-approval-decision': 1,
  'thread-follower-permissions-request-approval-response': 1,
  'thread-follower-submit-user-input': 1,
  'thread-follower-submit-mcp-server-elicitation-response': 1,
};
const MAX_FRAME = 32 * 1024 * 1024;

export class CodexDesktopUnavailableError extends Error {
  constructor() { super('Codex desktop is not running'); }
}

export class CodexChatUnownedError extends Error {
  constructor() { super('This chat has no loaded Codex desktop owner'); }
}

export class CodexDesktopClient {
  pending = new Map<string, { resolve: (message: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; method: string; target?: string }>();
  listeners = new Set<(message: any) => void>();
  socket?: net.Socket;
  buffer = Buffer.alloc(0);
  clientId = 'initializing-client';
  closed = false;
  subscriptions = new Map<string, string>();

  static async connect() {
    if (process.platform !== 'win32') throw new Error('This diagnostic currently supports Windows only');
    const client = new CodexDesktopClient();
    try {
      await client.open();
      const response = await client.request('initialize', { clientType: 'ally' });
      if (typeof response.result?.clientId !== 'string') throw new Error('Invalid desktop initialization response');
      client.clientId = response.result.clientId;
      return client;
    } catch (error) {
      client.close();
      if (['ENOENT', 'ECONNREFUSED'].includes((error as NodeJS.ErrnoException).code ?? '')) throw new CodexDesktopUnavailableError();
      throw error;
    }
  }

  open() {
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => { reject(new Error('Codex desktop connection timed out')); this.close(); }, 3000);
      this.socket = net.createConnection('\\\\.\\pipe\\codex-ipc');
      this.socket.once('connect', () => { clearTimeout(timer); resolve(undefined); });
      this.socket.on('error', error => { clearTimeout(timer); reject(error); this.fail(error); });
      this.socket.on('close', () => { clearTimeout(timer); this.fail(new Error('Codex desktop disconnected')); });
      this.socket.on('data', chunk => {
        try {
          this.buffer = Buffer.concat([this.buffer, chunk]);
          while (this.buffer.length >= 4) {
            const size = this.buffer.readUInt32LE(0);
            if (size === 0 || size > MAX_FRAME) throw new Error('Unsupported desktop frame size');
            if (this.buffer.length < size + 4) return;
            const message = JSON.parse(this.buffer.subarray(4, size + 4).toString('utf8'));
            this.buffer = this.buffer.subarray(size + 4);
            if (message.type === 'response') {
              const pending = this.pending.get(message.requestId);
              if (!pending) continue;
              clearTimeout(pending.timer); this.pending.delete(message.requestId);
              if (message.resultType === 'error') pending.reject(new Error(message.error));
              else if (message.method !== pending.method || (pending.target && message.handledByClientId !== pending.target)) pending.reject(new Error('Unexpected desktop responder'));
              else pending.resolve(message);
            } else if (message.type === 'client-discovery-request') {
              this.write({ type: 'client-discovery-response', requestId: message.requestId, response: { canHandle: false } });
            } else if (message.type === 'broadcast') {
              if (message.targetClientIds && !message.targetClientIds.includes(this.clientId)) continue;
              for (const listener of this.listeners) listener(message);
            }
          }
        } catch (error) { this.fail(error); this.socket?.destroy(); }
      });
    });
  }

  write(message: any) {
    if (this.closed || !this.socket?.writable) throw new Error('Desktop connection is closed');
    const body = Buffer.from(JSON.stringify(message));
    if (body.length > MAX_FRAME) throw new Error('Desktop request too large');
    const frame = Buffer.alloc(4 + body.length);
    frame.writeUInt32LE(body.length, 0); body.copy(frame, 4);
    this.socket.write(frame);
  }

  request(method: string, params: any, target?: string, timeout = 5000): Promise<any> {
    if (!(method in versions)) return Promise.reject(new Error('Unsupported desktop operation'));
    const requestId = randomUUID();
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error(`Desktop ${method} timed out; outcome may be unknown. Do not automatically retry.`)); }, timeout);
      this.pending.set(requestId, { resolve, reject, timer, method, target });
      try {
        this.write({ type: 'request', requestId, sourceClientId: this.clientId, version: versions[method], method, params, targetClientId: target, timeoutMs: timeout });
      } catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error); }
    });
  }

  async owner(conversationId: string): Promise<string> {
    const response = await this.request('thread-owner-discovery', { hostId: 'local', conversationId }).catch(error => {
      if (error instanceof Error && error.message === 'no-client-found') throw new CodexChatUnownedError();
      throw error;
    });
    if (!response.handledByClientId || response.result?.supportsUntrustedAppInput !== true) throw new Error('Unsupported desktop owner');
    // Discovery can return Codex's cached loaded-conversation entry after an
    // account change. Snapshot broadcasts are cached too. This read uses the
    // same live-owner gate as start-turn, without submitting a user message.
    try {
      await this.request('thread-follower-read-model-settings', { conversationId }, response.handledByClientId);
    } catch (error) {
      if (error instanceof Error && error.message === 'no-client-found') throw new CodexChatUnownedError();
      throw error; // A timeout/disconnect is uncertain, never permission to send elsewhere.
    }
    return response.handledByClientId;
  }

  follow(conversationId: string, owner: string, following: boolean) {
    if (following) this.subscriptions.set(conversationId, owner);
    else this.subscriptions.delete(conversationId);
    this.write({ type: 'broadcast', sourceClientId: this.clientId, targetClientIds: [owner], method: 'thread-stream-following-changed', version: 1, params: { hostId: 'local', conversationId, following } });
  }

  snapshot(conversationId: string, owner: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.listeners.delete(listener); };
      const listener = (message: any) => {
        if (message.method !== 'thread-stream-state-changed' || message.sourceClientId !== owner || message.params?.conversationId !== conversationId || message.params.hostId !== 'local') return;
        if (message.version !== 11) { cleanup(); reject(new Error('Unsupported desktop stream version')); return; }
        const change = message.params.change;
        if (change?.type === 'snapshot') { cleanup(); resolve(change.conversationState); }
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Desktop snapshot timed out')); }, 5000);
      this.listeners.add(listener);
      try { this.follow(conversationId, owner, true); }
      catch (error) { cleanup(); reject(error); }
    });
  }

  fail(error: unknown) {
    const failure = error instanceof Error ? error : new Error(String(error));
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(failure); }
    this.pending.clear();
  }

  close() {
    if (this.closed) return;
    for (const [id, owner] of this.subscriptions) { try { this.follow(id, owner, false); } catch {} }
    this.closed = true;
    this.fail(new Error('Desktop client closed'));
    this.listeners.clear();
    this.socket?.destroy();
  }
}

export function desktopTurns(state: any): any[] {
  if (state.turnHistory?.kind === 'canonical') {
    const history = state.turnHistory.history;
    return history.islands.flatMap((island: any) => island.entries.map((entry: any) => history.entitiesByKey[entry.value])).filter(Boolean);
  }
  return state.turns ?? [];
}

export function assertDesktopIdle(state: any, conversationId: string) {
  if (state.id !== conversationId || state.threadRuntimeStatus?.type !== 'idle' || state.resumeState !== 'resumed'
    || (state.requests?.length ?? 0) > 0 || state.externalRequests?.some((request: any) => request.completedAtMs == null)
    || state.unconfirmedTurnSubmissions?.length || state.threadGoal?.status === 'active'
    || desktopTurns(state).some(turn => turn.status === 'inProgress')) {
    throw new Error('Desktop chat is busy, awaiting input, or its idle state cannot be confirmed');
  }
}

/** A failed provider request is terminal, not an active response. Keep strict
 * idle separate: background queues must not retry a provider failure. */
export function desktopFailureMessage(state: any): string | undefined {
  const last = desktopTurns(state).at(-1);
  if (state.threadRuntimeStatus?.type !== 'systemError' || last?.status !== 'failed') return;
  const detail = typeof last.error?.message === 'string' ? last.error.message : '';
  if (/API key budget exceeded/i.test(detail)) return 'The previous response failed because the API provider budget was exceeded. After fixing the budget, send your message again.';
  return detail ? `The previous response failed: ${detail.slice(0, 600)}` : 'The previous response failed in Codex. Check the error there, then send your message again.';
}

/** Only an explicit new send can recover a terminal systemError. Every other
 * guard (identity, resume, active turns, approvals, goals and uncertain sends)
 * still applies. Never change the native state or replay the failed prompt. */
export function assertDesktopCanStart(state: any, conversationId: string) {
  if (desktopFailureMessage(state)) {
    assertDesktopIdle({ ...state, threadRuntimeStatus: { type: 'idle' } }, conversationId);
    return;
  }
  assertDesktopIdle(state, conversationId);
}

/** Codex may decorate its display turn ID after reconnect; the underlying
 * app-server turn identity remains the prefix, as in the native client. */
export const canonicalTurnId = (id?: string): string | undefined => id?.replace(/-berry-display-\d+$/, '');

export async function readDesktopActivity(conversationId: string) {
  let client: CodexDesktopClient | undefined;
  try {
    client = await CodexDesktopClient.connect();
    const owner = await client.owner(conversationId);
    const state = await client.snapshot(conversationId, owner);
    if (state.id !== conversationId) return undefined;
    const turn = desktopTurns(state).at(-1);
    let idle = false, canStart = false;
    try { assertDesktopIdle(state, conversationId); idle = true; } catch {}
    try { assertDesktopCanStart(state, conversationId); canStart = true; } catch {}
    return { turnId: canonicalTurnId(turn?.turnId), running: turn?.status === 'inProgress', idle, canStart, error: desktopFailureMessage(state) };
  } catch { return undefined; }
  finally { client?.close(); }
}

export async function steerDesktopTurn(client: CodexDesktopClient, owner: string, conversationId: string, text: string, messageId: string = randomUUID(), images?: string[]) {
  const state = await client.snapshot(conversationId, owner);
  const turn = desktopTurns(state).at(-1);
  if (state.id !== conversationId || turn?.status !== 'inProgress' || !turn.turnId) throw new Error('This response has finished. Your draft is kept.');
  const result = await client.request('thread-follower-steer-turn', {
    conversationId, clientUserMessageId: messageId,
    input: [{ type: 'text', text, text_elements: [] }, ...(images ?? []).map(path => ({ type: 'localImage', path }))],
    restoreMessage: { text, cwd: state.cwd, context: {} }, attachments: [],
  }, owner, 20000);
  if (canonicalTurnId(result.result?.result?.turnId) !== canonicalTurnId(turn.turnId)) throw new Error('Steering was not confirmed for the expected turn. Check this chat before resending.');
  return true;
}

export async function steerExternalDesktopChat(sessionId: string, text: string, requestId: string, images?: string[]) {
  const client = await CodexDesktopClient.connect();
  try { return await steerDesktopTurn(client, await client.owner(sessionId), sessionId, text, requestId, images); }
  finally { client.close(); }
}

/** Use the same permission update route as the native client. No turn submission. */
export async function updateDesktopAccess(client: CodexDesktopClient, owner: string, conversationId: string, permission: AgentPermission): Promise<AccessScope> {
  validateAccess(permission);
  const state = await client.snapshot(conversationId, owner);
  if (state.id !== conversationId || typeof state.cwd !== 'string' || !state.cwd) throw Error('Chat access could not be verified');
  const turn = desktopTurns(state).at(-1);
  const activeTurnId = turn?.status === 'inProgress' ? canonicalTurnId(turn.turnId) : undefined;
  if (turn?.status === 'inProgress' && !activeTurnId) throw Error('Active reply identity unavailable; access was not changed');
  const response = await client.request('thread-follower-update-thread-settings', {
    conversationId, threadSettings: codexAccessSettings(permission, state.cwd), ...(activeTurnId ? { activeTurnId } : {}),
  }, owner, 20000);
  if (response.result?.method !== 'thread-follower-update-thread-settings' || response.result?.result?.applied !== true) throw Error('Codex did not confirm the access change. Check the chat before retrying.');
  return activeTurnId ? 'current_reply' : 'next_message';
}

export async function updateExternalDesktopAccess(sessionId: string, permission: AgentPermission): Promise<AccessScope> {
  let client: CodexDesktopClient | undefined;
  try { client = await CodexDesktopClient.connect(); return await updateDesktopAccess(client, await client.owner(sessionId), sessionId, permission); }
  catch (error) { if (error instanceof CodexChatUnownedError || error instanceof CodexDesktopUnavailableError) return 'next_message'; throw error; }
  finally { client?.close(); }
}
