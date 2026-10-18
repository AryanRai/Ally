import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { AgentProvider } from './types.js';

export interface ChatReadState { key: string; revision: string; unread: boolean }
interface Entry { revision: string; unread: boolean; source?: string; nativeTurn?: string; pending?: boolean }
/** One durable read receipt per exact provider/session, shared by every Ally client.
 * A receipt acknowledges only the revision actually rendered, never a later reply. */
export class UnreadStore {
  private entries: Record<string, Entry> = {};
  private attention = new Map<string, Set<string>>();
  constructor(private file?: string) {
    if (file) try { this.entries = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
  private save() { if (this.file) { fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.entries)); fs.renameSync(this.file + '.tmp', this.file); } }
  get(key: string): ChatReadState { const entry = this.entries[key]; return { key, revision: entry?.revision ?? '', unread: !!this.attention.get(key)?.size || (entry?.unread ?? false) }; }
  list(): ChatReadState[] { return [...new Set([...Object.keys(this.entries), ...this.attention.keys()])].map(key => this.get(key)); }
  needsAttention(key: string, id: string, pending: boolean) {
    // Keep an explicit false state after attention on a chat without any reply.
    // Clients retain missing keys through reconnect, so omission cannot clear a dot.
    if (pending && !this.entries[key]) this.entries[key] = { revision: '', unread: false };
    const requests = this.attention.get(key) ?? new Set<string>();
    if (pending) requests.add(id); else requests.delete(id);
    if (requests.size) this.attention.set(key, requests); else this.attention.delete(key);
  }
  complete(key: string, source: string) {
    if (this.entries[key]?.source === source) return this.get(key);
    this.entries[key] = { ...this.entries[key], revision: randomUUID(), unread: true, pending: false, source }; this.save(); return this.get(key);
  }
  native(key: string, unread: boolean) {
    if (unread) this.complete(key, 'native:' + randomUUID());
    else if (this.entries[key]?.unread) { this.entries[key].unread = false; this.save(); }
    return this.get(key);
  }
  snapshot(key: string, unread: boolean, turnId: string) {
    const old = this.entries[key];
    if (!unread) this.native(key, false);
    else if (!old || old.nativeTurn !== turnId) this.complete(key, 'native-snapshot:' + turnId);
    this.entries[key] = { ...this.entries[key] ?? { revision: '', unread: false }, nativeTurn: turnId };
    this.save(); return this.get(key);
  }
  track(key: string) {
    const entry = this.entries[key] ?? { revision: '', unread: false };
    if (!entry.pending) { this.entries[key] = { ...entry, pending: true }; this.save(); }
  }
  tracked() { return Object.entries(this.entries).filter(([, entry]) => entry.pending).map(([key]) => key); }
  read(key: string, revision: string) {
    const entry = this.entries[key];
    if (!entry || !revision || entry.revision !== revision) return false;
    if (entry.unread) { entry.unread = false; this.save(); }
    return true;
  }
}
let store = new UnreadStore();
export function configureUnread(file: string) { store = new UnreadStore(file); }
export const chatKey = (provider: AgentProvider, id: string) => `${provider}:${id}`;
export const unreadState = (provider: AgentProvider, id: string) => store.get(chatKey(provider, id));
export const allReadStates = () => store.list();
export const completeUnread = (provider: AgentProvider, id: string, source: string) => store.complete(chatKey(provider, id), source);
export const nativeUnread = (id: string, unread: boolean) => store.native(chatKey('codex', id), unread);
export const acknowledgeUnread = (provider: AgentProvider, id: string, revision: string) => store.read(chatKey(provider, id), revision);

export const nativeUnreadSnapshot = (id: string, unread: boolean, turnId: string) => store.snapshot(chatKey('codex', id), unread, turnId);
export const trackUnread = (provider: AgentProvider, id: string) => store.track(chatKey(provider, id));
export const trackedUnread = () => store.tracked();
export const setChatAttention = (key: string, requestId: string, pending: boolean) => store.needsAttention(key, requestId, pending);
