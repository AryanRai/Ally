// Read-only index over recent Claude Code and Codex chats, for "find the chat
// about X". Reads transcripts through the same loaders the sidebar uses; a
// chat is re-read only when its updatedAt changes. No embeddings, no copies on disk.
import type { AgentHistoryMessage, AgentProvider, AgentSessionSummary } from '../agent/types.js';

export interface IndexedChat {
  provider: AgentProvider;
  id: string;
  title: string;
  cwd?: string;
  updatedAt: number;
  /** Lower-cased searchable text: user asks + assistant answers (bounded) */
  text: string;
  /** Original-case text for snippets */
  raw: string;
}

export interface SearchHit {
  provider: AgentProvider;
  id: string;
  title: string;
  folder?: string;
  updatedAt: number;
  score: number;
  snippet: string;
}

export interface ChatLoaders {
  list(provider: AgentProvider, limit: number): Promise<AgentSessionSummary[]>;
  load(provider: AgentProvider, id: string): Promise<{ messages: AgentHistoryMessage[]; cwd?: string; title?: string }>;
}

const MAX_TEXT = 40_000;
const STOP = new Set('a an and are as at be but by can do for from has have how i if in into is it its me my of on or our so that the this to was we what when where which who why will with you your about chat chats find most recent'.split(' '));

export const terms = (q: string): string[] =>
  q.toLowerCase().replace(/[^\p{L}\p{N}\s._-]/gu, ' ').split(/\s+/).filter(t => t.length > 1 && !STOP.has(t));

/** Flatten a transcript into bounded text, newest content kept when it's long. */
export function chatText(messages: AgentHistoryMessage[]): string {
  const parts = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`);
  const text = parts.join('\n');
  return text.length > MAX_TEXT ? text.slice(text.length - MAX_TEXT) : text;
}

function count(hay: string, needle: string): number {
  let n = 0;
  for (let i = hay.indexOf(needle); i !== -1 && n < 50; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

/**
 * Score = title hits (strong) + transcript hits (dampened) + folder hits, times a
 * recency boost. Every query term must appear somewhere for a full score.
 */
export function scoreChat(chat: IndexedChat, qTerms: string[], now = Date.now()): number {
  if (!qTerms.length) return 0;
  const title = chat.title.toLowerCase();
  const folder = (chat.cwd ?? '').toLowerCase();
  let score = 0;
  let matched = 0;
  for (const t of qTerms) {
    const inTitle = count(title, t);
    const inText = count(chat.text, t);
    const inFolder = count(folder, t);
    if (inTitle || inText || inFolder) matched++;
    score += inTitle * 4 + Math.log2(1 + inText) * 1.5 + (inFolder ? 2 : 0);
  }
  if (!matched) return 0;
  const coverage = matched / qTerms.length;
  const ageDays = Math.max(0, (now - chat.updatedAt) / 86_400_000);
  const recency = 1 + 1 / (1 + ageDays); // 2× today, ~1.5× yesterday, →1× old
  return score * coverage * coverage * recency;
}

/** A short excerpt around the densest match. */
export function snippet(chat: IndexedChat, qTerms: string[], width = 220): string {
  const lower = chat.raw.toLowerCase();
  let best = -1;
  for (const t of qTerms) {
    const i = lower.lastIndexOf(t); // latest mention is usually the most useful
    if (i > best) best = i;
  }
  if (best < 0) return chat.raw.slice(-width).trim();
  const start = Math.max(0, best - width / 2);
  return `${start > 0 ? '…' : ''}${chat.raw.slice(start, start + width).replace(/\s+/g, ' ').trim()}${start + width < chat.raw.length ? '…' : ''}`;
}

export class ChatIndex {
  private chats = new Map<string, IndexedChat>();
  private refreshing: Promise<void> | null = null;
  private lastRefresh = 0;
  /** Chats whose transcripts are still being read (titles are searchable already) */
  pending = 0;

  constructor(private loaders: ChatLoaders, private perProvider = 80, private ttlMs = 30_000) {}

  /** Bring the index up to date (re-reads only chats whose updatedAt changed). */
  refresh(force = false): Promise<void> {
    if (this.refreshing) return this.refreshing;
    if (!force && Date.now() - this.lastRefresh < this.ttlMs) return Promise.resolve();
    this.refreshing = this.doRefresh().finally(() => { this.refreshing = null; this.lastRefresh = Date.now(); });
    return this.refreshing;
  }

  private async doRefresh(): Promise<void> {
    const lists = await Promise.allSettled((['claude', 'codex'] as const).map(p => this.loaders.list(p, this.perProvider)));
    const summaries = lists.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
    const seen = new Set<string>();
    const stale = summaries.filter(s => {
      const key = `${s.provider}:${s.id}`;
      seen.add(key);
      const have = this.chats.get(key);
      if (have && have.updatedAt === s.updatedAt) { have.title = s.title; return false; }
      return true;
    });
    for (const key of [...this.chats.keys()]) if (!seen.has(key)) this.chats.delete(key);
    // Titles are searchable right away; transcripts fill in below
    for (const s of stale) {
      const key = `${s.provider}:${s.id}`;
      const old = this.chats.get(key);
      this.chats.set(key, { provider: s.provider, id: s.id, title: s.title, cwd: s.cwd ?? old?.cwd, updatedAt: old?.updatedAt ?? s.updatedAt, raw: old?.raw ?? '', text: old?.text ?? '' });
    }
    this.pending = stale.length;
    // A few at a time: Codex reads go through its app-server
    for (let i = 0; i < stale.length; i += 4) {
      await Promise.all(stale.slice(i, i + 4).map(async s => {
        try {
          const { messages, cwd } = await this.loaders.load(s.provider, s.id);
          const raw = chatText(messages);
          this.chats.set(`${s.provider}:${s.id}`, { provider: s.provider, id: s.id, title: s.title, cwd: s.cwd ?? cwd, updatedAt: s.updatedAt, raw, text: raw.toLowerCase() });
        } catch {
          // Unreadable right now (e.g. being rewritten): index the title only
          this.chats.set(`${s.provider}:${s.id}`, { provider: s.provider, id: s.id, title: s.title, cwd: s.cwd, updatedAt: s.updatedAt, raw: '', text: '' });
        } finally {
          this.pending--;
        }
      }));
    }
  }

  /** Refresh, but give up waiting after `ms` (the refresh keeps going in the background). */
  async refreshFor(ms: number): Promise<void> {
    await Promise.race([this.refresh(), new Promise(r => setTimeout(r, ms))]);
  }

  list(opts: { provider?: AgentProvider; folder?: string; limit?: number } = {}): IndexedChat[] {
    const folder = opts.folder?.toLowerCase();
    return [...this.chats.values()]
      .filter(c => !opts.provider || c.provider === opts.provider)
      .filter(c => !folder || (c.cwd ?? '').toLowerCase().includes(folder) || c.title.toLowerCase().includes(folder))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, opts.limit ?? 20);
  }

  search(query: string, opts: { provider?: AgentProvider; limit?: number } = {}, now = Date.now()): SearchHit[] {
    const q = terms(query);
    return [...this.chats.values()]
      .filter(c => !opts.provider || c.provider === opts.provider)
      .map(c => ({ c, score: scoreChat(c, q, now) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 8)
      .map(({ c, score }) => ({ provider: c.provider, id: c.id, title: c.title, folder: c.cwd, updatedAt: c.updatedAt, score: Math.round(score * 10) / 10, snippet: snippet(c, q) }));
  }

  get(provider: AgentProvider, id: string): IndexedChat | undefined {
    return this.chats.get(`${provider}:${id}`);
  }

  get size(): number {
    return this.chats.size;
  }
}
