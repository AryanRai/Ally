// Codex desktop 26.1013: reuse its existing v3 unread broadcast. Never edit
// Codex's database or global state. Unsupported versions keep Ally receipts.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CodexDesktopClient, desktopTurns, canonicalTurnId } from './codexDesktop.js';
import { nativeUnread, nativeUnreadSnapshot } from './unread.js';

type Context = { identity: { kind: string }; executionHostKey: string };
let client: CodexDesktopClient | undefined;
const contexts = new Map<string, Context>();
const generations = new Map<string, number>();
export function acceptNativeUnread(message: any): boolean {
  const p = message.params;
  if (message.method !== 'thread-read-state-changed' || message.version !== 3 || p?.hostId !== 'local'
    || typeof p.conversationId !== 'string' || typeof p.hasUnreadTurn !== 'boolean'
    || typeof p.context?.executionHostKey !== 'string' || !p.context.executionHostKey.startsWith('local:')
    || typeof p.context.identity?.kind !== 'string') return false;
  generations.set(p.conversationId, (generations.get(p.conversationId) ?? 0) + 1);
  contexts.set(p.conversationId, p.context);
  nativeUnread(p.conversationId, p.hasUnreadTurn);
  return true;
}
export function acknowledgeNativeUnread(id: string) {
  const context = contexts.get(id);
  if (!context || !client || client.closed) return;
  try { client.write({ type: 'broadcast', sourceClientId: client.clientId,
    method: 'thread-read-state-changed', version: 3,
    params: { hostId: 'local', conversationId: id, hasUnreadTurn: false, context } }); } catch { /* Ally receipt remains durable. */ }
}
/** Candidate IDs are only hints; a live owner snapshot must confirm unread.
 * This avoids mixing persisted state from other signed-in identities/hosts. */
async function seed(current: CodexDesktopClient) {
  let ids: string[] = [];
  try {
    const state = JSON.parse(await fs.readFile(path.join(os.homedir(), '.codex', '.codex-global-state.json'), 'utf8'))['electron-thread-read-state-v1'];
    ids = [...new Set(Object.values(state?.unreadByIdentity ?? {}).flatMap((hosts: any) => Object.entries(hosts).filter(([key]) => key.startsWith('local:')).flatMap(([, value]) => Array.isArray(value) ? value.filter(v => typeof v === 'string') : [])))].slice(0, 100) as string[];
  } catch { return; }
  for (const id of ids) {
    if (current.closed || client !== current) break;
    await reconcileNativeUnread(id);
  }
}
/** Confirm the owner's current flag and turn, rather than infer unread from a file timestamp. */
export async function reconcileNativeUnread(id: string): Promise<boolean> {
  const current = client;
  if (!current || current.closed || current.socket?.destroyed) return false;
  const generation = generations.get(id) ?? 0;
  let owner: string | undefined;
  try {
    owner = await current.owner(id);
    const state = await current.snapshot(id, owner);
    if (client !== current || state.id !== id || typeof state.hasUnreadTurn !== 'boolean') return false;
    // A newer broadcast wins over an earlier snapshot still in flight.
    if ((generations.get(id) ?? 0) === generation) nativeUnreadSnapshot(id, state.hasUnreadTurn, canonicalTurnId(desktopTurns(state).at(-1)?.turnId) ?? `updated:${state.updatedAt}`);
    return true;
  } catch { return false; }
  finally { if (owner) try { current.follow(id, owner, false); } catch { /* Socket closed. */ } }
}
export function startNativeUnread() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const connect = async () => {
    try {
      if (!client || client.closed || client.socket?.destroyed) {
        client?.close(); contexts.clear(); generations.clear();
        const next = await CodexDesktopClient.connect();
        if (stopped) { next.close(); return; }
        client = next; next.listeners.add(acceptNativeUnread);
        void seed(next);
      }
    } catch { /* Native app may be closed. No writer or model request. */ }
    if (!stopped) timer = setTimeout(connect, 5000);
  };
  void connect();
  return () => { stopped = true; clearTimeout(timer); client?.close(); client = undefined; contexts.clear(); generations.clear(); };
}
