// @vitest-environment node
import http from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ emit: null as any, write: vi.fn(), end: vi.fn(), cancel: vi.fn() }));
vi.mock('../speech/settings.js', () => ({ speechSettings: () => ({ cloud: true, project: 'test' }) }));
vi.mock('../speech/streaming.js', () => ({ recognizeLive: (_: unknown, emit: any) => { mocks.emit = emit; return mocks; }, synthesizeLive: vi.fn() }));
import { attachSpeechSocket } from './speechSocket';
let cleanup: () => void;
let server: http.Server;
const clients: WebSocket[] = [];
async function setup() {
  server = http.createServer(); cleanup = attachSpeechSocket(server, header => header === 'Bearer test-token');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return `ws://127.0.0.1:${(server.address() as any).port}/v1/speech/live`;
}
afterEach(async () => { clients.splice(0).forEach(ws => ws.terminate()); cleanup?.(); if (server) await new Promise<void>(resolve => server.close(() => resolve())); vi.clearAllMocks(); });
it('rejects unpaired connections before starting Google speech', async () => {
  const url = await setup(); const client = new WebSocket(url); clients.push(client);
  const [error] = await once(client, 'error'); expect(error.message).toContain('401'); expect(mocks.write).not.toHaveBeenCalled();
});
it('forwards bounded binary audio, finalizes once and cancels on disconnect', async () => {
  const url = await setup(); const client = new WebSocket(url, { headers: { Authorization: 'Bearer test-token' } }); clients.push(client);
  await once(client, 'open');
  const ready = once(client, 'message'); client.send(JSON.stringify({ type: 'listen' }));
  expect(JSON.parse((await ready)[0].toString())).toEqual({ type: 'ready' });
  client.send(Buffer.from([0, 0, 1, 0])); client.send(JSON.stringify({ type: 'end' }));
  await vi.waitFor(() => expect(mocks.end).toHaveBeenCalledTimes(1));
  expect(mocks.write).toHaveBeenCalledWith(Buffer.from([0, 0, 1, 0]));
  const reply = once(client, 'message'); mocks.emit({ type: 'complete', text: 'Hello' });
  expect(JSON.parse((await reply)[0].toString())).toEqual({ type: 'complete', text: 'Hello' });
  await vi.waitFor(() => expect(mocks.cancel).toHaveBeenCalledTimes(1));
});
