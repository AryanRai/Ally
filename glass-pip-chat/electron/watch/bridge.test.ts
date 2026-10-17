// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import type { AgentEvent } from '../agent/types';

const fake = vi.hoisted(() => ({ root: '', load: vi.fn(), start: vi.fn(), stop: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => fake.root } }));
vi.mock('../agent/runner.js', () => ({ startAgentRun: fake.start, stopAgentRun: fake.stop, steerAgentRun: vi.fn() }));
vi.mock('../agent/sessions.js', () => ({ listAgentSessions: vi.fn(), loadAgentSession: fake.load }));
vi.mock('../agent/codexHistory.js', () => ({ listCodexChats: vi.fn(), loadCodexChat: fake.load, repairCodexDeviceTitle: vi.fn(async () => {}) }));
vi.mock('../agent/runningSessions.js', () => ({ listRunningSessions: vi.fn(async () => []) }));
vi.mock('../speech/runtime.js', () => ({ ensureSpeechRuntime: vi.fn(async () => ({})), getSpeechRuntimeStatus: vi.fn() }));
vi.mock('../speech/settings.js', () => ({ speechSettings: vi.fn() }));
vi.mock('./speechSocket.js', () => ({ attachSpeechSocket: () => () => {} }));
vi.mock('../devices/socket.js', () => ({ attachDeviceSocket: () => () => {} }));
vi.mock('../notifications.js', () => ({ notifyReply: vi.fn() }));
vi.mock('./transport.js', () => ({ startWatchTransport: vi.fn() }));
vi.mock('./cloudTunnel.js', () => ({ startCloudTunnel: vi.fn() }));
import { startWatchBridge } from './bridge';

let stop: (() => void) | undefined;
afterEach(() => { stop?.(); vi.restoreAllMocks(); vi.clearAllMocks(); if (fake.root) fs.rmSync(fake.root, { recursive: true, force: true }); });

it('publishes partial replies before completion and keeps exact-session routing, retries, continuation and Stop', async () => {
  fake.root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-live-bridge-'));
  fs.writeFileSync(path.join(fake.root, 'watch-bridge.json'), JSON.stringify({ enabled: true, token: 'synthetic-only', port: 0, sessions: {} }));
  fs.writeFileSync(path.join(fake.root, 'watch-chats.json'), JSON.stringify([{ id: 'chat', provider: 'claude', sessionId: 'original', title: 'Synthetic', cwd: path.join(fake.root, 'deleted'), messages: [], updatedAt: 1 }]));
  fake.load.mockResolvedValue({ cwd: fake.root, messages: [] });
  let emit!: (event: AgentEvent) => void;
  fake.start.mockImplementation(async (_options, send) => { emit = event => send('run', event); return 'run'; });
  const create = vi.spyOn(http, 'createServer');
  stop = startWatchBridge(() => ({ defaultCwd: fake.root, permission: 'readonly' }));
  const server = create.mock.results[0].value as http.Server;
  if (!server.listening) await once(server, 'listening');
  const address = server.address() as { port: number };
  const request = async (route: string, body?: object) => {
    const r = await fetch(`http://127.0.0.1:${address.port}${route}`, { headers: { Authorization: 'Bearer synthetic-only', 'Content-Type': 'application/json' }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    expect(r.ok).toBe(true); return r.json();
  };
  const message = { provider: 'claude', chatId: 'chat', requestId: 'one', permission: 'readonly', text: 'Synthetic test only' };
  const accepted = await request('/v1/messages', message);
  await vi.waitFor(() => expect(fake.start).toHaveBeenCalledTimes(1));
  expect(await request('/v1/chats/chat')).toMatchObject({ running: true, activeTurnId: accepted.id });
  expect(fake.start.mock.calls[0][0]).toMatchObject({ cwd: fake.root, sessionId: 'original', permission: 'readonly' });
  emit({ kind: 'text', text: 'Checking…\n{"text":"Hel' });
  expect(await request(`/v1/turns/${accepted.id}`)).toMatchObject({ status: 'thinking', liveText: 'Checking…\n\nHel' });
  expect((await request('/v1/messages', message)).id).toBe(accepted.id);
  expect(fake.start).toHaveBeenCalledTimes(1);
  emit({ kind: 'text', text: 'lo","components":[]}' });
  emit({ kind: 'continuation' });
  expect((await request(`/v1/turns/${accepted.id}`)).liveText).toBe('');
  emit({ kind: 'text', text: '{"text":"Follow-up complete","components":[]}' });
  emit({ kind: 'done' });
  expect(await request(`/v1/turns/${accepted.id}`)).toMatchObject({ status: 'done', reply: { text: 'Follow-up complete', components: [] } });
  expect(await request('/v1/chats/chat')).toMatchObject({ running: false });
  const next = await request('/v1/messages', { ...message, requestId: 'two' });
  await vi.waitFor(() => expect(fake.start).toHaveBeenCalledTimes(2));
  emit({ kind: 'text', text: 'Partial work remains visible' });
  await request(`/v1/turns/${next.id}/stop`, {});
  expect(await request(`/v1/turns/${next.id}`)).toMatchObject({ status: 'error', liveText: 'Partial work remains visible', error: 'Stopped by you' });
  expect(fake.stop).toHaveBeenCalledWith('run');
});
