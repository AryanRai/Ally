import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { claudeTurnPending, isRunning } from './sessionActivity.js';
import type { AgentProvider, AgentSessionSummary } from './types.js';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const managed = new Map<string, AgentSessionSummary>();
const settled = new Map<string, number>();
const finishedRuns = new Set<string>();
export function trackRunningSession(runId: string, session?: AgentSessionSummary) {
  if (session && !finishedRuns.has(runId)) managed.set(runId, session);
}
export function finishRunningSession(runId: string) {
  const session = managed.get(runId);
  if (session) settled.set(`${session.provider}:${session.id}`, Date.now());
  managed.delete(runId);
  finishedRuns.add(runId);
  if (finishedRuns.size > 256) finishedRuns.delete(finishedRuns.values().next().value!);
}
const jsonl = (text: string): any[] => text.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
const textContent = (content: any): string => typeof content === 'string' ? content : Array.isArray(content) ? content.filter(b => b.type === 'text' || b.type === 'input_text').map(b => b.text ?? '').join(' ') : '';

/** Find the latest turn marker even when a long turn exceeds the tail preview.
 * Walk backwards in chunks, skipping oversized lines (tool/image payloads).
 */
async function codexPending(file: string, size: number): Promise<boolean> {
  const handle = await fs.open(file, 'r');
  let end = size;
  let remainder = '';
  try {
    while (end > 0) {
      const length = Math.min(end, 65536);
      end -= length;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, end);
      const lines = (buffer.toString() + remainder).split('\n');
      remainder = lines.shift() ?? '';
      if (end === 0) lines.unshift(remainder);
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].length > 65536 || !/task_started|task_complete|turn_aborted/.test(lines[i])) continue;
        const r = jsonl(lines[i])[0];
        if (r?.type !== 'event_msg') continue;
        if (r.payload?.type === 'task_started') return true;
        if (r.payload?.type === 'task_complete' || r.payload?.type === 'turn_aborted') return false;
      }
      if (remainder.length > 65536) remainder = ''; // no lifecycle event has a giant payload
    }
    return false;
  } finally { await handle.close(); }
}

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

export async function scanRunningSessions(home = os.homedir(), now = Date.now()): Promise<AgentSessionSummary[]> {
  const result = new Map<string, { summary: AgentSessionSummary; pending: boolean }>();
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
        const stat = await fs.stat(file);
        if (!isRunning(true, stat.mtimeMs, now)) continue;
        const { head, tail } = await edges(file, stat.size);
        const records = [...head, ...tail];
        const meta = head.find(r => r.type === 'session_meta')?.payload;
        const cwd = provider === 'codex' ? meta?.cwd : [...records].reverse().find(r => r.cwd)?.cwd;
        const prompt = records.find(r => provider === 'claude' ? r.type === 'user' && !r.isMeta && !r.isSidechain : r.type === 'response_item' && r.payload?.role === 'user');
        const custom = [...records].reverse().find(r => r.type === 'custom-title' || r.type === 'ai-title');
        const customTitle = custom?.customTitle || custom?.aiTitle;
        const title = titles.get(id) || (customTitle !== 'Chat' ? customTitle : '') || textContent(prompt?.message?.content ?? prompt?.payload?.content).replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, '').trim() || `${provider === 'codex' ? 'Codex' : 'Claude'} chat`;
        const summary = { id, provider, title: title.slice(0, 80), cwd, updatedAt: stat.mtimeMs };
        const key = `${provider}:${id}`;
        // Continuations belong to the original chat. The latest written file wins.
        if ((result.get(key)?.summary.updatedAt ?? 0) <= stat.mtimeMs) result.set(key, { summary, pending: provider === 'codex' ? await codexPending(file, stat.size) : claudeTurnPending(tail) });
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  };
  await visit(path.join(home, '.claude', 'projects'), 'claude', 1);
  await visit(path.join(home, '.codex', 'sessions'), 'codex', 4);
  return [...result.values()].filter(r => r.pending).map(r => r.summary).sort((a, b) => b.updatedAt - a.updatedAt);
}

let cached: { at: number; sessions: AgentSessionSummary[] } | undefined;
let pending: Promise<AgentSessionSummary[]> | undefined;
export async function listRunningSessions(): Promise<AgentSessionSummary[]> {
  if (!cached || Date.now() - cached.at > 4000) {
    pending ??= scanRunningSessions().then(sessions => { cached = { at: Date.now(), sessions }; return sessions; }).finally(() => { pending = undefined; });
    await pending;
  }
  for (const [key, at] of settled) if (Date.now() - at > 10 * 60_000) settled.delete(key);
  const merged = new Map((cached?.sessions ?? []).filter(s => s.updatedAt > (settled.get(`${s.provider}:${s.id}`) ?? 0)).map(s => [`${s.provider}:${s.id}`, s]));
  for (const s of managed.values()) merged.set(`${s.provider}:${s.id}`, { ...s, title: merged.get(`${s.provider}:${s.id}`)?.title ?? s.title });
  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
