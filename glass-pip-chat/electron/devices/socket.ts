import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { DeviceHub, type DeviceKind } from './hub.js';
import { onAssistCard, dismissAssistCard } from '../perception/ipc.js';
import { registerDeviceTool } from '../chatsMcp/index.js';
import { onReplyNotice } from '../notifications.js';

export function attachDeviceSocket(server: Server, authorize: (header?: string) => boolean): () => void {
  const hub = new DeviceHub(dismissAssistCard);
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (request.url !== '/v1/devices/live') return;
    if (request.headers.origin || !authorize(request.headers.authorization) || sockets.clients.size >= 6) { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return; }
    sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws));
  };
  server.on('upgrade', upgrade);
  sockets.on('connection', ws => {
    let disconnect: (() => void) | undefined, id = '', alive = true;
    const hello = setTimeout(() => ws.close(1008, 'Identify device'), 5000);
    const heartbeat = setInterval(() => { if (!alive) { ws.terminate(); return; } alive = false; ws.ping(); }, 30_000);
    const send = (value: unknown) => { if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 64_000) throw new Error('Device not ready'); ws.send(JSON.stringify(value)); };
    ws.on('pong', () => { alive = true; });
    ws.on('error', () => ws.terminate());
    ws.on('close', () => { clearTimeout(hello); clearInterval(heartbeat); disconnect?.(); });
    ws.on('message', data => {
      try {
        const m = JSON.parse(data.toString());
        if (!id) {
          if (m.type !== 'hello' || typeof m.deviceId !== 'string') throw new Error();
          disconnect = hub.connect(m.deviceId, m.kind as DeviceKind, send); id = m.deviceId; clearTimeout(hello);
          send({ type: 'ready' });
        } else if (m.type === 'receipt') hub.receipt(id, m);
        else throw new Error();
      } catch { ws.close(1008, 'Invalid device message'); }
    });
  });
  const stopCards = onAssistCard(card => { if (!card.dismissed && (card.priority === 'phone' || card.priority === 'watch')) hub.publish(card.priority, card); });
  const stopReplies = onReplyNotice(notice => hub.publish('phone', { id: `reply:${notice.id}`, title: notice.title, body: notice.text, sessionId: notice.session?.id }));
  const names = ['watch_haptic', 'watch_show_card', 'phone_notify', 'phone_open_url', 'phone_set_timer'];
  const unregister = names.map(name => registerDeviceTool({
    name, description: `${name.replaceAll('_', ' ')} on a connected Ally device. Waits for the user's decision; offline devices are not queued.`, requiresConfirmation: true,
    inputSchema: { type: 'object', additionalProperties: false, properties: { deviceId: { type: 'string' }, title: { type: 'string', maxLength: 80 }, body: { type: 'string', maxLength: 1200 }, url: { type: 'string' }, seconds: { type: 'integer', minimum: 1, maximum: 86400 } } },
    handler: async args => { const result = await hub.command(name.startsWith('watch_') ? 'watch' : 'phone', name, args); return { content: [{ type: 'text', text: result.message }], isError: !result.ok }; },
  }));
  unregister.push(registerDeviceTool({ name: 'device_list', description: 'List connected Ally phones and watches, including device IDs.', inputSchema: { type: 'object', properties: {} }, handler: async () => ({ content: [{ type: 'text', text: JSON.stringify(hub.list()) }] }) }));
  return () => { stopCards(); stopReplies(); unregister.forEach(stop => stop()); hub.close(); server.off('upgrade', upgrade); sockets.clients.forEach(ws => ws.terminate()); sockets.close(); };
}
