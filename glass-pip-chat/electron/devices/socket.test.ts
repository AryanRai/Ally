// @vitest-environment node
import http from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('electron',()=>({powerMonitor:{on:vi.fn(),off:vi.fn(),getSystemIdleState:()=> 'active'}}));
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
  const ws = await setup(); const phone = messages(ws); await once(ws, 'open'); ws.send(JSON.stringify({ type: 'hello', deviceId: 'phone-one', kind: 'phone' }));
  expect((await phone('ready')).deviceAccessProtocol).toBe(1); await phone('interaction_sync');
  const watch = new WebSocket(`ws://127.0.0.1:${(server.address() as any).port}/v1/devices/live`, { headers: { Authorization: 'Bearer paired' } }); clients.push(watch);
  const wearable = messages(watch); await once(watch, 'open'); watch.send(JSON.stringify({ type: 'hello', deviceId: 'watch-one', kind: 'watch' })); await wearable('ready'); await wearable('interaction_sync');
  const result = mocks.tools.get('phone_notify').handler({ title: 'Test', body: 'Synthetic' }, { caller: 'codex:session-1234' });
  const request = (await wearable('interaction')).request; expect(request.chatId).toBe('codex:session-1234'); expect(request.targetDeviceId).toBe('phone-one');
  await phone('interaction'); expect(phone.queued('authorized_command')).toBe(false);
  watch.send(JSON.stringify({ type: 'interaction_answer', id: request.id, action: 'accept' }));
  expect((await wearable('interaction_ack')).accepted).toBe(true);
  expect((await phone('interaction_closed')).answeredOn).toBe('watch');
  const item = (await phone('authorized_command')).command;
  expect(item.id).toBe(request.id); ws.send(JSON.stringify({ type: 'receipt', id: item.id, status: 'done' }));
  expect((await result).isError).toBe(false);
  mocks.cards({ id: 'card', priority: 'phone', title: 'Note', body: 'Synthetic' }); expect((await phone('card')).card.id).toBe('card');
  ws.send(JSON.stringify({ type: 'receipt', id: 'card', status: 'dismissed' })); await vi.waitFor(() => expect(mocks.dismiss).toHaveBeenCalledWith('card'));
  mocks.reply({ id: 'reply', title: 'Reply ready', text: 'Synthetic reply' }); expect((await phone('card')).card.id).toBe('reply:phone:reply');
});

function messages(ws: WebSocket) {
  const queue: any[] = []; const waiting = new Map<string, (value: any) => void>();
  ws.on('message', data => { const value = JSON.parse(data.toString()); const resolve = waiting.get(value.type); if (resolve) { waiting.delete(value.type); resolve(value); } else queue.push(value); });
  const next = (type: string): Promise<any> => { const index = queue.findIndex(value => value.type === type); return index >= 0 ? Promise.resolve(queue.splice(index, 1)[0]) : new Promise(resolve => waiting.set(type, resolve)); };
  next.queued = (type: string) => queue.some(value => value.type === type);
  return next;
}
