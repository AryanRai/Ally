// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WatchConversations, watchHistory } from './conversations';
import { WATCH_INSTRUCTIONS } from './protocol';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-watch-chats-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
describe('watch conversations', () => {
  it('refreshes a cached deleted folder before running and preserves the exact session', async () => {
    const deps = { list: vi.fn(), load: vi.fn().mockResolvedValue({ cwd: root, messages: [], sessionId: 'different-id' }) };
    const file = path.join(root, 'chats.json');
    const store = new WatchConversations(file, deps, {}, root);
    const chat = store.create('claude', path.join(root, 'deleted-scratch'), 'chat');
    store.link(chat, 'original');
    expect(await store.prepareRun('chat')).toMatchObject({ sessionId: 'original', cwd: root });
    expect(deps.load).toHaveBeenCalledWith('claude', 'original');
    expect((await new WatchConversations(file, deps, {}, root).get('chat')).cwd).toBe(root);
  });
  it('does not recreate a deleted project or silently switch to a default folder', async () => {
    const missing = path.join(root, 'deleted');
    const deps = { list: vi.fn(), load: vi.fn().mockResolvedValue({ cwd: missing, messages: [] }) };
    const store = new WatchConversations(path.join(root, 'chats.json'), deps, {}, root);
    const chat = store.create('claude', root, 'chat'); store.link(chat, 'original');
    await expect(store.prepareRun('chat')).rejects.toThrow('select its current project folder');
    expect(fs.existsSync(missing)).toBe(false);
  });
  it('paginates native chats even when an unsent watch chat has no session yet', async () => {
    const native = Array.from({ length: 65 }, (_, i) => ({ id: `native-${i}`, provider: 'codex' as const, title: `Chat ${i}`, updatedAt: 100 - i }));
    const deps = { list: vi.fn(async (_provider: string, limit: number) => native.slice(0, limit)), load: vi.fn() };
    const store = new WatchConversations(path.join(root, 'chats.json'), deps, {}, '/home');
    store.create('codex', '/home');
    const first = await store.list('codex');
    const second = await store.list('codex', first.nextOffset!);
    const third = await store.list('codex', second.nextOffset!);
    expect(first.chats).toHaveLength(30);
    expect(second.chats).toHaveLength(30);
    expect(third.chats).toHaveLength(6);
    expect(new Set([...first.chats, ...second.chats, ...third.chats].map(c => c.id)).size).toBe(66);
  });
  it('keeps independent chat identities and native sessions across bridge restarts', async () => {
    const deps = { list: vi.fn().mockResolvedValue([]), load: vi.fn().mockResolvedValue({ revision: '1', messages: [], cwd: '/native', sessionId: 'migrated' }) };
    const file = path.join(root, 'chats.json');
    const store = new WatchConversations(file, deps, { codex: 'legacy' }, '/home');
    const first = store.create('codex', '/first', 'request1');
    expect(store.create('codex', '/first', 'request1')).toBe(first);
    store.link(first, 'session1');
    const second = store.create('claude', '/second', 'request2');
    store.link(second, 'session2');
    store.record(first, 'Hello', { text: 'Hi', components: [] }, { steps: [] }, 'turn1');
    const restored = new WatchConversations(file, deps, { codex: 'legacy' }, '/home');
    expect(await restored.get('request1')).toMatchObject({ provider: 'codex', sessionId: 'session1', cwd: '/first', title: 'Hello', messages: [{ text: 'Hello' }, { text: 'Hi' }] });
    expect(await restored.get('request2')).toMatchObject({ provider: 'claude', sessionId: 'session2', cwd: '/second' });
    expect(deps.load).not.toHaveBeenCalled();
  });
  it('opens native sessions with their own folder and reads all messages without a writer', async () => {
    const messages = Array.from({ length: 75 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Message ${i}`, timestamp: i }));
    const deps = { list: vi.fn().mockResolvedValue([{ id: 'native', provider: 'codex', title: 'Native', cwd: '/project', updatedAt: 1 }]), load: vi.fn().mockResolvedValue({ revision: '1', messages, cwd: '/project', sessionId: 'native' }) };
    const store = new WatchConversations(path.join(root, 'chats.json'), deps, {}, '/home');
    const chat = await store.get('codex:native');
    expect(chat.cwd).toBe('/project');
    expect(await store.history(chat)).toHaveLength(75);
    expect((await store.list('codex')).chats.filter(c => c.sessionId === 'native')).toHaveLength(1);
    expect(deps.load).toHaveBeenCalledWith('codex', 'native');
    await expect(store.get('../../private')).rejects.toThrow('Chat not found');
  });
  it('renders every exchange and strips only the watch prompt wrapper', () => {
    const messages = watchHistory([
      { role: 'user', content: `${WATCH_INSTRUCTIONS}\n\nUser message:\nHello again`, timestamp: 1 },
      { role: 'assistant', content: '{"text":"Hi","components":[{"type":"card","title":"Note","body":"Saved"}]}', timestamp: 2 },
      { role: 'user', content: 'Normal native chat', timestamp: 3 },
      { role: 'assistant', content: 'Normal reply', timestamp: 4 },
    ]);
    expect(messages.map(m => m.text)).toEqual(['Hello again', 'Hi', 'Normal native chat', 'Normal reply']);
    expect(messages[1].components).toHaveLength(1);
  });
});

it('maps running sessions to existing device identities across providers without creating chats', () => {
  const store = new WatchConversations(path.join(root, 'chats.json'), { list: vi.fn(), load: vi.fn() }, {}, '/home');
  const linked = store.create('codex', '/home', 'device-chat');
  store.link(linked, 'native');
  store.create('claude', '/home', 'unsent');
  const sessions = [
    { provider: 'codex' as const, id: 'native', title: 'Coding', updatedAt: 2 },
    { provider: 'claude' as const, id: 'native', title: 'Review', updatedAt: 1 },
  ];
  expect(store.running(sessions, ['device-chat']).chats.map(c => c.id)).toEqual(['device-chat', 'claude:native']);
  expect(store.running([], []).chats).toEqual([]);
  expect(store.running([], ['unsent']).chats.map(c => c.id)).toEqual(['unsent']);
});
