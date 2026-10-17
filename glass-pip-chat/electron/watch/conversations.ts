import fs from 'node:fs';
import { chatUserText, chatTitle } from '../agent/chatTitle.js';
import { randomUUID } from 'node:crypto';
import type { AgentHistoryMessage, AgentProvider, AgentSessionSnapshot, AgentSessionSummary, AgentUsage } from '../agent/types.js';
import { parseWatchReply, type WatchReply } from './protocol.js';
import type { ActivityState } from './activity.js';
import { browserActivity } from '../agent/browserActivity.js';

export interface WatchMessage extends WatchReply { id: string; role: 'user' | 'assistant'; timestamp: number; steps?: ActivityState['steps']; usage?: AgentUsage }
export interface WatchChat { id: string; provider: AgentProvider; title: string; cwd: string; sessionId?: string; updatedAt: number; messages: WatchMessage[] }
interface Dependencies {
  list: (provider: AgentProvider, limit: number) => Promise<AgentSessionSummary[]>;
  load: (provider: AgentProvider, id: string) => Promise<AgentSessionSnapshot>;
}
export const chatSummary = ({ messages: _messages, ...chat }: WatchChat) => chat;
const userText = chatUserText;

export function watchHistory(messages: AgentHistoryMessage[]): WatchMessage[] {
  return messages.map((m, index) => ({
    id: `history-${index}`, role: m.role, timestamp: m.timestamp,
    ...(m.role === 'user' ? { text: userText(m.content), components: [] } : parseWatchReply(m.content || m.segments?.filter(s => s.type === 'text').map(s => s.content).join('\n') || '')),
    usage: m.usage,
    steps: m.segments?.flatMap(s => s.toolExecution ? [{ id: s.toolExecution.id, name: s.toolExecution.name,
      ...(browserActivity(s.toolExecution.name, s.toolExecution.parameters) ?? (/cua_repl/i.test(s.toolExecution.name) ? { kind: 'other' as const } : {})),
      status: s.toolExecution.status === 'executing' ? 'running' as const : s.toolExecution.status === 'error' ? 'error' as const : 'done' as const,
      detail: String(s.toolExecution.error ?? s.toolExecution.result ?? '').slice(0, 3200) }] : []),
  }));
}

/** Stable watch identities link to native sessions; reads never acquire a writer. */
export class WatchConversations {
  private chats: WatchChat[] = [];
  constructor(private file: string, private deps: Dependencies, legacy: Partial<Record<AgentProvider, string>>, cwd: string) {
    try { this.chats = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Watch chat history could not be read'); }
    for (const provider of ['codex', 'claude'] as const) {
      const sessionId = legacy[provider];
      if (sessionId && !this.chats.some(c => c.provider === provider && (c.sessionId === sessionId || c.id === `${provider}:${sessionId}`))) {
        this.chats.push({ id: `${provider}:${sessionId}`, provider, sessionId, cwd, title: `Previous watch chat · ${provider === 'codex' ? 'Codex' : 'Claude'}`, updatedAt: Date.now(), messages: [] });
      }
    }
    this.save();
  }
  async repairTitles(repair: (id: string, title: string) => Promise<void>) {
    for (const chat of this.chats) {
      if (chat.provider !== 'codex' || !chat.sessionId || chat.title === 'New watch chat') continue;
      try { await repair(chat.sessionId, chat.title); } catch { /* Retry next launch; history remains available. */ }
    }
  }
  save() { fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.chats)); fs.renameSync(this.file + '.tmp', this.file); }
  create(provider: AgentProvider, cwd: string, id: string = randomUUID()): WatchChat {
    const existing = this.chats.find(c => c.id === id);
    if (existing) return existing;
    const chat: WatchChat = { id, provider, cwd, title: 'New watch chat', updatedAt: Date.now(), messages: [] };
    this.chats.push(chat); this.save(); return chat;
  }
  async get(id: string): Promise<WatchChat> {
    const existing = this.chats.find(c => c.id === id);
    if (existing) return existing;
    const match = /^(codex|claude):([\w-]+)$/.exec(id);
    if (!match) throw new Error('Chat not found. Choose it again from Chats.');
    const provider = match[1] as AgentProvider;
    const snapshot = await this.deps.load(provider, match[2]);
    const sessionId = snapshot.sessionId ?? match[2];
    const linked = this.chats.find(c => c.provider === provider && c.sessionId === sessionId);
    if (linked) return linked;
    const messages = watchHistory(snapshot.messages);
    const chat: WatchChat = { id, provider, sessionId, cwd: snapshot.cwd ?? '', title: snapshot.title || messages.find(m => m.role === 'user')?.text.slice(0, 80) || `${provider} chat`, updatedAt: messages.at(-1)?.timestamp || Date.now(), messages };
    this.chats.push(chat); this.save(); return chat;
  }
  async history(chat: WatchChat): Promise<WatchMessage[]> {
    if (chat.sessionId) {
      const snapshot = await this.deps.load(chat.provider, chat.sessionId);
      chat.sessionId = snapshot.sessionId ?? chat.sessionId;
      chat.cwd = snapshot.cwd ?? chat.cwd;
      chat.title = snapshot.title ?? chat.title;
      chat.messages = watchHistory(snapshot.messages);
      this.save();
    }
    return chat.messages;
  }
  /** Refresh the native folder immediately before submission, without acquiring a writer. */
  async prepareRun(id: string): Promise<WatchChat> {
    const chat = await this.get(id);
    if (chat.sessionId) {
      const snapshot = await this.deps.load(chat.provider, chat.sessionId);
      if (snapshot.cwd) { chat.cwd = snapshot.cwd; this.save(); }
    }
    if (chat.cwd && !fs.existsSync(chat.cwd)) {
      throw new Error(`This chat's working folder is no longer available: ${chat.cwd}. Open the original chat on your desktop and select its current project folder, then retry.`);
    }
    return chat;
  }
  async list(provider: AgentProvider, offset = 0) {
    const limit = offset + 31;
    const external = await this.deps.list(provider, limit);
    for (const chat of this.chats.filter(c => c.provider === provider)) {
      const native = external.find(s => s.id === chat.sessionId);
      if (native && native.title !== 'Ally chat') { chat.title = native.title; chat.updatedAt = Math.max(chat.updatedAt, native.updatedAt); }
    }
    const linked = new Set(this.chats.filter(c => c.provider === provider).map(c => c.sessionId).filter((id): id is string => !!id));
    const all = [...this.chats.filter(c => c.provider === provider).map(chatSummary), ...external.filter(s => !linked.has(s.id) && !(s.originalSessionId && linked.has(s.originalSessionId))).map(s => ({ id: `${provider}:${s.id}`, provider, sessionId: s.id, title: userText(s.title), cwd: s.cwd ?? '', updatedAt: s.updatedAt }))].sort((a, b) => b.updatedAt - a.updatedAt);
    return { chats: all.slice(offset, offset + 30), nextOffset: all.length > offset + 30 ? offset + 30 : null };
  }
  running(sessions: AgentSessionSummary[], activeChatIds: string[] = []) {
    const rows = new Map<string, ReturnType<typeof chatSummary>>();
    for (const session of sessions) {
      const linked = this.chats.find(c => c.provider === session.provider && (c.sessionId === session.id || (!!session.originalSessionId && c.sessionId === session.originalSessionId)));
      const row = linked ? { ...chatSummary(linked), title: chatTitle(session.title), cwd: session.cwd ?? linked.cwd, updatedAt: session.updatedAt }
        : { id: `${session.provider}:${session.id}`, provider: session.provider, sessionId: session.id, title: chatTitle(session.title), cwd: session.cwd ?? '', updatedAt: session.updatedAt };
      rows.set(row.id, row);
    }
    for (const id of activeChatIds) {
      const chat = this.chats.find(c => c.id === id);
      if (chat && !rows.has(id)) rows.set(id, chatSummary(chat));
    }
    return { chats: [...rows.values()].sort((a, b) => b.updatedAt - a.updatedAt) };
  }
  link(chat: WatchChat, sessionId: string) { chat.sessionId = sessionId; this.save(); }
  record(chat: WatchChat, transcript: string, reply: WatchReply, activity: ActivityState, turnId: string) {
    chat.messages.push({ id: `${turnId}-user`, role: 'user', text: transcript, components: [], timestamp: Date.now() }, { id: `${turnId}-assistant`, role: 'assistant', ...reply, steps: activity.steps, usage: activity.usage, timestamp: Date.now() });
    if (chat.title === 'New watch chat') chat.title = transcript.slice(0, 80);
    chat.updatedAt = Date.now(); this.save();
  }
}
