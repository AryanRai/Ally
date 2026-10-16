// Models and existing sessions on disk (listing + rebuilding history for import).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stringifyToolOutput } from './parsers.js';
import type { AgentHistoryMessage, AgentModel, AgentProvider, AgentSessionSummary, AgentToolExecution } from './types.js';

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
    return cleanUserText(content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n'));
  }
  return '';
}

function listClaudeSessions(limit: number): AgentSessionSummary[] {
  const out: AgentSessionSummary[] = [];
  for (const { file, mtime } of claudeSessionFiles()) {
    if (out.length >= limit) break;
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
        cwd ??= l.cwd;
        if (!fallback && l.type === 'user' && !l.isMeta) fallback = firstUserText(l.message?.content);
      }
    }
    if (!hasConversation) continue;
    out.push({
      provider: 'claude',
      id: path.basename(file, '.jsonl'),
      title: (title && title !== 'Chat' ? title : fallback || title || 'Untitled').slice(0, 80),
      cwd,
      updatedAt: mtime,
    });
  }
  return out;
}

function codexRolloutFiles(): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory() && depth < 4) walk(p, depth + 1);
      else if (ent.isFile() && ent.name.endsWith('.jsonl')) {
        const ids = ent.name.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
        for (const id of ids) if (!map.has(id)) map.set(id, p);
      }
    }
  };
  walk(path.join(codexDir(), 'sessions'), 0);
  walk(path.join(codexDir(), 'archived_sessions'), 0);
  return map;
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
  for (const [id, info] of index) {
    const file = files.get(id);
    const meta = file ? readFirstLine(file) : null;
    out.push({ provider: 'codex', id, title: info.title.slice(0, 80), cwd: meta?.payload?.cwd, updatedAt: info.updatedAt });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}

export function listAgentSessions(provider: AgentProvider, limit = 40): AgentSessionSummary[] {
  return provider === 'claude' ? listClaudeSessions(limit) : listCodexSessions(limit);
}

/** Rebuild a session's visible conversation (user turns + assistant text and tool pills). */
export function loadAgentSession(provider: AgentProvider, id: string): { cwd?: string; messages: AgentHistoryMessage[] } {
  return provider === 'claude' ? loadClaudeSession(id) : loadCodexSession(id);
}

class HistoryBuilder {
  messages: AgentHistoryMessage[] = [];
  private current: AgentHistoryMessage | null = null;
  private tools = new Map<string, AgentToolExecution>();

  user(text: string, ts: number) {
    this.flush();
    this.messages.push({ role: 'user', content: text, timestamp: ts });
  }

  private assistant(ts: number) {
    if (!this.current) this.current = { role: 'assistant', content: '', timestamp: ts, segments: [] };
    return this.current;
  }

  text(text: string, ts: number) {
    const a = this.assistant(ts);
    const segs = a.segments!;
    const last = segs[segs.length - 1];
    if (last?.type === 'text') last.content += '\n\n' + text;
    else segs.push({ type: 'text', content: text });
    a.content += (a.content ? '\n\n' : '') + text;
  }

  toolStart(id: string, name: string, input: any, ts: number) {
    const exec: AgentToolExecution = { id, name, parameters: input, status: 'success', startTime: ts, endTime: ts };
    this.tools.set(id, exec);
    this.assistant(ts).segments!.push({ type: 'tool', toolExecution: exec });
  }

  toolEnd(id: string, output: string, isError: boolean, ts: number) {
    const exec = this.tools.get(id);
    if (!exec) return;
    exec.status = isError ? 'error' : 'success';
    exec.endTime = ts;
    if (isError) exec.error = output.slice(0, 2000);
    else exec.result = output.slice(0, 4000);
  }

  flush() {
    if (this.current) {
      if (!this.current.segments!.some(s => s.type === 'tool')) delete this.current.segments;
      if (this.current.content || this.current.segments) this.messages.push(this.current);
    }
    this.current = null;
  }
}

function loadClaudeSession(id: string): { cwd?: string; messages: AgentHistoryMessage[] } {
  const file = claudeSessionFiles().find(f => path.basename(f.file, '.jsonl') === id)?.file;
  if (!file) throw new Error(`Claude Code session ${id} not found`);
  const b = new HistoryBuilder();
  let cwd: string | undefined;
  for (const l of readJsonl(file)) {
    if (l.isSidechain || (l.type !== 'user' && l.type !== 'assistant')) continue;
    cwd ??= l.cwd;
    const ts = Date.parse(l.timestamp) || Date.now();
    const content = l.message?.content;
    if (l.type === 'user') {
      if (Array.isArray(content) && content.some((c: any) => c.type === 'tool_result')) {
        for (const c of content) {
          if (c.type === 'tool_result') b.toolEnd(c.tool_use_id, stringifyToolOutput(c.content), !!c.is_error, ts);
        }
      } else if (!l.isMeta) {
        const text = firstUserText(content);
        if (text) b.user(text, ts);
      }
    } else if (Array.isArray(content)) {
      for (const c of content) {
        if (c.type === 'text' && c.text) b.text(c.text, ts);
        else if (c.type === 'tool_use') b.toolStart(c.id, c.name, c.input, ts);
      }
    }
  }
  b.flush();
  return { cwd, messages: b.messages };
}

function loadCodexSession(id: string): { cwd?: string; messages: AgentHistoryMessage[] } {
  const file = codexRolloutFiles().get(id);
  if (!file) throw new Error(`Codex session ${id} not found`);
  const b = new HistoryBuilder();
  let cwd: string | undefined;
  for (const l of readJsonl(file)) {
    const p = l.payload;
    const ts = Date.parse(l.timestamp) || Date.now();
    if (l.type === 'session_meta') { cwd ??= p?.cwd; continue; }
    if (l.type !== 'response_item' || !p) continue;
    if (p.type === 'message') {
      const text = (p.content ?? []).map((c: any) => c.text ?? '').join('\n');
      if (p.role === 'user') {
        const cleaned = cleanUserText(text);
        if (cleaned && !cleaned.startsWith('# AGENTS.md')) b.user(cleaned, ts);
      } else if (p.role === 'assistant' && text.trim()) {
        b.text(text.trim(), ts);
      }
    } else if (p.type === 'function_call' || p.type === 'custom_tool_call') {
      let input: any = p.arguments ?? p.input;
      if (typeof input === 'string') { try { input = JSON.parse(input); } catch { input = { input } } }
      b.toolStart(p.call_id, p.name, input, ts);
    } else if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
      const output = typeof p.output === 'string' ? p.output : stringifyToolOutput(p.output?.content ?? p.output);
      b.toolEnd(p.call_id, output, false, ts);
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
