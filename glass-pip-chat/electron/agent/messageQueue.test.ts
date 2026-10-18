// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MessageQueue, queueUnavailable, queuedPrompt } from './messageQueue';

describe('shared message queue', () => {
  it('edits and reorders separate messages, retaining attachments and exact chat isolation', async () => {
    const q = new MessageQueue();
    q.enqueue('codex:original', { id: 'one', text: 'first', images: ['private.png'], suffix: '\nFiles: private.png', attachments: [{ name: 'Diagram' }] });
    q.enqueue('codex:original', { id: 'two', text: 'second' });
    q.enqueue('claude:original', { id: 'one', text: 'other chat' });
    let s = q.snapshot('codex:original');
    s = await q.change(s.chatId, { action: 'edit', id: 'one', text: 'edited', revision: s.revision });
    s = await q.change(s.chatId, { action: 'reorder', order: ['two', 'one'], revision: s.revision });
    const first = q.claim(s.chatId)!; expect(first.text).toBe('second'); q.sent(s.chatId, first.id);
    const second = q.claim(s.chatId)!; expect(second.images).toEqual(['private.png']); expect(queuedPrompt(second)).toBe('edited\nFiles: private.png');
    expect(q.snapshot('claude:original').items[0].text).toBe('other chat');
    expect(JSON.stringify(s)).not.toContain('private.png');
  });
  it('rejects stale edits and invalid permutations instead of losing messages from another device', async () => {
    const q = new MessageQueue(); let s = q.enqueue('chat', { id: 'one', text: 'first' });
    q.enqueue('chat', { id: 'two', text: 'second' });
    await expect(q.change('chat', { action: 'cancel', id: 'one', revision: s.revision })).rejects.toThrow('another device');
    s = q.snapshot('chat');
    await expect(q.change('chat', { action: 'reorder', order: ['one', 'one'], revision: s.revision })).rejects.toThrow('Refresh');
    expect(q.snapshot('chat').items).toHaveLength(2);
  });
  it('keeps cancellation and changed edits idempotent across network retries', async () => {
    const q = new MessageQueue(), input = { id: 'one', text: 'original' };
    let s = q.enqueue('chat', input);
    s = await q.change('chat', { action: 'edit', id: 'one', text: 'updated', revision: s.revision });
    expect(q.enqueue('chat', input).items[0].text).toBe('updated');
    s = await q.change('chat', { action: 'cancel', id: 'one', revision: s.revision });
    expect(q.enqueue('chat', input).items).toEqual([]);
    expect(() => q.enqueue('chat', { ...input, text: 'different' })).toThrow('different message');
  });
  it('claims atomically, blocks edits while sending and never duplicates concurrent send now', async () => {
    const q = new MessageQueue(); const s = q.enqueue('chat', { id: 'one', text: 'first' });
    let finish!: () => void; let count = 0;
    q.register('chat', async () => { count++; await new Promise<void>(resolve => { finish = resolve; }); });
    const sending = q.change('chat', { action: 'send', id: 'one', revision: s.revision });
    await Promise.resolve();
    expect(q.claim('chat')).toBeUndefined();
    await expect(q.change('chat', { action: 'send', id: 'one', revision: s.revision })).rejects.toThrow('changed');
    await expect(q.change('chat', { action: 'edit', id: 'one', text: 'oops', revision: q.snapshot('chat').revision })).rejects.toThrow('started');
    finish(); await sending; expect(count).toBe(1); expect(q.snapshot('chat').items).toEqual([]);
  });
  it('keeps unsupported send now queued but pauses ambiguous sends without automatic replay', async () => {
    const q = new MessageQueue(); let s = q.enqueue('chat', { id: 'one', text: 'first' });
    const close = q.register('chat', async () => { throw queueUnavailable('Wait for current response'); });
    await expect(q.change('chat', { action: 'send', id: 'one', revision: s.revision })).rejects.toThrow('Wait');
    expect(q.snapshot('chat').items[0].state).toBe('queued'); close();
    q.register('chat', async () => { throw Error('Connection lost after submit'); });
    s = q.snapshot('chat');
    await expect(q.change('chat', { action: 'send', id: 'one', revision: s.revision })).rejects.toThrow('lost');
    expect(q.claim('chat')).toBeUndefined();
    await expect(q.change('chat', { action: 'send', id: 'one', revision: q.snapshot('chat').revision })).rejects.toThrow('unconfirmed');
  });
  it('persists edits/order/cancel receipts and requires review of an interrupted handoff after restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-queue-test-'));
    try {
      const file = path.join(dir, 'queue.json'), q = new MessageQueue(); q.configure(file);
      q.enqueue('chat', { id: 'one', text: 'first' });
      q.enqueue('chat', { id: 'two', text: 'second' }); q.claim('chat');
      const restored = new MessageQueue(); restored.configure(file);
      expect(restored.snapshot('chat').items[0]).toMatchObject({ id: 'one', state: 'failed', error: expect.stringContaining('restart') });
      await expect(restored.change('chat', { action: 'send', id: 'one', revision: restored.snapshot('chat').revision })).rejects.toThrow();
      expect(restored.claim('chat')).toBeUndefined(); // Later messages cannot jump an uncertain handoff.
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
