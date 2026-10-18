import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { DeviceHub, type DeviceKind } from './hub.js';
import { onAssistCard, dismissAssistCard } from '../perception/ipc.js';
import { registerDeviceTool } from '../chatsMcp/index.js';
import { onReplyNotice, type ReplyNotice } from '../notifications.js';
import { replyCard } from './replyCard.js';
import { startUnreadReplyFeed } from './unreadReplyFeed.js';
import { registerPhoneControl } from './phoneControlTools.js';
import { interactions, originatingChat } from './interactions.js';
import { registerQuestionTool } from './questionTool.js';

export function attachDeviceSocket(server: Server, authorize: (header?: string) => boolean): () => void {
  const hub = new DeviceHub(dismissAssistCard, Date.now, interactions);
  const stopInteractions = interactions.subscribe(event => hub.broadcast(event));
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 32000 });
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
          send({ type: 'interaction_sync', ids: interactions.list().map(request => request.id) });
          for (const request of interactions.list()) send({ type: 'interaction', request });
        } else if (m.type === 'receipt') hub.receipt(id, m);
        else if (m.type === 'interaction_answer') {
          try { interactions.answer(String(m.id), { action: m.action, values: m.values }, hub.list().find(d => d.id === id)?.kind || 'device'); send({ type: 'interaction_ack', id: m.id, accepted: true }); }
          catch (error) { send({ type: 'interaction_ack', id: m.id, accepted: false, error: error instanceof Error ? error.message : 'Decision failed.' }); }
        }
        else throw new Error();
      } catch { ws.close(1008, 'Invalid device message'); }
    });
  });
  const stopCards = onAssistCard(card => { if (!card.dismissed && (card.priority === 'phone' || card.priority === 'watch')) hub.publish(card.priority, card); });
  const publishReply = (notice: ReplyNotice) => {
    hub.publish('phone', replyCard(notice, 'phone'));
    hub.publish('watch', replyCard(notice, 'watch'));
  };
  const stopReplies = onReplyNotice(publishReply);
  const stopUnreadReplies = startUnreadReplyFeed(publishReply);
  const names = ['watch_haptic', 'watch_show_card', 'phone_notify', 'phone_open_url', 'phone_set_timer', 'phone_open_app', 'phone_set_alarm'];
  const unregister = names.map(name => registerDeviceTool({
    name, description: `${name.replaceAll('_', ' ')} on a connected Ally device. Waits for the user's decision; offline devices are not queued.`, requiresConfirmation: true,
    inputSchema: { type: 'object', additionalProperties: false, properties: { chatId: { type: 'string', description: 'Originating provider:sessionId; required when caller context is unavailable.' }, deviceId: { type: 'string' }, title: { type: 'string', maxLength: 80 }, body: { type: 'string', maxLength: 1200 }, url: { type: 'string' }, packageName: { type: 'string', maxLength: 200 }, hour: { type: 'integer', minimum: 0, maximum: 23 }, minute: { type: 'integer', minimum: 0, maximum: 59 }, seconds: { type: 'integer', minimum: 1, maximum: 86400 } } },
    handler: async (args, ctx) => { const result = await hub.command(name.startsWith('watch_') ? 'watch' : 'phone', name, { ...args, chatId: originatingChat(args, ctx.caller) }, ctx.signal); return { content: [{ type: 'text', text: result.message }], isError: !result.ok }; },
  }));
  unregister.push(registerDeviceTool({ name: 'device_list', description: 'List connected Ally phones and watches, including device IDs.', inputSchema: { type: 'object', properties: {} }, handler: async () => ({ content: [{ type: 'text', text: JSON.stringify(hub.list()) }] }) }));
  unregister.push(registerPhoneControl(hub));
  unregister.push(registerQuestionTool());
  return () => { stopUnreadReplies(); stopInteractions(); stopCards(); stopReplies(); unregister.forEach(stop => stop()); hub.close(); interactions.closeAll(); server.off('upgrade', upgrade); sockets.clients.forEach(ws => ws.terminate()); sockets.close(); };
}
