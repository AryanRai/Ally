import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { setChatAttention } from '../agent/unread.js';
import type { ApprovalAnswer, WatchApproval } from '../watch/approvals.js';

export interface ChatInteraction extends WatchApproval {
  chatId: string; createdAt?: number; kind: 'approval' | 'question'; targetDeviceId?: string; deviceAction?: string;
  desktopOnly?: boolean;
}
export interface InteractionHistory extends ChatInteraction {
  state: 'pending' | 'answered' | 'expired' | 'cancelled';
  closedAt?: number; answeredOn?: string; decision?: string; values?: Record<string, string>;
}
type Event = { type: 'interaction'; request: ChatInteraction } | { type: 'interaction_closed'; id: string; chatId: string; state: 'answered' | 'expired' | 'cancelled'; answeredOn?: string; decision?: string; values?: Record<string, string> };
interface Pending { request: ChatInteraction; answer: (answer: ApprovalAnswer) => void; cancel: () => void; timer: ReturnType<typeof setTimeout>; answering: boolean }
export function originatingChat(args: Record<string, unknown>, caller?: string): string {
  const value = caller || args.chatId;
  if (typeof value !== 'string' || !/^(codex|claude):[\w-]{8,100}$/.test(value)) throw Error('Provide the originating chatId as provider:sessionId so the request appears in the correct conversation.');
  if (caller && args.chatId && args.chatId !== caller) throw Error('chatId does not match the calling chat.');
  return value;
}

/** Only genuine server-held requests enter this registry. No MCP tool can answer it. */
export class InteractionBroker {
  private pending = new Map<string, Pending>();
  private answered = new Map<string, string>();
  private listeners = new Set<(event: Event) => void>();
  private records = new Map<string, InteractionHistory>();
  private file?: string;
  constructor(private attention = setChatAttention, private now = Date.now) {}
  configure(file: string) {
    this.file = file; this.records.clear();
    try {
      const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const row of Array.isArray(rows) ? rows : []) {
        if (!row || typeof row.id !== 'string' || typeof row.chatId !== 'string' || !Array.isArray(row.fields) || !Array.isArray(row.actions)) continue;
        this.records.set(row.id, row.state === 'pending' ? { ...row, state: 'cancelled', closedAt: this.now() } : row);
      }
      this.save();
    } catch { /* Never recreate a pending approval from disk. */ }
  }
  history(chatId: string) { return [...this.records.values()].filter(row => row.chatId === chatId).map(row => structuredClone(row)); }
  private save() { try { if (this.file) fs.writeFileSync(this.file, JSON.stringify([...this.records.values()])); } catch { /* Keep live consent available if persistence fails. */ } }
  list(chatId?: string) { return [...this.pending.values()].filter(p => !chatId || p.request.chatId === chatId).map(p => structuredClone(p.request)); }
  subscribe(listener: (event: Event) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(event: Event) { for (const listener of this.listeners) { try { listener(event); } catch { /* One disconnected client cannot block consent state. */ } } }
  add(request: ChatInteraction, answer: Pending['answer'], cancel: Pending['cancel']): () => void {
    originatingChat({ chatId: request.chatId });
    if (this.pending.size >= 64 || this.pending.has(request.id) || this.answered.has(request.id) || request.expiresAt <= this.now() || request.expiresAt > this.now() + 600_000 || JSON.stringify(request).length > 12000) throw Error('Interaction unavailable or too large.');
    const immutable = { ...structuredClone(request), createdAt: this.now() };
    const timer = setTimeout(() => this.close(request.id, 'expired'), request.expiresAt - this.now());
    this.pending.set(request.id, { request: immutable, answer, cancel, timer, answering: false });
    this.records.set(request.id, { ...structuredClone(immutable), state: 'pending' }); this.save();
    this.attention(request.chatId, request.id, true); this.emit({ type: 'interaction', request: structuredClone(immutable) });
    return () => this.close(request.id, 'cancelled');
  }
  request(spec: Omit<ChatInteraction, 'id' | 'expiresAt'> & { id?: string; expiresAt?: number }, signal: AbortSignal): Promise<ApprovalAnswer> {
    if (signal.aborted) return Promise.resolve({ action: 'cancel' });
    return new Promise((resolve, reject) => {
      let dispose: () => void;
      const abort = () => dispose?.();
      const finish = (answer: ApprovalAnswer) => { signal.removeEventListener('abort', abort); resolve(answer); };
      try { dispose = this.add({ ...spec, id: spec.id || randomUUID(), expiresAt: spec.expiresAt || this.now() + 120000 }, finish, () => finish({ action: 'cancel' })); }
      catch (error) { reject(error); return; }
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  answer(id: string, answer: ApprovalAnswer, answeredOn: string) {
    if (!answer || typeof answer.action !== 'string' || (answer.values != null && (typeof answer.values !== 'object' || Array.isArray(answer.values)))) throw Error('Invalid answer.');
    const fingerprint = JSON.stringify({ action: answer.action, values: Object.entries(answer.values ?? {}).sort(([a], [b]) => a.localeCompare(b)) });
    if (this.answered.get(id) === fingerprint) return;
    const entry = this.pending.get(id);
    if (!entry || entry.answering) throw Error('This request was already answered or cancelled.');
    if (entry.request.desktopOnly && answeredOn !== 'desktop') throw Error('Answer this private question in Ally on your desktop.');
    if (entry.request.expiresAt <= this.now()) { this.close(id, 'expired'); throw Error('This request expired.'); }
    if (!entry.request.actions.some(a => a.value === answer.action)) throw Error('Invalid decision.');
    if (Object.keys(answer.values ?? {}).some(key => !entry.request.fields.some(field => field.id === key))) throw Error('Unknown question field.');
    if (answer.action === 'submit') for (const field of entry.request.fields) {
      const value = answer.values?.[field.id];
      if (value == null && !field.required) continue;
      if (typeof value !== 'string' || value.length > 4000 || (field.required && !value.trim()) || (!field.freeText && !field.options.some(o => o.value === value))) throw Error('Choose an answer for every required question.');
    }
    entry.answering = true;
    try { entry.answer(answer); } catch (error) { entry.answering = false; throw error; }
    clearTimeout(entry.timer); this.pending.delete(id);
    this.answered.set(id, fingerprint); while (this.answered.size > 256) this.answered.delete(this.answered.keys().next().value!);
    const values = answer.values && Object.fromEntries(Object.entries(answer.values).filter(([key]) => !entry.request.fields.find(field => field.id === key)?.secret));
    this.records.set(id, { ...structuredClone(entry.request), state: 'answered', closedAt: this.now(), answeredOn, decision: answer.action, ...(values ? { values } : {}) }); this.save();
    this.attention(entry.request.chatId, id, false); this.emit({ type: 'interaction_closed', id, chatId: entry.request.chatId, state: 'answered', answeredOn, decision: answer.action, values });
  }
  private close(id: string, state: 'expired' | 'cancelled') {
    const entry = this.pending.get(id); if (!entry || entry.answering) return;
    clearTimeout(entry.timer); this.pending.delete(id); entry.cancel();
    this.records.set(id, { ...structuredClone(entry.request), state, closedAt: this.now() }); this.save();
    this.attention(entry.request.chatId, id, false); this.emit({ type: 'interaction_closed', id, chatId: entry.request.chatId, state });
  }
  closeAll() { for (const id of this.pending.keys()) this.close(id, 'cancelled'); }
}
export const interactions = new InteractionBroker();
