import { createHash } from 'node:crypto';
import { CodexDesktopClient, desktopTurns } from './codexDesktop.js';
import { approvalRoutes } from './codexApprovalRoutes.js';
import { desktopInteraction } from './desktopApprovals.js';
import { isManagedSessionRunning, listRunningSessions } from './runningSessions.js';
import { chatSelection } from './selection.js';
import type { AgentInteractionHandler } from './types.js';

const signature = (request: any) => createHash('sha256').update(JSON.stringify([request.id, request.method, request.params])).digest('hex');
type Entry = { controller: AbortController; signature: string; owner: string };

export async function answerNativeRequest(client: CodexDesktopClient, id: string, expectedOwner: string, request: any, response: unknown, signal: AbortSignal) {
  const owner = await client.owner(id);
  if (owner !== expectedOwner || signal.aborted) return;
  const latest = await client.snapshot(id, owner);
  if (signal.aborted || latest.id !== id || !latest.requests?.some((r: any) => r.completed !== true && signature(r) === signature(request))) return;
  const route = approvalRoutes[request.method];
  if (!route) return;
  await client.request(route.method, { conversationId: id, requestId: request.id, [route.field]: route.field === 'decision' ? (response as any)?.decision : response }, owner);
}

/** Observe existing owners only. Never starts, resumes or retries a user turn. */
export class NativeDesktopApprovals {
  private pending = new Map<string, Entry>();
  private seen = new Map<string, string>();
  constructor(private interact: (chatId: string) => AgentInteractionHandler = chatId => desktopInteraction(() => chatId)) {}
  clear(id: string) {
    for (const [key, entry] of this.pending) if (key.startsWith(id + ':')) { entry.controller.abort(); this.pending.delete(key); }
    for (const key of this.seen.keys()) if (key.startsWith(id + ':')) this.seen.delete(key);
  }
  retain(ids: string[]) { for (const key of this.pending.keys()) { const id = key.split(':')[0]; if (!ids.includes(id)) this.clear(id); } }
  close() { for (const entry of this.pending.values()) entry.controller.abort(); this.pending.clear(); this.seen.clear(); }
  observe(id: string, owner: string, state: any, answer: (request: any, response: unknown, signal: AbortSignal) => Promise<void>) {
    if (state.id !== id) { this.clear(id); return; }
    const requests = (state.requests ?? []).filter((r: any) => r.completed !== true && r.params?.threadId === id && approvalRoutes[r.method]);
    const current = new Map<string, any>(requests.map((r: any) => [id + ':' + r.id, r]));
    for (const [key, entry] of this.pending) if (key.startsWith(id + ':') && (entry.owner !== owner || !current.has(key) || signature(current.get(key)) !== entry.signature)) {
      entry.controller.abort(); this.pending.delete(key);
    }
    for (const [key, request] of current) {
      const fingerprint = owner + ':' + signature(request);
      if (this.seen.get(key) === fingerprint) continue;
      this.seen.set(key, fingerprint);
      while (this.seen.size > 512) this.seen.delete(this.seen.keys().next().value!);
      const controller = new AbortController(), entry = { controller, signature: signature(request), owner };
      this.pending.set(key, entry);
      const item = desktopTurns(state).flatMap(turn => turn.items ?? []).find(item => item.id === request.params.itemId);
      void this.interact('codex:' + id)(request.method, { ...request.params, item }, controller.signal).then(async response => {
        if (!controller.signal.aborted) await answer(request, response, controller.signal);
      }).catch(error => {
        if (!controller.signal.aborted) console.warn('[native-approval] Answer this request in Codex desktop:', error instanceof Error ? error.message : 'Request unavailable');
      }).finally(() => { if (this.pending.get(key) === entry) this.pending.delete(key); });
    }
  }
}

export function startNativeDesktopApprovals(enabled: () => boolean) {
  const mirror = new NativeDesktopApprovals();
  let stopped = false, client: CodexDesktopClient | undefined, timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    try {
      if (!enabled()) { mirror.close(); client?.close(); client = undefined; return; }
      const running = await listRunningSessions();
      const selected = chatSelection.snapshot().selected;
      const ids = [...new Set([...(selected?.provider === 'codex' ? [selected.sessionId] : []), ...running.filter(s => s.provider === 'codex').map(s => s.id)])].filter((id): id is string => !!id).slice(0, 24);
      mirror.retain(ids);
      if (stopped) return;
      if (!client || client.closed || client.socket?.destroyed) { mirror.close(); client?.close(); client = await CodexDesktopClient.connect(); }
      if (stopped) { client.close(); return; }
      const current = client;
      for (const id of ids) {
        if (stopped) break;
        // Managed turns already have their own request bridge.
        if (isManagedSessionRunning('codex', id)) { mirror.clear(id); continue; }
        let owner: string | undefined;
        try {
          owner = await current.owner(id);
          const state = await current.snapshot(id, owner);
          if (stopped) break;
          const expectedOwner = owner;
          mirror.observe(id, owner, state, async (request, response, signal) => {
            const fresh = await CodexDesktopClient.connect();
            try {
              await answerNativeRequest(fresh, id, expectedOwner, request, response, signal);
            } finally { fresh.close(); }
          });
        } catch { mirror.clear(id); }
        finally { if (owner) try { current.follow(id, owner, false); } catch {} }
      }
    } catch { mirror.close(); client?.close(); client = undefined; }
    finally { if (!stopped) timer = setTimeout(tick, 2000); }
  };
  void tick();
  return () => { stopped = true; clearTimeout(timer); mirror.close(); client?.close(); };
}
