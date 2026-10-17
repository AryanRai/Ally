// @vitest-environment node
import http from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ tools: new Map<string, any>(), cards: null as any, reply: null as any, dismiss: vi.fn() }));
vi.mock('../perception/ipc.js', () => ({ onAssistCard: (cb: any) => { mocks.cards = cb; return vi.fn(); }, dismissAssistCard: mocks.dismiss }));
vi.mock('../notifications.js', () => ({ onReplyNotice: (cb: any) => { mocks.reply = cb; return vi.fn(); } }));
vi.mock('../chatsMcp/index.js', () => ({ registerDeviceTool: (tool: any) => { mocks.tools.set(tool.name, tool); return () => mocks.tools.delete(tool.name); } }));
vi.mock('../speech/settings.js', () => ({ speechSettings: () => ({ cloud: true, project: 'test' }) }));
vi.mock('../speech/streaming.js', () => ({ recognizeLive: vi.fn(), synthesizeLive: vi.fn() }));
import { attachDeviceSocket } from './socket';
import { attachSpeechSocket } from '../watch/speechSocket';
let cleanup: () => void; let stopSpeech: () => void; let server: http.Server;
const clients: WebSocket[] = [];
async function setup(headers: Record<string, string> = { Authorization: 'Bearer paired' }) {
  server = http.createServer(); stopSpeech = attachSpeechSocket(server, h => h === 'Bearer paired'); cleanup = attachDeviceSocket(server, h => h === 'Bearer paired');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const ws = new WebSocket(`ws://127.0.0.1:${(server.address() as any).port}/v1/devices/live`, { headers }); clients.push(ws); return ws;
}
afterEach(async () => { clients.splice(0).forEach(ws => ws.terminate()); cleanup?.(); stopSpeech?.(); if (server) await new Promise<void>(r => server.close(() => r())); vi.clearAllMocks(); });
it('requires bridge authorization and rejects browser origins', async () => {
  const ws = await setup({ Authorization: 'Bearer paired', Origin: 'https://untrusted.example' }); const [error] = await once(ws, 'error'); expect(error.message).toContain('401');
});
it('rejects an unpaired device', async () => { const ws = await setup({}); const [error] = await once(ws, 'error'); expect(error.message).toContain('401'); });
it('coexists with speech upgrade handling and waits for a real decision', async () => {
  const ws = await setup(); await once(ws, 'open'); const ready = once(ws, 'message'); ws.send(JSON.stringify({ type: 'hello', deviceId: 'phone-one', kind: 'phone' }));
  expect(JSON.parse((await ready)[0].toString()).type).toBe('ready');
  const command = once(ws, 'message'); const result = mocks.tools.get('phone_notify').handler({ title: 'Test', body: 'Synthetic' }); const item = JSON.parse((await command)[0].toString()).command;
  ws.send(JSON.stringify({ type: 'receipt', id: item.id, status: 'approved' })); ws.send(JSON.stringify({ type: 'receipt', id: item.id, status: 'done' }));
  expect((await result).isError).toBe(false);
  const card = once(ws, 'message'); mocks.cards({ id: 'card', priority: 'phone', title: 'Note', body: 'Synthetic' }); expect(JSON.parse((await card)[0].toString()).type).toBe('card');
  ws.send(JSON.stringify({ type: 'receipt', id: 'card', status: 'dismissed' })); await vi.waitFor(() => expect(mocks.dismiss).toHaveBeenCalledWith('card'));
  const reply = once(ws, 'message'); mocks.reply({ id: 'reply', title: 'Reply ready', text: 'Synthetic reply' }); expect(JSON.parse((await reply)[0].toString()).card.id).toBe('reply:reply');
});
