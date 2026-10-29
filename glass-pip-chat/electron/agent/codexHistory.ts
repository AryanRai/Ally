import { configureDiscoveryReader, rememberCodexThread, hiddenConversation } from './codexDiscovery.js';
import { canonicalTurnId, readDesktopActivity } from './codexDesktop.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { localImageDataUrl } from './imageFile.js';
import { CodexRpc } from './codexRpc.js';
import { sharedCodexHome } from './codexAccounts.js';
import { CodexLocalHistory } from './codexLocalHistory.js';
import { CodexPaginatedHistory } from './codexPaginatedHistory.js';
import { CodexBranchTurns, mergeBranchMessages } from './codexBranchTurns.js';
import { CodexEventParser } from './codexEvents.js';
import { codexMigrationAliases, mappedCodexSession } from './codexMigration.js';
import { thumbnails } from './thumbs.js';
import { readCodexActivity } from './codexActivity.js';
import { isManagedSessionRunning } from './runningSessions.js';
import { chatTitle, isDeviceProtocolTitle } from './chatTitle.js';
import { codexTurnsPending } from './sessionActivity.js';
import type { AgentHistoryMessage, AgentSessionSnapshot, AgentSessionSummary, AgentToolExecution } from './types.js';

/** Strip the \\?\ extended-path prefix Windows sometimes stores in thread.cwd. */
const normalizeCwd = (cwd: unknown): string | undefined =>
  typeof cwd === 'string' ? cwd.replace(/^\\\\\?\\/, '') : undefined;

// List timeouts must not close a user's in-flight chat/history read.
type ReadLane = 'list' | 'history' | 'metadata';
const connections: Partial<Record<ReadLane, Promise<CodexRpc>>> = {};
let binary: string | undefined;
export function configureCodexHistory(bin?: string) {
  if (bin !== binary) { closeCodexHistory(); binary = bin; }
}
export function closeCodexHistory() {
  nativeTurns.clear();
  for (const lane of ['list', 'history', 'metadata'] as const) {
    const old = connections[lane]; delete connections[lane];
    void old?.then(rpc => rpc.close()).catch(() => {});
  }
}
async function reader(lane: ReadLane = 'history'): Promise<CodexRpc> {
  if (!connections[lane]) {
    const opening = CodexRpc.connect(binary, sharedCodexHome()).then(rpc => {
      rpc.onClose = () => { if (connections[lane] === opening) delete connections[lane]; };
      return rpc;
    }).catch(error => { if (connections[lane] === opening) delete connections[lane]; throw error; });
    connections[lane] = opening;
  }
  return connections[lane]!;
}

/** A timed-out browsing pipe must not poison every later desktop/device refresh. */
async function historyRead(rpc: CodexRpc, method: string, params: unknown, lane: ReadLane = method === 'thread/list' ? 'list' : 'history') {
  try { return await rpc.request(method, params, 8000); }
  catch (error) {
    if (error instanceof Error && /timed out|connection.*closed|app-server closed/i.test(error.message)) {
      const current = connections[lane];
      if (current && await current.catch(() => undefined) === rpc && connections[lane] === current) {
        delete connections[lane];
        rpc.close();
      }
    }
    throw error;
  }
}

// Background receipt classification must not cancel a foreground chat open.
// Every account shares one history (codexAccounts.shareCodexHistory), so reads never depend on the account.
configureDiscoveryReader(async id => (await historyRead(await reader('metadata'), 'thread/read', { threadId: id }, 'metadata')).thread);

export async function listCodexChats(limit = 40): Promise<AgentSessionSummary[]> {
  const sessions: AgentSessionSummary[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await listCodexChatsPage(Math.min(80, limit - sessions.length), cursor);
    for (const session of page.sessions) if (!seen.has(session.id)) { seen.add(session.id); sessions.push(session); }
    cursor = page.nextCursor;
  } while (cursor && sessions.length < limit);
  return sessions;
}

async function listDefaultCodexChatsPage(limit = 30, startCursor?: string): Promise<{ sessions: AgentSessionSummary[]; nextCursor?: string }> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 80) throw Error('Invalid chat page size');
  const rpc = await reader('list');
  const aliases = codexMigrationAliases();
  const originals = Object.fromEntries(Object.entries(aliases).map(([old, target]) => [target, old]));
  const result: AgentSessionSummary[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = startCursor;
  const cursors = new Set<string>(startCursor ? [startCursor] : []);
  do {
    const page = await historyRead(rpc, 'thread/list', {
      // Large native pages can stall the Windows app-server; follow its cursors.
      limit: Math.min(5, Math.max(1, limit - result.length)), cursor, sortKey: 'updated_at',
      // Include old exec chats for compatibility, but omit subagent/background threads.
      sourceKinds: ['cli', 'vscode', 'appServer', 'exec'],
    });
    for (const t of page.data) {
      rememberCodexThread(t);
      if (hiddenConversation('codex', t.id)) continue;
      if (aliases[t.id] || seen.has(t.id)) continue;
      seen.add(t.id);
      result.push({ provider: 'codex', id: t.id, title: chatTitle(t.name || t.preview || 'Codex chat'),
        cwd: normalizeCwd(t.cwd), createdAt: (t.createdAt ?? 0) * 1000, updatedAt: t.updatedAt * 1000, originalSessionId: originals[t.id] });
      if (result.length >= limit) return { sessions: result, nextCursor: page.nextCursor || undefined };
    }
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw Error('Codex returned a repeated chat cursor. Retry loading chats.');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return { sessions: result };
}

/** One shared history lists every account's chats once; a chat's account is tracked separately. */
const listingLoads = new Map<string, Promise<{ sessions: AgentSessionSummary[]; nextCursor?: string }>>();
export function listCodexChatsPage(limit = 30, cursor?: string): Promise<{ sessions: AgentSessionSummary[]; nextCursor?: string }> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 80) return Promise.reject(Error('Invalid chat page size'));
  // Cursors from the earlier per-account directory start again from the shared list.
  const start = cursor?.startsWith('profiles:') ? undefined : cursor;
  const key = JSON.stringify([limit, start]);
  const existing = listingLoads.get(key);
  if (existing) return existing;
  const work = listDefaultCodexChatsPage(limit, start).finally(() => {
    if (listingLoads.get(key) === work) listingLoads.delete(key);
  });
  listingLoads.set(key, work);
  return work;
}

const localHistory = new CodexLocalHistory();
const paginatedHistory = new CodexPaginatedHistory();
const branchTurns = new CodexBranchTurns(path.join(sharedCodexHome(), 'sessions'));
const historyLoads = new Map<string, Promise<AgentSessionSnapshot>>();
const nativeTurns = new Map<string, { fingerprint: string; turns: any[]; snapshot?: AgentSessionSnapshot }>();
/** Repeated desktop/device reads share one immutable load; each caller owns its receipt/revision. */
export async function loadCodexChat(id: string, previousRevision?: string): Promise<AgentSessionSnapshot> {
  const sessionId = mappedCodexSession(id);
  let work = historyLoads.get(sessionId);
  if (!work) {
    work = (async () => {
      const local = await localHistory.read(sessionId).catch(() => undefined);
      if (local) {
        const running = isManagedSessionRunning('codex', sessionId) || !!local.running;
        return { ...local, running, revision: `${local.revision}:${running}`, ...(sessionId !== id ? { originalSessionId: id } : {}) };
      }
      return loadNativeCodexChat(id);
    })().finally(() => { if (historyLoads.get(sessionId) === work) historyLoads.delete(sessionId); });
    historyLoads.set(sessionId, work);
  }
  const loaded = await work;
  const result = { ...loaded, originalSessionId: sessionId !== id ? id : undefined };
  return result.revision === previousRevision ? { ...result, unchanged: true, messages: [] } : result;
}
/** Native fallback: no thread/resume here, browsing must not own a writer. */
async function loadNativeCodexChat(id: string, previousRevision?: string): Promise<AgentSessionSnapshot> {
  const rpc = await reader();
  const sessionId = mappedCodexSession(id);
  const thread = (await historyRead(rpc, 'thread/read', { threadId: sessionId })).thread;
  rememberCodexThread(thread);
  const stat = typeof thread.path === 'string' ? await fs.stat(thread.path).catch(() => undefined) : undefined;
  const fingerprint = stat ? JSON.stringify([thread.path, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, thread.updatedAt, thread.name, thread.cwd]) : undefined;
  const cached = fingerprint && nativeTurns.get(sessionId)?.fingerprint === fingerprint ? nativeTurns.get(sessionId) : undefined;
  const turns: any[] = cached ? [...cached.turns.slice(0, -1), ...(cached.turns.length ? [{ ...cached.turns.at(-1) }] : [])] : [];
  if (!cached && thread.historyMode === 'paginated') {
    let cursor: string | undefined;
    do {
      const page = await historyRead(rpc, 'thread/turns/list', { threadId: sessionId, limit: 20, cursor, sortDirection: 'asc', itemsView: 'full' });
      for (const turn of page.data) {
        if (turn.itemsView !== 'full') {
          turn.items = [];
          let itemCursor: string | undefined;
          do {
            const items = await historyRead(rpc, 'thread/items/list', { threadId: sessionId, turnId: turn.id, limit: 5, cursor: itemCursor });
            turn.items.push(...items.data.map((entry: any) => entry.item));
            itemCursor = items.nextCursor;
          } while (itemCursor);
        }
        turns.push(turn);
      }
      cursor = page.nextCursor;
    } while (cursor);
  } else if (!cached) {
    turns.push(...(await historyRead(rpc, 'thread/read', { threadId: sessionId, includeTurns: true })).thread.turns);
  }
  const suffix = thread.historyMode === 'paginated' ? await paginatedHistory.read(sessionId, thread.path).catch(() => undefined) : undefined;
  const activity = await readCodexActivity(thread.path).catch(() => undefined);
  const managed = isManagedSessionRunning('codex', sessionId);
  const last = turns.at(-1);
  const live = !suffix?.turnIds.size && last?.status === 'interrupted' && !(activity?.pending && activity.recent && canonicalTurnId(last.id) === canonicalTurnId(activity.turnId)) ? await readDesktopActivity(sessionId) : undefined;
  // Only correct the matching active turn. Never erase an earlier real Stop.
  if (last?.status === 'interrupted' && ((activity?.pending && (activity.recent || managed) && canonicalTurnId(last.id) === canonicalTurnId(activity.turnId)) || (live?.running && canonicalTurnId(last.id) === live.turnId))) last.status = 'inProgress';
  const running = managed || (suffix?.turnIds.size ? !!(activity?.pending && activity.recent) : live?.running === true || codexTurnsPending(turns));
  const known = new Set<string>([...turns.map(t => canonicalTurnId(t.id)!), ...(suffix?.turnIds ?? [])].filter(Boolean));
  const branches = await branchTurns.read(sessionId, thread.path, known).catch(() => undefined);
  const revision = createHash('sha256').update(JSON.stringify([sessionId, thread.name, thread.cwd, fingerprint ?? turns, running, branches?.revision])).digest('hex');
  const identity = { createdAt: (thread.createdAt ?? 0) * 1000, sessionId, title: thread.name ? chatTitle(thread.name) : undefined, ...(sessionId !== id ? { originalSessionId: id } : {}) };
  if (revision === previousRevision) return { ...identity, cwd: normalizeCwd(thread.cwd), revision, unchanged: true, messages: [], running };
  const baseTurns = suffix?.turnIds.size ? turns.filter(t => !suffix.turnIds.has(canonicalTurnId(t.id)!)) : turns;
  const snapshot = { ...identity, cwd: normalizeCwd(suffix?.cwd ?? thread.cwd), revision, running, messages: cached?.snapshot?.revision === revision ? cached.snapshot.messages : mergeBranchMessages([...await cooperativeCodexHistoryMessages(baseTurns, thread.createdAt * 1000), ...(suffix?.messages ?? [])], branches?.messages ?? []) };
  if (fingerprint) {
    const after = await fs.stat(thread.path).catch(() => undefined);
    if (after && stat && after.size === stat.size && after.mtimeMs === stat.mtimeMs && after.ctimeMs === stat.ctimeMs) {
      nativeTurns.delete(sessionId); nativeTurns.set(sessionId, { fingerprint, turns, snapshot });
      while (nativeTurns.size > 8) nativeTurns.delete(nativeTurns.keys().next().value!);
    }
  }
  return snapshot;
}

/** Image decoding is synchronous in Electron. Bound accumulated work between
 * native items so a long transcript cannot monopolize the main event loop. */
export async function cooperativeCodexHistoryMessages(turns: any[], createdAt: number): Promise<AgentHistoryMessage[]> {
  const iterator = codexHistorySteps(turns, createdAt);
  let deadline = performance.now() + 8;
  let next = iterator.next();
  while (!next.done) {
    if (performance.now() >= deadline) {
      await new Promise<void>(resolve => setImmediate(resolve));
      deadline = performance.now() + 8;
    }
    next = iterator.next();
  }
  return next.value;
}

function userImages(content: any[]): string[] {
  const images: string[] = [];
  for (const c of content) {
    if (c.type === 'image' && c.url?.startsWith('data:')) images.push(c.url);
    if (c.type === 'localImage' && c.path) {
      const image = localImageDataUrl(c.path);
      if (image) images.push(image);
    }
  }
  return images;
}

export function codexHistoryMessages(turns: any[], createdAt: number): AgentHistoryMessage[] {
  const iterator = codexHistorySteps(turns, createdAt);
  let next = iterator.next();
  while (!next.done) next = iterator.next();
  return next.value;
}

function* codexHistorySteps(turns: any[], createdAt: number): Generator<void, AgentHistoryMessage[]> {
  const messages: AgentHistoryMessage[] = [];
  for (const turn of turns) {
    const ts = turn.startedAt ? turn.startedAt * 1000 : createdAt;
    const parser = new CodexEventParser('history');
    let assistant: AgentHistoryMessage | undefined;
    const tools = new Map<string, AgentToolExecution>();
    for (const item of turn.items ?? []) {
      yield;
      if (item.type === 'userMessage') {
        assistant = undefined;
        const content = item.content ?? [];
        messages.push({ role: 'user', content: content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n'), timestamp: ts, images: thumbnails(userImages(content)) });
        continue;
      }
      for (const ev of parser.handle(turn.status === 'inProgress' && item.status === 'inProgress' && !['agentMessage', 'reasoning'].includes(item.type) ? 'item/started' : 'item/completed', { item })) {
        if (!assistant) { assistant = { role: 'assistant', content: '', timestamp: ts, segments: [] }; messages.push(assistant); }
        if (ev.kind === 'text' || ev.kind === 'thinking') {
          const type = ev.kind;
          const last = assistant.segments!.at(-1);
          const metadata = ev.kind === 'text' ? { itemId: ev.itemId, phase: ev.phase } : {};
          if (last?.type === type && (type !== 'text' || last.itemId === metadata.itemId)) last.content = (last.content ?? '') + ev.text;
          else assistant.segments!.push({ type, content: ev.text, ...metadata });
          if (type === 'text') assistant.content += ev.text;
        } else if (ev.kind === 'tool_start') {
          const tool: AgentToolExecution = { id: ev.id, name: ev.name, parameters: ev.input, status: 'executing', startTime: ts };
          tools.set(ev.id, tool); assistant.segments!.push({ type: 'tool', toolExecution: tool });
        } else if (ev.kind === 'tool_end') {
          const tool = tools.get(ev.id);
          if (tool) Object.assign(tool, { status: ev.isError ? 'error' : 'success', result: ev.output, error: ev.isError ? ev.output : undefined, images: thumbnails(ev.images), endTime: (turn.completedAt ?? turn.startedAt) * 1000 || ts });
        }
      }
    }
    if (turn.status === 'interrupted') {
      if (!assistant) { assistant = { role: 'assistant', content: '', timestamp: ts, segments: [] }; messages.push(assistant); }
      assistant.content = `${assistant.content.trim()}\n\n⏹️ Stopped`.trim();
      assistant.segments!.push({ type: 'text', content: '⏹️ Stopped' });
    }
    if (assistant && turn.durationMs != null) assistant.usage = { durationMs: turn.durationMs };
  }
  for (const m of messages) m.content = m.content.trim();
  return messages;
}

/** Explicit metadata repair for linked device chats; never used by history polling. */
export async function repairCodexDeviceTitle(id: string, title: string): Promise<void> {
  const rpc = await reader();
  const { thread } = await rpc.request('thread/read', { threadId: mappedCodexSession(id) });
  if (thread.name && !isDeviceProtocolTitle(thread.name)) return;
  if (!isDeviceProtocolTitle(thread.preview ?? '') && !isDeviceProtocolTitle(thread.name ?? '')) return;
  await rpc.request('thread/name/set', { threadId: thread.id ?? mappedCodexSession(id), name: chatTitle(title) });
}

/** Newest turn and folder of one chat, read-only; used to notice a Codex-app turn stopped by a usage limit. */
export async function readLatestCodexTurn(threadId: string): Promise<{ turn?: any; cwd?: string; title?: string }> {
  const rpc = await reader('metadata');
  const { thread } = await historyRead(rpc, 'thread/read', { threadId }, 'metadata');
  const page = await historyRead(rpc, 'thread/turns/list', { threadId, limit: 1, sortDirection: 'desc', itemsView: 'full' }, 'metadata');
  return { turn: (page?.data ?? page?.turns ?? [])[0], cwd: thread?.cwd, title: thread?.name || thread?.preview };
}
