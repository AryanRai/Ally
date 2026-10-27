// Models and existing sessions on disk (listing + rebuilding history for import).
import fs from 'node:fs';
import { setImmediate as yieldToIO } from 'node:timers/promises';
import { internalCodexSource } from './codexDiscovery.js';
import os from 'node:os';
import path from 'node:path';
import { extractImages, stringifyToolOutput } from './parsers.js';
import { thumbnails } from './thumbs.js';
import { claudeActivityAt, claudeTurnPending, codexRolloutPending, isRunning } from './sessionActivity.js';
import type { AgentHistoryMessage, AgentModel, AgentProvider, AgentSessionSummary, AgentToolExecution, AgentUsage, AgentSessionSnapshot } from './types.js';

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export function listAgentModels(provider: AgentProvider): AgentModel[] {
  if (provider === 'claude') {
    return [
      { id: 'default', name: 'Default', description: 'Your Claude Code default model' },
      { id: 'opus', name: 'Opus', description: 'Most capable' },
      { id: 'sonnet', name: 'Sonnet', description: 'Balanced' },
      { id: 'haiku', name: 'Haiku', description: 'Fastest' },
    ];
  }
  const models: AgentModel[] = [{ id: 'default', name: 'Default', description: 'Your Codex default model' }];
  try {
    const cache = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.codex', 'models_cache.json'), 'utf8'));
    for (const m of cache.models ?? []) {
      if (m.visibility === 'hide') continue;
      models.push({ id: m.slug, name: m.display_name ?? m.slug, description: m.description });
    }
  } catch { /* no cache yet — default only */ }
  return models;
}

// ---------------------------------------------------------------------------
// Existing sessions (import / continue)
// ---------------------------------------------------------------------------

function readJsonl(file: string): any[] {
  const out: any[] = [];
  let text: string;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return out; }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* partial line */ }
  }
  return out;
}

const SYSTEM_TAG_BLOCK = /<(system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-caveat|environment_context|user_instructions|turn_aborted)>[\s\S]*?<\/\1>/g;

function cleanUserText(text: string): string {
  return text.replace(SYSTEM_TAG_BLOCK, '').trim();
}

function claudeProjectsDir() { return path.join(os.homedir(), '.claude', 'projects'); }
function codexDir() { return path.join(os.homedir(), '.codex'); }

function claudeSessionFiles(): Array<{ file: string; mtime: number }> {
  const root = claudeProjectsDir();
  const files: Array<{ file: string; mtime: number }> = [];
  let dirs: string[] = [];
  try { dirs = fs.readdirSync(root); } catch { return files; }
  for (const d of dirs) {
    const dir = path.join(root, d);
    let names: string[] = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (!n.endsWith('.jsonl')) continue;
      const file = path.join(dir, n);
      try { files.push({ file, mtime: fs.statSync(file).mtimeMs }); } catch { /* raced */ }
    }
  }
  return files.sort((a, b) => b.mtime - a.mtime);
}

function firstUserText(content: any): string {
  if (typeof content === 'string') return cleanUserText(content);
  if (Array.isArray(content)) {
    return cleanUserText(content.filter((b: any) => b.type === 'text' || b.type === 'input_text').map((b: any) => b.text).join('\n'));
  }
  return '';
}

const claudeSummaryCache = new Map<string, { revision: string; summary: AgentSessionSummary | null }>();
function listClaudeSessions(limit: number): AgentSessionSummary[] {
  const out: AgentSessionSummary[] = [];
  for (const { file, mtime } of claudeSessionFiles()) {
    const revision = fileRevision([file]);
    const cached = claudeSummaryCache.get(file);
    if (cached?.revision === revision) { if (cached.summary) out.push(cached.summary); continue; }
    const lines = readJsonl(file);
    let title = '';
    let fallback = '';
    let cwd: string | undefined;
    let hasConversation = false;
    for (const l of lines) {
      if (l.type === 'custom-title' && l.customTitle) title = l.customTitle;
      else if (l.type === 'ai-title' && l.aiTitle && !title) title = l.aiTitle;
      else if (l.type === 'summary' && l.summary && !title) title = l.summary;
      if ((l.type === 'user' || l.type === 'assistant') && !l.isSidechain) {
        hasConversation = true;
        // The latest folder wins: a session can move (e.g. resumed from another project)
        if (l.cwd) cwd = l.cwd;
        if (!fallback && l.type === 'user' && !l.isMeta) fallback = firstUserText(l.message?.content);
      }
    }
    if (!hasConversation) { claudeSummaryCache.set(file, { revision, summary: null }); continue; }
    const summary: AgentSessionSummary = {
      provider: 'claude',
      id: path.basename(file, '.jsonl'),
      title: (title && title !== 'Chat' ? title : fallback || title || 'Untitled').slice(0, 80),
      cwd,
      createdAt: lines.map(l => Date.parse(l.timestamp)).find(t => Number.isFinite(t) && t > 0) ?? fs.statSync(file).birthtimeMs,
      updatedAt: mtime,
    };
    claudeSummaryCache.set(file, { revision, summary });
    out.push(summary);
  }
  return out.sort((a,b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || a.id.localeCompare(b.id)).slice(0, limit);
}

function codexRolloutFiles(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory() && depth < 4) walk(p, depth + 1);
      else if (ent.isFile() && ent.name.endsWith('.jsonl')) {
        const ids = ent.name.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
        // Codex desktop continuations are <thread-id>_<continuation-id>.jsonl.
        // They belong to the original thread, not a separate sidebar entry.
        if (ids[0]) map.set(ids[0], [...(map.get(ids[0]) ?? []), p]);
      }
    }
  };
  walk(path.join(codexDir(), 'sessions'), 0);
  walk(path.join(codexDir(), 'archived_sessions'), 0);
  return map;
}

/** Merge continuation files chronologically, deduplicating repeated response items. */
export function mergeSessionRecords(parts: any[][]): any[] {
  // A continuation can replay the opening messages with new IDs. Remove only
  // a shared prefix across files; repeated user messages within a file stay intact.
  const visibleKey = (r: any): string | undefined => {
    const p = r.payload;
    if (r.type !== 'response_item' || p?.type !== 'message' || !['user', 'assistant'].includes(p.role)) return;
    const text = p.role === 'user' ? firstUserText(p.content) : (p.content ?? []).map((c: any) => c.text ?? '').join('\n').trim();
    const images = extractImages(p.content);
    if (!text && !images.length) return;
    return JSON.stringify([p.role, text, images]);
  };
  const merged: any[] = [];
  for (const part of parts) {
    // Desktop may save a draft in the root file, then start a continuation
    // with the expanded prompt. Prefer that complete prompt only while the
    // root has a single user message and no assistant activity yet.
    const visible = merged.filter(r => visibleKey(r));
    const opening = part.find(r => visibleKey(r));
    if (visible.length === 1 && visible[0].payload.role === 'user' && opening?.payload.role === 'user'
      && !merged.some(r => r.type === 'response_item' && r.payload?.role !== 'user' && r.payload?.role !== 'developer' && r.payload?.role !== 'system')) {
      const before = firstUserText(visible[0].payload.content);
      const after = firstUserText(opening.payload.content);
      if (before && after.length > before.length && after.startsWith(before)
        && JSON.stringify(extractImages(visible[0].payload.content)) === JSON.stringify(extractImages(opening.payload.content))) {
        merged[merged.indexOf(visible[0])] = opening;
      }
    }
    const prefix = merged.map(visibleKey).filter(Boolean);
    let index = 0;
    let replay = true;
    for (const record of part) {
      const key = visibleKey(record);
      if (key && replay) {
        if (key === prefix[index]) { index++; continue; }
        replay = false;
      }
      merged.push(record);
    }
  }
  const records = merged.sort((a, b) => String(a.timestamp ?? '').localeCompare(String(b.timestamp ?? '')));
  const seen = new Set<string>();
  return records.filter(record => {
    const p = record.payload;
    if (record.type !== 'response_item' || !(p?.id || p?.call_id)) return true;
    const key = `${p.type}:${p.id || p.call_id}:${JSON.stringify(p)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fileRevision(files: string[]): string {
  return files.map(file => {
    try { const stat = fs.statSync(file); return `${file}:${stat.size}:${stat.mtimeMs}`; }
    catch { return `${file}:missing`; }
  }).join('|');
}

function readFirstLine(file: string): any {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const line = buf.subarray(0, n).toString('utf8').split('\n')[0];
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function listCodexSessions(limit: number): AgentSessionSummary[] {
  const index = new Map<string, { title: string; updatedAt: number }>();
  for (const l of readJsonl(path.join(codexDir(), 'session_index.jsonl'))) {
    if (!l.id) continue;
    index.set(l.id, { title: l.thread_name || 'Untitled', updatedAt: Date.parse(l.updated_at) || 0 });
  }
  const files = codexRolloutFiles();
  const out: AgentSessionSummary[] = [];
  for (const [id, paths] of files) {
    const info = index.get(id);
    const file = paths[0];
    const meta = file ? readFirstLine(file) : null;
    if (internalCodexSource(meta?.payload)) continue;
    const updatedAt = Math.max(info?.updatedAt ?? 0, ...paths.map(p => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } }));
    out.push({ provider: 'codex', id, title: (info?.title ?? 'Codex chat').slice(0, 80), cwd: meta?.payload?.cwd, createdAt: Date.parse(meta?.timestamp ?? meta?.payload?.timestamp) || 0, updatedAt });
  }
  return out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || a.id.localeCompare(b.id)).slice(0, limit);
}

export function listAgentSessions(provider: AgentProvider, limit = 40): AgentSessionSummary[] {
  return provider === 'claude' ? listClaudeSessions(limit) : listCodexSessions(limit);
}

/** Whether the last parsed revision ended mid-turn, so unchanged polls can still answer. */
const pendingByRevision = new Map<string, { pending: boolean; lastActivity: number }>();

/** Rebuild a session's visible conversation (user turns + assistant text and tool pills). */
export function loadAgentSession(provider: AgentProvider, id: string, previousRevision?: string): AgentSessionSnapshot {
  const files = provider === 'claude'
    ? claudeSessionFiles().filter(f => path.basename(f.file, '.jsonl') === id).map(f => f.file)
    : codexRolloutFiles().get(id) ?? [];
  if (!files.length) throw new Error(`${provider} session ${id} not found`);
  const revision = fileRevision(files);
  const lastWrite = Math.max(...files.map(f => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }));
  const cached = pendingByRevision.get(revision);
  if (revision === previousRevision && cached) return { revision, unchanged: true, messages: [], running: isRunning(cached.pending, cached.lastActivity) };
  const records = provider === 'codex' ? mergeSessionRecords(files.map(readJsonl)) : readJsonl(files[0]);
  if (!records.length) return { revision: previousRevision ?? '', unchanged: true, messages: [] };
  const pending = provider === 'claude' ? claudeTurnPending(records) : codexRolloutPending(records);
  const lastActivity = provider === 'claude' ? claudeActivityAt(records, lastWrite) : lastWrite;
  if (pendingByRevision.size > 50) pendingByRevision.clear();
  pendingByRevision.set(revision, { pending, lastActivity });
  return { ...(provider === 'claude' ? rebuildClaudeHistory(records) : rebuildCodexHistory(records)), createdAt: records.map(r => Date.parse(r.timestamp)).find(t => Number.isFinite(t) && t > 0) ?? 0, revision, running: isRunning(pending, lastActivity) };
}

class HistoryBuilder {
  messages: AgentHistoryMessage[] = [];
  private current: AgentHistoryMessage | null = null;
  private tools = new Map<string, AgentToolExecution>();
  private usageByMessage = new Map<string, AgentUsage>();
  private turnStartedAt?: number;

  user(text: string, ts: number, images?: string[]) {
    this.flush();
    this.turnStartedAt = ts;
    const thumbs = thumbnails(images);
    this.messages.push({ role: 'user', content: text, timestamp: ts, ...(thumbs ? { images: thumbs } : {}) });
  }

  thinking(text: string, ts: number) {
    const segs = this.assistant(ts).segments!;
    const last = segs[segs.length - 1];
    if (last?.type === 'thinking') last.content += '\n\n' + text;
    else segs.push({ type: 'thinking', content: text });
  }

  private assistant(ts: number) {
    if (!this.current) this.current = { role: 'assistant', content: '', timestamp: ts, segments: [] };
    return this.current;
  }

  usage(key: string, usage: AgentUsage, ts: number) {
    this.usageByMessage.set(key, usage);
    const combined: AgentUsage = {};
    for (const item of this.usageByMessage.values()) {
      for (const field of ['inputTokens', 'outputTokens', 'cachedTokens', 'costUsd'] as const) {
        if (item[field] != null) combined[field] = (combined[field] ?? 0) + item[field]!;
      }
    }
    if (this.turnStartedAt != null) combined.durationMs = Math.max(0, ts - this.turnStartedAt);
    this.assistant(ts).usage = combined;
  }

  text(text: string, ts: number, metadata: { itemId?: string; phase?: 'commentary' | 'final_answer' } = {}) {
    const a = this.assistant(ts);
    const segs = a.segments!;
    const last = segs[segs.length - 1];
    if (last?.type === 'text' && last.itemId === metadata.itemId && last.phase === metadata.phase) last.content += '\n\n' + text;
    else segs.push({ type: 'text', content: text, ...metadata });
    a.content += (a.content ? '\n\n' : '') + text;
  }

  toolStart(id: string, name: string, input: any, ts: number) {
    const exec: AgentToolExecution = { id, name, parameters: input, status: 'executing', startTime: ts };
    this.tools.set(id, exec);
    this.assistant(ts).segments!.push({ type: 'tool', toolExecution: exec });
  }

  toolEnd(id: string, output: string, isError: boolean, ts: number, images?: string[]) {
    const exec = this.tools.get(id);
    if (!exec) return;
    const thumbs = thumbnails(images);
    if (thumbs) exec.images = thumbs;
    exec.status = isError ? 'error' : 'success';
    exec.endTime = ts;
    if (isError) exec.error = output.slice(0, 2000);
    else exec.result = output.slice(0, 4000);
  }

  flush() {
    if (this.current) {
      if (!this.current.segments!.some(s => s.type !== 'text' || s.itemId || s.phase)) delete this.current.segments;
      if (this.current.content || this.current.segments) this.messages.push(this.current);
    }
    this.current = null;
    this.usageByMessage.clear();
    this.tools.clear();
    this.turnStartedAt = undefined;
  }
}

export function rebuildClaudeHistory(records: any[]): { cwd?: string; messages: AgentHistoryMessage[] } {
  const b = new HistoryBuilder();
  let cwd: string | undefined;
  for (const l of records) {
    if (l.isSidechain || (l.type !== 'user' && l.type !== 'assistant')) continue;
    if (l.cwd) cwd = l.cwd; // latest folder, so turns run where the session now lives
    const ts = Date.parse(l.timestamp) || Date.now();
    const content = l.message?.content;
    if (l.type === 'user') {
      if (Array.isArray(content) && content.some((c: any) => c.type === 'tool_result')) {
        for (const c of content) {
          if (c.type === 'tool_result') b.toolEnd(c.tool_use_id, stringifyToolOutput(c.content), !!c.is_error, ts, extractImages(c.content));
        }
      } else if (!l.isMeta) {
        const text = firstUserText(content);
        const images = extractImages(content);
        if (text || images.length) b.user(text, ts, images);
      }
    } else if (Array.isArray(content)) {
      for (const c of content) {
        if (c.type === 'text' && c.text) b.text(c.text, ts, { itemId: l.message.id ?? l.uuid });
        else if (c.type === 'thinking' && c.thinking) b.thinking(c.thinking, ts);
        else if (c.type === 'tool_use') b.toolStart(c.id, c.name, c.input, ts);
      }
      const u = l.message.usage;
      if (u) b.usage(l.message.id ?? l.uuid ?? String(ts), {
        inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
        outputTokens: u.output_tokens,
        cachedTokens: u.cache_read_input_tokens,
      }, ts);
    }
  }
  b.flush();
  return { cwd, messages: b.messages };
}

export function rebuildCodexHistory(records: any[]) {
  const iterator = codexHistoryBuilder(records);
  let next = iterator.next();
  while (!next.done) next = iterator.next();
  return next.value;
}
export async function rebuildCodexHistoryAsync(records: any[]) {
  const iterator = codexHistoryBuilder(records);
  let next = iterator.next(), count = 0;
  while (!next.done) {
    if (++count % 64 === 0) await yieldToIO();
    next = iterator.next();
  }
  return next.value;
}
function* codexHistoryBuilder(records: any[]): Generator<void, { cwd?: string; messages: AgentHistoryMessage[] }> {
  const b = new HistoryBuilder();
  let cwd: string | undefined;
  let total = { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 };
  let baseline = { ...total };
  for (const l of records) {
    yield;
    const p = l.payload;
    const ts = Date.parse(l.timestamp) || Date.now();
    if (l.type === 'session_meta') { cwd ??= p?.cwd; continue; }
    if (l.type === 'turn_context' && typeof p?.cwd === 'string') { cwd = p.cwd; continue; }
    if (l.type === 'event_msg' && p?.type === 'turn_aborted') { b.text('⏹️ Stopped', ts); continue; }
    if (l.type === 'event_msg' && p?.type === 'token_count' && p.info?.total_token_usage) {
      total = p.info.total_token_usage;
      b.usage('turn', {
        inputTokens: Math.max(0, (total.input_tokens ?? 0) - baseline.input_tokens),
        outputTokens: Math.max(0, (total.output_tokens ?? 0) - baseline.output_tokens),
        cachedTokens: Math.max(0, (total.cached_input_tokens ?? 0) - baseline.cached_input_tokens),
      }, ts);
      continue;
    }
    if (l.type !== 'response_item' || !p) continue;
    if (p.type === 'message') {
      const text = (p.content ?? []).map((c: any) => c.text ?? '').join('\n');
      if (p.role === 'user') {
        const cleaned = cleanUserText(text);
        const images = extractImages(p.content);
        if ((cleaned || images.length) && !cleaned.startsWith('# AGENTS.md')) {
          b.user(cleaned, ts, images);
          baseline = { input_tokens: total.input_tokens ?? 0, output_tokens: total.output_tokens ?? 0, cached_input_tokens: total.cached_input_tokens ?? 0 };
        }
      } else if (p.role === 'assistant' && p.channel !== 'analysis' && text.trim()) {
        b.text(text.trim(), ts, { itemId: p.id, phase: p.phase ?? (['commentary', 'final'].includes(p.channel) ? (p.channel === 'final' ? 'final_answer' : 'commentary') : undefined) });
      }
    } else if (p.type === 'function_call' || p.type === 'custom_tool_call') {
      let input: any = p.arguments ?? p.input;
      if (typeof input === 'string') { try { input = JSON.parse(input); } catch { input = { input } } }
      b.toolStart(p.call_id, p.name, input, ts);
    } else if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
      const raw = typeof p.output === 'string' ? p.output : p.output?.content ?? p.output;
      const output = typeof raw === 'string' ? raw : stringifyToolOutput(raw);
      b.toolEnd(p.call_id, output, false, ts, extractImages(raw));
    } else if (p.type === 'reasoning') {
      const summary = (p.summary ?? []).map((x: any) => x.text ?? '').filter(Boolean).join('\n\n');
      if (summary) b.thinking(summary, ts);
    } else if (p.type === 'web_search_call') {
      const id = p.id ?? `ws-${ts}`;
      b.toolStart(id, 'web_search', { query: p.action?.query ?? p.action?.queries?.[0] }, ts);
    }
  }
  b.flush();
  if (b.messages.length === 0) {
    // Newer Codex-app threads keep their history in its SQLite store, which
    // Electron's Node can't read; the session itself still resumes fine.
    b.messages.push({
      role: 'assistant',
      content: "This thread's earlier messages live in the Codex app and can't be shown here, but Codex still remembers them. Send a message to continue.",
      timestamp: Date.now(),
    });
  }
  return { cwd, messages: b.messages };
}
