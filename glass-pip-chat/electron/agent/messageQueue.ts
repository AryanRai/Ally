import fs from 'node:fs';
import path from 'node:path';

import type { QueueItem, QueueSnapshot, QueueChange } from './messageQueueTypes.js';
export type { QueueItem, QueueSnapshot, QueueChange } from './messageQueueTypes.js';
export interface QueuedMessage extends QueueItem {
  images?: string[]; suffix?: string; uploads?: unknown[]; permission?: 'readonly' | 'edit' | 'full'; uncertain?: boolean;
}
type ChatQueue = { revision: number; items: QueuedMessage[]; receipts: Record<string, string> };

/** One authority for every surface. A sending item is immutable; stale clients cannot reorder a changed queue. */
export class MessageQueue {
  private chats = new Map<string, ChatQueue>();
  private file?: string;
  private consumers = new Map<string, (item: QueuedMessage) => Promise<void>>();
  private fallback?: (chatId: string, item: QueuedMessage) => Promise<void>;
  private handoffs = new Map<string, Promise<void>>();
  async settled(key: string) { await this.handoffs.get(key)?.catch(() => {}); }
  configure(file: string) {
    this.file = file;
    this.chats.clear();
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [key, value] of Object.entries(data) as Array<[string, ChatQueue]>) {
        if (!value || !Array.isArray(value.items) || !Number.isInteger(value.revision) || !value.receipts) continue;
        for (const item of value.items) {
          // A restart cannot prove whether the agent received an in-flight handoff.
          if (item.state === 'sending') { item.state = 'failed'; item.uncertain = true; item.error = 'Delivery unconfirmed after restart. Check chat history before resending.'; }
        }
        value.revision++; this.chats.set(key, value);
      }
    } catch { /* first launch */ }
  }
  private queue(key: string): ChatQueue {
    if (typeof key !== 'string' || !key || key.length > 300) throw Error('Invalid queue chat');
    let q = this.chats.get(key);
    if (!q) { q = { revision: 0, items: [], receipts: {} }; this.chats.set(key, q); }
    return q;
  }
  private changed(q: ChatQueue) {
    q.revision++;
    if (this.file) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', JSON.stringify(Object.fromEntries(this.chats)));
      fs.renameSync(this.file + '.tmp', this.file);
    }
  }
  snapshot(key: string): QueueSnapshot {
    const q = this.queue(key);
    return { chatId: key, revision: q.revision, items: q.items.map(({ id, text, createdAt, state, error, attachments }) => ({ id, text, createdAt, state, error, attachments: attachments.map(a => ({ name: a.name })) })) };
  }
  hasReceipt(key: string, id: string) { return !!this.queue(key).receipts[id]; }
  keys() { return [...this.chats.keys()].filter(key => this.queue(key).items[0]?.state === 'queued'); }
  move(from: string, to: string) {
    if (from === to) return;
    const source = this.queue(from), target = this.queue(to);
    target.items.push(...source.items.filter(i => !target.items.some(j => j.id === i.id)));
    target.receipts = { ...source.receipts, ...target.receipts }; source.items = []; this.changed(source); this.changed(target);
  }
  enqueue(key: string, input: { id: string; text: string; images?: string[]; suffix?: string; uploads?: unknown[]; attachments?: Array<{ name: string }>; permission?: QueuedMessage['permission'] }) {
    const q = this.queue(key);
    if (!/^[\w-]{1,80}$/.test(input.id) || typeof input.text !== 'string' || (!input.text.trim() && !input.attachments?.length) || input.text.length > 12000) throw Error('Invalid queued message');
    const fingerprint = JSON.stringify(input);
    if (q.receipts[input.id]) {
      if (q.receipts[input.id] !== fingerprint) throw Error('Request ID already belongs to a different message');
      return this.snapshot(key);
    }
    if (q.items.length >= 64 || Object.keys(q.receipts).length >= 4096) throw Error('Queue is full. Finish or cancel pending messages first.');
    q.receipts[input.id] = fingerprint;
    q.items.push({ ...input, attachments: input.attachments ?? [], createdAt: Date.now(), state: 'queued' });
    this.changed(q); return this.snapshot(key);
  }
  register(key: string, send: (item: QueuedMessage) => Promise<void>) {
    if (this.consumers.has(key)) throw Error('This chat already has an active queue consumer');
    this.consumers.set(key, send);
    return () => { if (this.consumers.get(key) === send) this.consumers.delete(key); };
  }
  managed(key: string) { return this.consumers.has(key); }
  setFallback(send?: (key: string, item: QueuedMessage) => Promise<void>) { this.fallback = send; }
  claim(key: string, id?: string): QueuedMessage | undefined {
    const q = this.queue(key);
    if (q.items.some(i => i.state === 'sending')) return;
    const item = id ? q.items.find(i => i.id === id && i.state !== 'sending') : q.items[0]?.state === 'queued' ? q.items[0] : undefined;
    if (!item) return;
    if (item.uncertain) throw Error('Delivery is unconfirmed. Check history; cancel this item before sending a new message.');
    item.state = 'sending'; item.error = undefined; this.changed(q); return { ...item };
  }
  sent(key: string, id: string) { const q = this.queue(key); if (!q.items.some(i => i.id === id)) return; q.items = q.items.filter(i => i.id !== id); this.changed(q); }
  fail(key: string, id: string, error: string, uncertain = false) {
    const q = this.queue(key), item = q.items.find(i => i.id === id);
    if (item) { item.state = 'failed'; item.error = error; item.uncertain = uncertain; this.changed(q); }
  }
  pause(key: string, error: string) {
    const q = this.queue(key);
    for (const item of q.items) if (item.state === 'queued') { item.state = 'failed'; item.error = error; }
    this.changed(q);
  }
  async change(key: string, change: QueueChange): Promise<QueueSnapshot> {
    const q = this.queue(key);
    if (change.revision !== q.revision) throw Error('Queue changed on another device. Review the refreshed queue and try again.');
    if (change.action === 'reorder') {
      const order = change.order;
      if (!Array.isArray(order) || order.length !== q.items.length || new Set(order).size !== q.items.length || order.some(id => !q.items.some(i => i.id === id)) || q.items.some(i => i.state === 'sending')) throw Error('Queue changed or is sending. Refresh before reordering.');
      q.items = order.map(id => q.items.find(i => i.id === id)!); this.changed(q);
    } else {
      const item = q.items.find(i => i.id === change.id);
      if (!item || item.state === 'sending') throw Error('This message has already started sending.');
      if (change.action === 'cancel') { q.items = q.items.filter(i => i !== item); this.changed(q); }
      else if (change.action === 'edit') {
        if (typeof change.text !== 'string' || (!change.text.trim() && !item.attachments.length) || change.text.length > 12000) throw Error('Add a message (up to 12000 characters)');
        item.text = change.text; this.changed(q);
      } else if (change.action === 'send') {
        const send = this.consumers.get(key), fallback = this.fallback;
        if (!send && !fallback) throw Error('Reconnect to the desktop to send this message.');
        const claimed = this.claim(key, item.id);
        if (!claimed) throw Error('Another queued message is sending.');
        const delivery = Promise.resolve().then(async () => {
          try { if (send) await send(claimed); else await fallback!(key, claimed); this.sent(key, item.id); }
          catch (error) {
            const unavailable = (error as Error).name === 'QueueUnavailable';
            this.fail(key, item.id, (error as Error).message, !unavailable);
            if (unavailable) { item.state = 'queued'; this.changed(q); }
            throw error;
          }
        });
        this.handoffs.set(key, delivery);
        try { await delivery; } finally { this.handoffs.delete(key); }
      } else throw Error('Invalid queue action');
    }
    return this.snapshot(key);
  }
}
export function queueUnavailable(message: string) { const error = new Error(message); error.name = 'QueueUnavailable'; return error; }
export const messageQueue = new MessageQueue();
export const queuedPrompt = (item: QueuedMessage) => (item.text || 'Shared attachments') + (item.suffix ?? '');
