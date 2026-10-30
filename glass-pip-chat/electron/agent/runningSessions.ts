import fs from 'node:fs/promises';
import { CodexDiscovery, hiddenConversation } from './codexDiscovery.js';
import os from 'node:os';
import path from 'node:path';
import { claudeActivityAt, claudeTurnPending, claudeTerminalStatus, isRunning } from './sessionActivity.js';
import type { AgentProvider, AgentSessionSummary } from './types.js';
import { readCodexActivity } from './codexActivity.js';
import { chatTitle } from './chatTitle.js';
import { readDesktopActivity } from './codexDesktop.js';
import { activityPreview } from './activityPreview.js';
const publicPreviews = new Map<string, string>();
export const sessionActivityText = (provider: AgentProvider, id: string) => publicPreviews.get(`${provider}:${id}`) || '';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const managed = new Map<string, AgentSessionSummary>();
const runLifetimes = new Map<string, AbortController>();
const settled = new Map<string, number>();
const finishedRuns = new Set<string>();
export interface SessionActivity extends AgentSessionSummary { status: 'running' | 'completed' | 'stopped' | 'error' }
const recentActivity = new Map<string, SessionActivity>();
export function isManagedSessionRunning(provider: AgentProvider, id: string) {
  return [...managed.values()].some(s => s.provider === provider && s.id === id);
}
/** Trusted local run identity, never supplied by browser-tool arguments. */
export function managedSessionRunId(provider: AgentProvider, id: string): string | undefined {
  const matches = [...managed].filter(([, session]) => session.provider === provider && session.id === id);
  return matches.length === 1 ? matches[0][0] : undefined;
}
/** Exact authenticated managed prompt lifetime; absent for unknown/ambiguous owners. */
export function managedSessionSignal(provider:AgentProvider,id:string):AbortSignal|undefined {
  const run=managedSessionRunId(provider,id);return run?runLifetimes.get(run)?.signal:undefined;
}
export function trackRunningSession(runId: string, session?: AgentSessionSummary) {
  if (session && !finishedRuns.has(runId)) {managed.set(runId, session);if(!runLifetimes.has(runId))runLifetimes.set(runId,new AbortController());}
}
export function finishRunningSession(runId: string) {
  runLifetimes.get(runId)?.abort();runLifetimes.delete(runId);
  const session = managed.get(runId);
  if (session) settled.set(`${session.provider}:${session.id}`, Date.now());
  managed.delete(runId);
  finishedRuns.add(runId);
  if (finishedRuns.size > 256) finishedRuns.delete(finishedRuns.values().next().value!);
}
const jsonl = (text: string): any[] => text.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
const textContent = (content: any): string => typeof content === 'string' ? content : Array.isArray(content) ? content.filter(b => b.type === 'text' || b.type === 'input_text').map(b => b.text ?? '').join(' ') : '';

/** Read bounded transcript previews, never history images or a writer. */
async function edges(file: string, size: number) {
  const handle = await fs.open(file, 'r');
  try {
    const head = Buffer.alloc(Math.min(size, 32768));
    await handle.read(head, 0, head.length, 0);
    const tail = Buffer.alloc(Math.min(size, 512 * 1024));
    await handle.read(tail, 0, tail.length, Math.max(0, size - tail.length));
    return { head: jsonl(head.toString()), tail: jsonl(tail.toString()) };
  } finally { await handle.close(); }
}

export async function scanRunningSessions(home = os.homedir(), now = Date.now(), observe?: (rows: SessionActivity[]) => void): Promise<AgentSessionSummary[]> {
  const discovery = new CodexDiscovery(home);
  const result = new Map<string, { summary: AgentSessionSummary; pending: boolean }>();
  const observed = new Map<string, SessionActivity>();
  const titles = new Map<string, string>();
  try { for (const r of jsonl(await fs.readFile(path.join(home, '.codex', 'session_index.jsonl'), 'utf8'))) if (r.id && r.thread_name) titles.set(r.id, r.thread_name); } catch { /* no Codex history */ }
  const visit = async (dir: string, provider: AgentProvider, depth: number) => {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory() && depth > 0) { await visit(file, provider, depth - 1); continue; }
      const id = entry.name.match(UUID)?.[0];
      if (!entry.isFile() || !entry.name.endsWith('.jsonl') || !id) continue;
      try {
        if (provider === 'codex' && discovery.file(file)?.internal) continue;
        const stat = await fs.stat(file);
        const recent = isRunning(true, stat.mtimeMs, now);
        if (!recent && provider !== 'codex') continue;
        const activity = provider === 'codex' ? await readCodexActivity(file, now) : undefined;
        // Native Codex can keep executing while its rollout file's mtime is
        // stale (including after Ally restarts). A stale pending lifecycle is
        // only live when its exact desktop owner confirms it; never revive a
        // crashed/abandoned turn based on an old task_started record alone.
        const native = !recent && activity?.pending ? await nativeActivity(id) : undefined;
        if (!recent && native?.running !== true) continue;
        const { head, tail } = await edges(file, stat.size);
        const records = [...head, ...tail];
        const meta = head.find(r => r.type === 'session_meta')?.payload;
        const cwd = provider === 'codex' ? meta?.cwd : [...records].reverse().find(r => r.cwd)?.cwd;
        const prompt = records.find(r => provider === 'claude' ? r.type === 'user' && !r.isMeta && !r.isSidechain : r.type === 'response_item' && r.payload?.role === 'user');
        const custom = [...records].reverse().find(r => r.type === 'custom-title' || r.type === 'ai-title');
        const customTitle = custom?.customTitle || custom?.aiTitle;
        const title = titles.get(id) || (customTitle !== 'Chat' ? customTitle : '') || textContent(prompt?.message?.content ?? prompt?.payload?.content).replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '').trim() || `${provider === 'codex' ? 'Codex' : 'Claude'} chat`;
        const summary = { id, provider, title: chatTitle(title), cwd, updatedAt: native?.running ? now : stat.mtimeMs };
        const key = `${provider}:${id}`;
        publicPreviews.set(key, activityPreview(tail, provider));
        if (publicPreviews.size > 256) publicPreviews.delete(publicPreviews.keys().next().value!);
        const live = provider === 'codex' ? native?.running === true || activity?.pending === true : isRunning(claudeTurnPending(tail), claudeActivityAt(tail, stat.mtimeMs), now);
        const status = live ? 'running' : provider === 'codex' ? activity?.status : claudeTerminalStatus(tail);
        if (status && status !== 'running' && (observed.get(key)?.updatedAt ?? 0) <= summary.updatedAt) observed.set(key, { ...summary, status });
        // Continuations belong to the original chat. The latest written file wins.
        if ((result.get(key)?.summary.updatedAt ?? 0) <= summary.updatedAt) result.set(key, { summary, pending: provider === 'codex' ? native?.running === true || activity?.pending === true : isRunning(claudeTurnPending(tail), claudeActivityAt(tail, stat.mtimeMs), now) });
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  };
  await visit(path.join(home, '.claude', 'projects'), 'claude', 1);
  await visit(path.join(home, '.codex', 'sessions'), 'codex', 4);
  observe?.([...observed.values()].filter(s => !result.get(`${s.provider}:${s.id}`)?.pending));
  return [...result.values()].filter(r => r.pending).map(r => r.summary).sort((a, b) => b.updatedAt - a.updatedAt);
}

// Bound both concurrent native reads and their lifetime. Failed native probes
// fall back to the transcript rules and must not fail the whole running list.
const nativeCache = new Map<string, { at: number; value: Awaited<ReturnType<typeof readDesktopActivity>> }>();
async function nativeActivity(id: string) {
  const cached = nativeCache.get(id);
  if (cached && Date.now() - cached.at < 4000) return cached.value;
  const value = await readDesktopActivity(id).catch(() => undefined);
  nativeCache.set(id, { at: Date.now(), value });
  if (nativeCache.size > 128) nativeCache.delete(nativeCache.keys().next().value!);
  return value;
}

let cached: { at: number; sessions: AgentSessionSummary[] } | undefined;
let pending: Promise<AgentSessionSummary[]> | undefined;
export async function listRunningSessions(): Promise<AgentSessionSummary[]> {
  if (!cached || Date.now() - cached.at > 4000) {
    pending ??= scanRunningSessions(undefined, Date.now(), rows => {
      for (const row of rows) recentActivity.set(`${row.provider}:${row.id}`, row);
      for (const [key, row] of recentActivity) if (Date.now() - row.updatedAt > 30 * 60_000) recentActivity.delete(key);
    }).then(sessions => { cached = { at: Date.now(), sessions }; return sessions; }).finally(() => { pending = undefined; });
    await pending;
  }
  for (const [key, at] of settled) if (Date.now() - at > 10 * 60_000) settled.delete(key);
  const merged = new Map((cached?.sessions ?? []).filter(s => s.updatedAt > (settled.get(`${s.provider}:${s.id}`) ?? 0)).map(s => [`${s.provider}:${s.id}`, s]));
  for (const s of managed.values()) merged.set(`${s.provider}:${s.id}`, { ...s, title: merged.get(`${s.provider}:${s.id}`)?.title ?? s.title });
  for (const key of merged.keys()) recentActivity.delete(key);
  return [...merged.values()].filter(s => !hiddenConversation(s.provider, s.id)).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Same bounded read-only scan as the running picker, plus confirmed recent endings. */
export async function listSessionActivity(): Promise<SessionActivity[]> {
  const running = await listRunningSessions();
  const rows = new Map([...recentActivity].filter(([, row]) => Date.now() - row.updatedAt <= 30 * 60_000));
  for (const row of running) rows.set(`${row.provider}:${row.id}`, { ...row, status: 'running' });
  return [...rows.values()].filter(s => !hiddenConversation(s.provider, s.id)).sort((a, b) => b.updatedAt - a.updatedAt);
}
