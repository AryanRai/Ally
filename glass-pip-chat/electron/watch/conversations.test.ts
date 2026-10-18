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
  it('keeps native creation order after open, completion, refresh and restart', async () => {
    const native = [
      {id:'new',provider:'codex' as const,title:'New',createdAt:20,updatedAt:30},
      {id:'old',provider:'codex' as const,title:'Old',createdAt:10,updatedAt:999},
    ];
    const deps = {list:vi.fn(async()=>native),load:vi.fn(async()=>({createdAt:10,revision:'1',messages:[{role:'user' as const,content:'Original',timestamp:11}]}))};
    const file=path.join(root,'stable.json');
    let store=new WatchConversations(file,deps,{},root);
    const ids=async()=> (await store.list('codex')).chats.map(c=>c.id);
    expect(await ids()).toEqual(['codex:new','codex:old']);
    const old=await store.get('codex:old');
    store.record(old,'Follow-up',{text:'Done',components:[]},{steps:[]},'turn');
    await store.history(old);
    expect(await ids()).toEqual(['codex:new','codex:old']);
    store=new WatchConversations(file,deps,{},root);
    expect(await ids()).toEqual(['codex:new','codex:old']);
    store.create('codex',root,'fresh');
    expect((await ids())[0]).toBe('fresh');
  });
  it('recovers the exact original Claude transcript when a replacement session was never created', async () => {
    const original = 'original-session', missing = 'missing-session';
    const load = vi.fn(async (_provider: string, id: string) => {
      if (id === missing) throw new Error(`claude session ${missing} not found`);
      return { revision: 'original', cwd: root, messages: [{ role: 'user' as const, content: 'hi bro', timestamp: 1 }, { role: 'assistant' as const, content: 'Existing answer', timestamp: 2 }] };
    });
    const file = path.join(root, 'chats.json');
    const deps = { load, list: vi.fn(async () => [{ id: original, provider: 'claude' as const, title: 'hi bro', updatedAt: 1 }]) };
    const store = new WatchConversations(file, deps, {}, root);
    const chat = store.create('claude', root, `claude:${original}`); store.link(chat, missing);
    expect((await store.list('claude')).chats.map(c => c.id)).toEqual([chat.id]);
    expect((await store.history(chat)).map(m => m.text)).toEqual(['hi bro', 'Existing answer']);
    expect(chat.sessionId).toBe(original);
    expect((await new WatchConversations(file, deps, {}, root).get(chat.id)).sessionId).toBe(original);
    expect((await store.prepareRun(chat.id)).sessionId).toBe(original);
  });
  it('repairs a missing Claude replacement before submission without creating a session', async () => {
    const deps = { list: vi.fn(), load: vi.fn(async (_provider: string, id: string) => {
      if (id === 'missing') throw new Error('claude session missing not found');
      return { revision: 'original', cwd: root, messages: [] };
    }) };
    const store = new WatchConversations(path.join(root, 'chats.json'), deps, {}, root);
    const chat = store.create('claude', root, 'claude:original'); store.link(chat, 'missing');
    expect(await store.prepareRun(chat.id)).toMatchObject({ id: 'claude:original', sessionId: 'original' });
    expect(deps.load.mock.calls.map(c => c[1])).toEqual(['missing', 'original']);
  });
  it('does not redirect a valid replacement or fall back on a transient load failure', async () => {
    const load = vi.fn().mockResolvedValue({ messages: [{ role: 'assistant', content: 'Resumed answer', timestamp: 1 }] });
    const store = new WatchConversations(path.join(root, 'chats.json'), { list: vi.fn(), load }, {}, root);
    const chat = store.create('claude', root, 'claude:original'); store.link(chat, 'replacement');
    expect((await store.history(chat))[0].text).toBe('Resumed answer');
    expect(chat.sessionId).toBe('replacement');
    load.mockRejectedValue(new Error('History temporarily unavailable'));
    await expect(store.history(chat)).rejects.toThrow('temporarily unavailable');
    expect(chat.sessionId).toBe('replacement');
    expect(chat.messages[0].text).toBe('Resumed answer');
    expect(load.mock.calls.every(c => c[1] === 'replacement')).toBe(true);
  });
  it('preserves the cached chat if both the replacement and original are missing', async () => {
    const deps = { list: vi.fn(), load: vi.fn(async (_provider: string, id: string) => { throw new Error(`claude session ${id} not found`); }) };
    const store = new WatchConversations(path.join(root, 'chats.json'), deps, {}, root);
    const chat = store.create('claude', root, 'claude:original'); store.link(chat, 'missing');
    store.record(chat, 'Saved message', { text: 'Saved answer', components: [] }, { steps: [] }, 'saved');
    await expect(store.history(chat)).rejects.toThrow('claude session original not found');
    expect(chat.sessionId).toBe('missing');
    expect(chat.messages.map(m => m.text)).toEqual(['Saved message', 'Saved answer']);
  });
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
    const native = Array.from({ length: 65 }, (_, i) => ({ id: `native-${i}`, provider: 'codex' as const, title: `Chat ${i}`, createdAt: 100 - i, updatedAt: 100 - i }));
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
