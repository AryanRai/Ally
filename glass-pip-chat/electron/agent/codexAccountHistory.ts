import { createHash } from 'node:crypto';
import { CodexRpc } from './codexRpc.js';
import { codexAccounts, useCodexProfile } from './codexAccounts.js';
import { cooperativeCodexHistoryMessages } from './codexHistory.js';
import { internalCodexSource, rememberCodexThread } from './codexDiscovery.js';
import { chatTitle, isDeviceProtocolTitle } from './chatTitle.js';
import { isManagedSessionRunning } from './runningSessions.js';
import type { AgentSessionSnapshot, AgentSessionSummary } from './types.js';

class ProfileSignedOut extends Error {}

async function withProfile<T>(id: string, binary: string | undefined, read: (rpc: CodexRpc) => Promise<T>): Promise<T> {
  codexAccounts.require(id);
  const release = useCodexProfile(id);
  let rpc: CodexRpc | undefined;
  try {
    rpc = await CodexRpc.connect(binary, codexAccounts.home(id));
    const { account } = await rpc.request('account/read', { refreshToken: false }, 8000);
    if (!account) {
      codexAccounts.observe({ id, state: 'signed_out', checkedAt: Date.now(), windows: [] });
      throw new ProfileSignedOut('Sign into this Codex profile in Ally Settings.');
    }
    if (account.type !== 'chatgpt') throw Error('Sign into this Codex profile with ChatGPT in Ally Settings.');
    codexAccounts.verifyIdentity(id, account.email);
    return await read(rpc);
  } finally { rpc?.close(); release(); }
}

export async function listProfileChatsPage(id: string, binary: string | undefined, limit: number, cursor?: string): Promise<{ sessions: AgentSessionSummary[]; nextCursor?: string }> {
  return withProfile(id, binary, async rpc => {
    const page = await rpc.request('thread/list', { limit, cursor, sortKey: 'updated_at', sourceKinds: ['cli', 'vscode', 'appServer', 'exec'] }, 8000);
    if (page.nextCursor && page.nextCursor === cursor) throw Error('Codex returned a repeated chat cursor.');
    for (const thread of page.data) rememberCodexThread(thread);
    const threads = page.data.filter((t: any) => !internalCodexSource(t));
    codexAccounts.bindMany(threads.map((t: any) => t.id), id);
    return { sessions: threads.map((t: any) => {
      return { provider: 'codex', id: t.id, codexAccountId: id, title: chatTitle(t.name || t.preview || 'Codex chat'), cwd: t.cwd,
        createdAt: (t.createdAt ?? 0) * 1000, updatedAt: t.updatedAt * 1000 };
    }), nextCursor: page.nextCursor || undefined };
  }).catch(error => { if (error instanceof ProfileSignedOut) return { sessions: [] }; throw error; });
}

/** Read-only and complete pagination; never resume/fork or use another profile on failure. */
export async function loadProfileChat(id: string, binary: string | undefined, threadId: string, previousRevision?: string): Promise<AgentSessionSnapshot> {
  if ((codexAccounts.owner(threadId) ?? 'default') !== id) throw Error('Codex account affinity mismatch.');
  return withProfile(id, binary, async rpc => {
    const thread = (await rpc.request('thread/read', { threadId }, 8000)).thread;
    const turns: any[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    if (thread.historyMode === 'paginated') {
      do {
        const page = await rpc.request('thread/turns/list', { threadId, limit: 20, cursor, sortDirection: 'asc', itemsView: 'full' }, 8000);
        for (const turn of page.data) {
          if (turn.itemsView !== 'full') {
            turn.items = [];
            let itemCursor: string | undefined;
            const itemSeen = new Set<string>();
            do {
              const items = await rpc.request('thread/items/list', { threadId, turnId: turn.id, limit: 20, cursor: itemCursor }, 8000);
              turn.items.push(...items.data.map((entry: any) => entry.item));
              itemCursor = items.nextCursor || undefined;
              if (itemCursor && itemSeen.has(itemCursor)) throw Error('Codex returned a repeated history cursor.');
              if (itemCursor) itemSeen.add(itemCursor);
            } while (itemCursor);
          }
          turns.push(turn);
        }
        cursor = page.nextCursor || undefined;
        if (cursor && seen.has(cursor)) throw Error('Codex returned a repeated history cursor.');
        if (cursor) seen.add(cursor);
      } while (cursor);
    } else turns.push(...((await rpc.request('thread/read', { threadId, includeTurns: true }, 8000)).thread.turns ?? []));
    const running = isManagedSessionRunning('codex', threadId) || thread.status?.type === 'active' || turns.some(t => t.status === 'inProgress');
    const revision = createHash('sha256').update(JSON.stringify([id, threadId, thread.name, thread.cwd, turns, running])).digest('hex');
    return { codexAccountId: id, sessionId: threadId, title: thread.name, cwd: thread.cwd, createdAt: (thread.createdAt ?? 0) * 1000,
      revision, running, unchanged: revision === previousRevision,
      messages: revision === previousRevision ? [] : await cooperativeCodexHistoryMessages(turns, (thread.createdAt ?? 0) * 1000) };
  });
}

/** Legacy device title repair still uses the owning profile and its identity check. */
export async function repairProfileTitle(id: string, binary: string | undefined, threadId: string, title: string): Promise<void> {
  if ((codexAccounts.owner(threadId) ?? 'default') !== id) throw Error('Codex account affinity mismatch.');
  await withProfile(id, binary, async rpc => {
    const { thread } = await rpc.request('thread/read', { threadId }, 8000);
    if (thread.name && !isDeviceProtocolTitle(thread.name)) return;
    if (!isDeviceProtocolTitle(thread.preview ?? '') && !isDeviceProtocolTitle(thread.name ?? '')) return;
    await rpc.request('thread/name/set', { threadId, name: chatTitle(title) });
  });
}

export async function readProfileMetadata(id: string, binary: string | undefined, threadId: string): Promise<any> {
  if ((codexAccounts.owner(threadId) ?? 'default') !== id) throw Error('Codex account affinity mismatch.');
  return withProfile(id, binary, async rpc => (await rpc.request('thread/read', { threadId }, 8000)).thread);
}
