import { canonicalTurnId, readDesktopActivity } from './codexDesktop.js';
import { createHash } from 'node:crypto';
import { localImageDataUrl } from './imageFile.js';
import { CodexRpc } from './codexRpc.js';
import { CodexEventParser } from './codexEvents.js';
import { codexMigrationAliases, mappedCodexSession } from './codexMigration.js';
import { thumbnails } from './thumbs.js';
import { readCodexActivity } from './codexActivity.js';
import { isManagedSessionRunning } from './runningSessions.js';
import { chatTitle, isDeviceProtocolTitle } from './chatTitle.js';
import { codexTurnsPending } from './sessionActivity.js';
import type { AgentHistoryMessage, AgentSessionSnapshot, AgentSessionSummary, AgentToolExecution } from './types.js';

let connection: Promise<CodexRpc> | undefined;
let binary: string | undefined;
export function configureCodexHistory(bin?: string) {
  if (bin !== binary) { closeCodexHistory(); binary = bin; }
}
export function closeCodexHistory() {
  const old = connection; connection = undefined;
  void old?.then(rpc => rpc.close()).catch(() => {});
}
async function reader(): Promise<CodexRpc> {
  if (!connection) {
    const opening = CodexRpc.connect(binary).then(rpc => {
      rpc.onClose = () => { if (connection === opening) connection = undefined; };
      return rpc;
    }).catch(error => { if (connection === opening) connection = undefined; throw error; });
    connection = opening;
  }
  return connection;
}

export async function listCodexChats(limit = 40): Promise<AgentSessionSummary[]> {
  const rpc = await reader();
  const aliases = codexMigrationAliases();
  const originals = Object.fromEntries(Object.entries(aliases).map(([old, target]) => [target, old]));
  const result: AgentSessionSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await rpc.request('thread/list', {
      limit: Math.min(100, Math.max(1, limit)), cursor, sortKey: 'updated_at',
      // Include old exec chats for compatibility, but omit subagent/background threads.
      sourceKinds: ['cli', 'vscode', 'appServer', 'exec'],
    });
    for (const t of page.data) {
      if (aliases[t.id]) continue;
      result.push({ provider: 'codex', id: t.id, title: chatTitle(t.name || t.preview || 'Codex chat'),
        cwd: t.cwd, updatedAt: t.updatedAt * 1000, originalSessionId: originals[t.id] });
      if (result.length >= limit) return result;
    }
    cursor = page.nextCursor;
  } while (cursor);
  return result;
}

/** No thread/resume here: browsing must not own a writer. */
export async function loadCodexChat(id: string, previousRevision?: string): Promise<AgentSessionSnapshot> {
  const rpc = await reader();
  const sessionId = mappedCodexSession(id);
  const thread = (await rpc.request('thread/read', { threadId: sessionId })).thread;
  const turns: any[] = [];
  if (thread.historyMode === 'paginated') {
    let cursor: string | undefined;
    do {
      const page = await rpc.request('thread/turns/list', { threadId: sessionId, limit: 100, cursor, sortDirection: 'asc', itemsView: 'full' });
      for (const turn of page.data) {
        if (turn.itemsView !== 'full') {
          turn.items = [];
          let itemCursor: string | undefined;
          do {
            const items = await rpc.request('thread/items/list', { threadId: sessionId, turnId: turn.id, limit: 100, cursor: itemCursor });
            turn.items.push(...items.data.map((entry: any) => entry.item));
            itemCursor = items.nextCursor;
          } while (itemCursor);
        }
        turns.push(turn);
      }
      cursor = page.nextCursor;
    } while (cursor);
  } else {
    turns.push(...(await rpc.request('thread/read', { threadId: sessionId, includeTurns: true })).thread.turns);
  }
  const activity = await readCodexActivity(thread.path).catch(() => undefined);
  const managed = isManagedSessionRunning('codex', sessionId);
  const last = turns.at(-1);
  const live = last?.status === 'interrupted' && !(activity?.pending && activity.recent && canonicalTurnId(last.id) === canonicalTurnId(activity.turnId)) ? await readDesktopActivity(sessionId) : undefined;
  // Only correct the matching active turn. Never erase an earlier real Stop.
  if (last?.status === 'interrupted' && ((activity?.pending && (activity.recent || managed) && canonicalTurnId(last.id) === canonicalTurnId(activity.turnId)) || (live?.running && canonicalTurnId(last.id) === live.turnId))) last.status = 'inProgress';
  const running = managed || live?.running === true || codexTurnsPending(turns);
  const revision = createHash('sha256').update(JSON.stringify([sessionId, thread.name, thread.cwd, turns, running])).digest('hex');
  const identity = { sessionId, title: thread.name ? chatTitle(thread.name) : undefined, ...(sessionId !== id ? { originalSessionId: id } : {}) };
  if (revision === previousRevision) return { ...identity, cwd: thread.cwd, revision, unchanged: true, messages: [], running };
  return { ...identity, cwd: thread.cwd, revision, running, messages: codexHistoryMessages(turns, thread.createdAt * 1000) };
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
  const messages: AgentHistoryMessage[] = [];
  for (const turn of turns) {
    const ts = turn.startedAt ? turn.startedAt * 1000 : createdAt;
    const parser = new CodexEventParser('history');
    let assistant: AgentHistoryMessage | undefined;
    const tools = new Map<string, AgentToolExecution>();
    for (const item of turn.items ?? []) {
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
          if (last?.type === type) last.content = (last.content ?? '') + ev.text;
          else assistant.segments!.push({ type, content: ev.text });
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
