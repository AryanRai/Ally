// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { CodexDiscovery, internalCodexSource, configureDiscoveryReader, resolveCodexDiscovery, hiddenConversation, rememberCodexThread } from './codexDiscovery';
import { configureUnread, completeUnread, discoveryReadStates, UnreadStore, setChatAttention } from './unread';
import { assistantActivity } from '../watch/assistantActivity';
import { WatchConversations } from '../watch/conversations';
import { listAgentSessions } from './sessions';
import { scanRunningSessions } from './runningSessions';

const roots: string[] = [];
const root = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-discovery-')); roots.push(dir); return dir; };
afterEach(() => { configureUnread(undefined as any); vi.restoreAllMocks(); for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

it('uses native source variants and explicit purpose, never title, originator or parent alone', () => {
  for (const source of [{ subagent: { other: 'guardian' } }, '{"subagent":{"other":"guardian"}}', 'subAgentReview', 'subAgentOther', { type: 'subAgentThreadSpawn' }]) expect(internalCodexSource({ source })).toBe(true);
  expect(internalCodexSource({ source: 'appServer', thread_source: 'guardian_review' })).toBe(true);
  for (const source of ['cli', 'vscode', 'appServer', 'exec', undefined]) expect(internalCodexSource({ source, name: 'Guardian review', parentThreadId: 'fork', originator: 'ally' })).toBe(false);
});

it('caches bounded headers outside loaded history and invalidates on file replacement and new files', () => {
  let now = 10000;
  const home = root(), dir = path.join(home, '.codex', 'sessions', '2026', '10', '18'); fs.mkdirSync(dir, { recursive: true });
  const id = '11111111-2222-3333-4444-555555555555', file = path.join(dir, `rollout-${id}.jsonl`);
  const write = (source: any) => fs.writeFileSync(file, JSON.stringify({ type: 'session_meta', payload: { source, name: 'Guardian review' } }) + '\n' + 'x'.repeat(100000));
  write({ subagent: { other: 'guardian' } });
  const discovery = new CodexDiscovery(home, () => now), reads = vi.spyOn(fs, 'readSync');
  expect(discovery.get(id)?.internal).toBe(true);
  for (let i = 0; i < 40; i++) expect(discovery.get(id)?.internal).toBe(true);
  expect(reads).toHaveBeenCalledTimes(1); expect(reads.mock.calls[0][1].byteLength).toBe(65536);
  fs.unlinkSync(file); write('cli');
  expect(discovery.get(id)?.internal).toBe(false);
  const other = '66666666-2222-3333-4444-555555555555';
  expect(discovery.get(other)).toBeUndefined();
  fs.writeFileSync(path.join(dir, `rollout-${other}.jsonl`), JSON.stringify({ type: 'session_meta', payload: { thread_source: 'guardian_review' } }));
  now += 5001; expect(discovery.get(other)?.internal).toBe(true);
});

it('filters uncapped durable receipts outside every loaded page without acknowledging them or genuine attention', async () => {
  const file = path.join(root(), 'receipts.json'); configureUnread(file);
  const ids = Array.from({ length: 90 }, (_, i) => `outside-page-${i}`);
  for (const id of ids) completeUnread('codex', id, 'synthetic');
  completeUnread('codex', 'real-guardian-title', 'synthetic');
  setChatAttention('codex:real-guardian-title', 'question', true);
  const read = vi.fn(async (id: string) => ({ id, name: 'Guardian review', source: id === 'real-guardian-title' ? 'cli' : { subagent: { other: 'guardian' } } }));
  configureDiscoveryReader(read);
  const states = await discoveryReadStates();
  expect(states.filter(s => s.unread).map(s => s.key)).toEqual(['codex:real-guardian-title']);
  expect(states.filter(s => s.hidden)).toHaveLength(90);
  expect(new UnreadStore(file).list().filter(s => s.unread)).toHaveLength(91);
  await discoveryReadStates(); expect(read).toHaveBeenCalledTimes(91);
  const revision = states.find(s => s.key === 'codex:outside-page-0')!.revision;
  expect(new UnreadStore(file).get('codex:outside-page-0')).toEqual({ key: 'codex:outside-page-0', unread: true, revision });
});

it('merges aliases without reintroducing internal cached activity, and leaves the original approval reachable', async () => {
  rememberCodexThread({ id: 'internal-alias-session', source: { subagent: { other: 'guardian' } } });
  rememberCodexThread({ id: 'real-approval-session', source: 'cli', name: 'Guardian review' });
  const file = path.join(root(), 'chats.json');
  const chats = new WatchConversations(file, { list: async () => [], load: async () => ({ revision: 'synthetic', messages: [] }) }, {}, '');
  chats.link(chats.create('codex', '', 'saved-internal'), 'internal-alias-session');
  chats.link(chats.create('codex', '', 'saved-real'), 'real-approval-session');
  expect((await chats.list('codex')).chats.map(c => c.id)).toEqual(['saved-real']);
  const row = (sessionId: string) => ({ id: `alias-${sessionId}`, sessionId, provider: 'codex' as const, title: 'Guardian review', status: 'unread' as const, detail: '', updatedAt: Date.now(), unread: true });
  const feed = assistantActivity([row('internal-alias-session'), row('real-approval-session')], ['codex:internal-alias-session', 'codex:real-approval-session']);
  expect(feed.chats).toHaveLength(1); expect(feed.chats[0]).toMatchObject({ sessionId: 'real-approval-session', status: 'needs_input' });
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toHaveLength(2);
});

it('deduplicates metadata reads, bounds concurrency and caches unavailable metadata without hiding unknown user work', async () => {
  let active = 0, max = 0;
  const read = vi.fn(async (id: string) => { max = Math.max(max, ++active); await new Promise(r => setTimeout(r, 5)); active--; if (id === 'unknown-metadata') throw Error('offline'); return { id, source: 'cli' }; });
  configureDiscoveryReader(read);
  await Promise.all(['metadata-a', 'metadata-a', 'metadata-b', 'metadata-c', 'unknown-metadata'].map(resolveCodexDiscovery));
  expect(max).toBeLessThanOrEqual(2); expect(read).toHaveBeenCalledTimes(4);
  await resolveCodexDiscovery('unknown-metadata'); expect(read).toHaveBeenCalledTimes(4);
  expect(hiddenConversation('codex', 'unknown-metadata')).toBe(false);
});

it('excludes reviewers from fallback scanners and both running and terminal discovery without hiding a similarly named CLI chat', async () => {
  const home = root(), dir = path.join(home, '.codex', 'sessions'); fs.mkdirSync(dir, { recursive: true });
  const user = '99999999-1111-2222-3333-444444444444';
  const reviewer = '88888888-1111-2222-3333-444444444444';
  const terminal = '77777777-1111-2222-3333-444444444444';
  for (const id of [user, reviewer, terminal]) fs.writeFileSync(path.join(dir, `rollout-${id}.jsonl`), [
    { type: 'session_meta', payload: { source: id === user ? 'cli' : { subagent: { other: 'guardian' } }, cwd: '/synthetic', timestamp: new Date().toISOString() } },
    { type: 'event_msg', payload: { type: id === terminal ? 'task_complete' : 'task_started' } },
  ].map(r => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(home, '.codex', 'session_index.jsonl'), [user, reviewer, terminal].map(id => JSON.stringify({ id, thread_name: 'Guardian review' })).join('\n'));
  vi.spyOn(os, 'homedir').mockReturnValue(home);
  expect(listAgentSessions('codex', 200).map(s => s.id)).toEqual([user]);
  const observe = vi.fn();
  expect((await scanRunningSessions(home, Date.now(), observe)).map(s => s.id)).toEqual([user]);
  expect(observe).toHaveBeenCalledWith([]);
});
