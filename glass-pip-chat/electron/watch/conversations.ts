import { codexAccounts } from '../agent/codexAccounts.js';
import { hiddenConversation, resolveCodexDiscovery } from '../agent/codexDiscovery.js';
import { unreadState } from '../agent/unread.js';
import fs from 'node:fs';
import { chatUserText, chatTitle } from '../agent/chatTitle.js';
import { randomUUID } from 'node:crypto';
import type { AgentHistoryMessage, AgentProvider, AgentSessionSnapshot, AgentSessionSummary, AgentUsage } from '../agent/types.js';
import { type WatchReply } from './protocol.js';
import { describeActivityInput, type ActivityState } from './activity.js';
import { historyActivityTimeline, presentActivityTimeline, type ActivityEntry } from './activityTimeline.js';
import { browserActivity } from '../agent/browserActivity.js';
import type { DeviceAttachment, DeviceMedia } from './media.js';
import { deviceHistoryReply, deviceUserText } from './presentation.js';

export interface WatchMessage extends WatchReply { id: string; role: 'user' | 'assistant'; timestamp: number; steps?: ActivityState['steps']; usage?: AgentUsage; attachments?: DeviceAttachment[]; commentary?: string[]; timeline?: ActivityEntry[]; durationMs?: number }
export interface WatchChat { codexAccountId?: string; id: string; provider: AgentProvider; title: string; cwd: string; sessionId?: string; createdAt?: number; updatedAt: number; messages: WatchMessage[] }
interface Dependencies {
  list: (provider: AgentProvider, limit: number) => Promise<AgentSessionSummary[]>;
  load: (provider: AgentProvider, id: string) => Promise<AgentSessionSnapshot>;
}
export const chatSummary = ({ messages: _messages, ...chat }: WatchChat) => ({ ...chat, unread: unreadState(chat.provider, chat.sessionId ?? chat.id).unread });
const userText = chatUserText;

export function watchHistory(messages: AgentHistoryMessage[], media?: DeviceMedia): WatchMessage[] {
  return messages.map((m, index) => ({
    id: `history-${index}`, role: m.role, timestamp: m.timestamp,
    ...(m.role === 'user' ? { text: deviceUserText(userText(m.content)), components: [] } : deviceHistoryReply(m)),
    usage: m.usage, timeline: historyActivityTimeline(m), durationMs: m.usage?.durationMs,
    ...(media ? { attachments: [...media.dataUrls(m.images, 'Attached image'),
      ...(m.role === 'assistant' ? media.markdown(m.content) : []),
      // One sequence per message, so several tool screenshots are numbered 1, 2, 3 rather than all "1".
      ...media.dataUrls(m.segments?.flatMap(s => s.toolExecution?.images ?? []), 'Tool screenshot')].filter((asset, i, all) => all.findIndex(a => a.id === asset.id) === i).slice(0, 12) } : {}),
    steps: m.segments?.flatMap(s => s.toolExecution ? [{ id: s.toolExecution.id, name: s.toolExecution.name,
      ...(browserActivity(s.toolExecution.name, s.toolExecution.parameters) ?? (/cua_repl/i.test(s.toolExecution.name) ? { kind: 'other' as const } : {})),
      startedAt: s.toolExecution.startTime, endedAt: s.toolExecution.endTime,
      ...(media && s.toolExecution.images?.length ? { attachments: media.dataUrls(s.toolExecution.images, 'Tool screenshot') } : {}),
      status: s.toolExecution.status === 'executing' ? 'running' as const : s.toolExecution.status === 'error' ? 'error' as const : 'done' as const,
      detail: [describeActivityInput(s.toolExecution.parameters ?? {}), String(s.toolExecution.error ?? s.toolExecution.result ?? '').slice(0, 1600)].filter(Boolean).join('\n\n') }] : []),
  }));
}

/** Stable watch identities link to native sessions; reads never acquire a writer. */
export class WatchConversations {
  private chats: WatchChat[] = [];
  constructor(private file: string, private deps: Dependencies, legacy: Partial<Record<AgentProvider, string>>, cwd: string, private media?: DeviceMedia) {
    try { this.chats = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Watch chat history could not be read'); }
    for (const provider of ['codex', 'claude'] as const) {
      const sessionId = legacy[provider];
      if (sessionId && !this.chats.some(c => c.provider === provider && (c.sessionId === sessionId || c.id === `${provider}:${sessionId}`))) {
        this.chats.push({ id: `${provider}:${sessionId}`, provider, sessionId, cwd, title: `Previous watch chat · ${provider === 'codex' ? 'Codex' : 'Claude'}`, updatedAt: Date.now(), messages: [] });
      }
    }
    for (const chat of this.chats) chat.createdAt ??= chat.messages.find(m => m.timestamp > 0)?.timestamp ?? chat.updatedAt;
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
    const chat: WatchChat = { id, provider, cwd, ...(provider === 'codex' ? { codexAccountId: codexAccounts.route() } : {}), title: 'New watch chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
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
    const messages = watchHistory(snapshot.messages, this.media);
    const chat: WatchChat = { id, provider, sessionId, codexAccountId: snapshot.codexAccountId, cwd: snapshot.cwd ?? '', title: chatTitle(snapshot.title || messages.find(m => m.role === 'user')?.text || `${provider} chat`), createdAt: snapshot.createdAt ?? messages.find(m => m.timestamp > 0)?.timestamp ?? 0, updatedAt: messages.at(-1)?.timestamp || 0, messages };
    this.chats.push(chat); this.save(); return chat;
  }
  private async loadLinkedSession(chat: WatchChat): Promise<AgentSessionSnapshot> {
    const linked = chat.sessionId!;
    try { return await this.deps.load(chat.provider, linked); }
    catch (error) {
      // A failed CLI resume can announce a new ID without ever creating its
      // transcript. Recover only the original identity encoded in this chat,
      // and only after the loader confirms that the replacement is missing.
      const original = chat.id.startsWith(`${chat.provider}:`) ? chat.id.slice(chat.provider.length + 1) : '';
      if (!original || original === linked || !(error instanceof Error) || error.message !== `${chat.provider} session ${linked} not found`) throw error;
      const snapshot = await this.deps.load(chat.provider, original);
      chat.sessionId = original;
      this.save();
      return snapshot;
    }
  }
  async history(chat: WatchChat): Promise<WatchMessage[]> {
    if (chat.sessionId) {
      const snapshot = await this.loadLinkedSession(chat);
      chat.sessionId = snapshot.sessionId ?? chat.sessionId;
      chat.cwd = snapshot.cwd ?? chat.cwd;
      chat.title = snapshot.title ?? chat.title;
      const rebuilt = watchHistory(snapshot.messages, this.media);
      // Native history may omit uploaded file metadata; preserve it on the matching user message.
      const remaining = chat.messages.filter(m => m.role === 'user');
      for (const message of rebuilt) if (message.role === 'user') {
        const index = remaining.findIndex(m => m.text === message.text);
        const saved = index < 0 ? undefined : remaining.splice(index, 1)[0];
        if (saved?.attachments?.length) message.attachments = [...new Map([...(message.attachments ?? []), ...saved.attachments!].map(a => [a.id, a])).values()];
      }
      const savedAnswers = chat.messages.filter(m => m.role === 'assistant');
      for (const message of rebuilt) if (message.role === 'assistant') {
        const index = savedAnswers.findIndex(m => m.text === message.text);
        const saved = index < 0 ? undefined : savedAnswers.splice(index, 1)[0];
        if (saved && message.durationMs == null) message.durationMs = saved.durationMs;
      }
      chat.messages = rebuilt;
      this.save();
    }
    return chat.messages;
  }
  /** The glance reader needs current text, not every historical attachment or a
   * scan of all running chats. Full history remains available in history(). */
  async preview(chat: WatchChat): Promise<{ messages: WatchMessage[]; running: boolean }> {
    if (!chat.sessionId) return { messages: chat.messages.slice(-30), running: false };
    const snapshot = await this.loadLinkedSession(chat);
    return { messages: watchHistory(snapshot.messages.slice(-30)), running: !!snapshot.running };
  }
  /** Refresh the native folder immediately before submission, without acquiring a writer. */
  async prepareRun(id: string): Promise<WatchChat> {
    const chat = await this.get(id);
    if (chat.sessionId) {
      const snapshot = await this.loadLinkedSession(chat);
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
    if (provider === 'codex') await Promise.all(this.chats.filter(c => c.provider === provider && c.sessionId).map(c => resolveCodexDiscovery(c.sessionId!)));
    for (const chat of this.chats.filter(c => c.provider === provider)) {
      const native = external.find(s => s.id === chat.sessionId);
      if (native) {
        if (native.title !== 'Ally chat') chat.title = native.title;
        if (native.createdAt) chat.createdAt = native.createdAt;
        chat.updatedAt = Math.max(chat.updatedAt, native.updatedAt);
      }
    }
    const linked = new Set(this.chats.filter(c => c.provider === provider).map(c => c.sessionId).filter((id): id is string => !!id));
    const savedIds = new Set(this.chats.filter(c => c.provider === provider).map(c => c.id));
    const all = [...this.chats.filter(c => c.provider === provider && !hiddenConversation(c.provider, c.sessionId ?? c.id)).map(chatSummary), ...external.filter(s => !hiddenConversation(provider, s.id) && !savedIds.has(`${provider}:${s.id}`) && !linked.has(s.id) && !(s.originalSessionId && linked.has(s.originalSessionId))).map(s => ({ id: `${provider}:${s.id}`, provider, sessionId: s.id, title: userText(s.title), cwd: s.cwd ?? '', createdAt: s.createdAt ?? 0, updatedAt: s.updatedAt, unread: unreadState(provider, s.id).unread }))].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    return { chats: all.slice(offset, offset + 30), nextOffset: all.length > offset + 30 ? offset + 30 : null };
  }
  routingPreview(id: string): string {
    return this.chats.find(c => c.id === id)?.messages.filter(m => m.role === 'user').slice(-2).map(m => m.text).join('\n').slice(-500) ?? '';
  }
  activityChat(id: string) { const chat = this.chats.find(c => c.id === id); return chat && chatSummary(chat); }
  activitySession(provider: AgentProvider, sessionId: string) { const chat=this.chats.find(c=>c.provider===provider && (c.sessionId===sessionId || c.id===sessionId)); return chat && chatSummary(chat); }
  running(sessions: AgentSessionSummary[], activeChatIds: string[] = []) {
    const rows = new Map<string, ReturnType<typeof chatSummary>>();
    for (const session of sessions) {
      if (hiddenConversation(session.provider, session.id)) continue;
      const linked = this.chats.find(c => c.provider === session.provider && (c.sessionId === session.id || (!!session.originalSessionId && c.sessionId === session.originalSessionId)));
      const row = linked ? { ...chatSummary(linked), title: chatTitle(session.title), cwd: session.cwd ?? linked.cwd, updatedAt: session.updatedAt }
        : { id: `${session.provider}:${session.id}`, provider: session.provider, sessionId: session.id, title: chatTitle(session.title), cwd: session.cwd ?? '', createdAt: session.createdAt ?? 0, updatedAt: session.updatedAt, unread: unreadState(session.provider, session.id).unread };
      rows.set(row.id, row);
    }
    for (const id of activeChatIds) {
      const chat = this.chats.find(c => c.id === id);
      if (chat && !rows.has(id)) rows.set(id, chatSummary(chat));
    }
    return { chats: [...rows.values()].filter(c => !hiddenConversation(c.provider, c.sessionId ?? c.id)).sort((a, b) => b.updatedAt - a.updatedAt) };
  }
  link(chat: WatchChat, sessionId: string) { chat.sessionId = sessionId; this.save(); }
  record(chat: WatchChat, transcript: string, reply: WatchReply, activity: ActivityState, turnId: string, uploads: DeviceAttachment[] = [], startedAt = Date.now()) {
    chat.messages.push({ id: `${turnId}-user`, role: 'user', text: transcript, attachments: uploads, components: [], timestamp: startedAt }, { id: `${turnId}-assistant`, role: 'assistant', ...reply, attachments: [...activity.steps.flatMap(s => s.attachments ?? []), ...this.media?.markdown(reply.text) ?? []].slice(0, 12), steps: activity.steps, timeline: presentActivityTimeline(activity.timeline), commentary: presentActivityTimeline(activity.timeline).flatMap(row => row.type === 'update' ? [row.text] : []), durationMs: activity.durationMs, usage: activity.usage, timestamp: Date.now() });
    if (chat.title === 'New watch chat') chat.title = transcript.slice(0, 80);
    chat.updatedAt = Date.now(); this.save();
  }
}
