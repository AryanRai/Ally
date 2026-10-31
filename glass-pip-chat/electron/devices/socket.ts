import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { powerMonitor } from 'electron';
import { WebSocket, WebSocketServer } from 'ws';
import { DeviceHub, type DeviceKind } from './hub.js';
import { onAssistCard, dismissAssistCard } from '../perception/ipc.js';
import { registerDeviceTool } from '../chatsMcp/index.js';
import { onReplyNotice, type ReplyNotice } from '../notifications.js';
import { replyCard } from './replyCard.js';
import { startUnreadReplyFeed } from './unreadReplyFeed.js';
import { registerPhoneControl } from './phoneControlTools.js';
import { registerScrcpyViewer } from './scrcpyViewerTools.js';
import { interactions, originatingChat } from './interactions.js';
import { registerQuestionTool } from './questionTool.js';
import { registerAccessRequestTool } from './accessRequestTool.js';
import { boundedActivity, startLiveActivity } from './liveActivity.js';
import { PhysicalTap } from './physicalTap.js';
import { windowsTapAdvertiser } from './bleAdvertiser.js';
import { handoffPresentation } from './handoffPresentation.js';
import { chatSelection } from '../agent/selection.js';
import { managedSessionSignal } from '../agent/runningSessions.js';
import { PhoneControl } from './phoneControl.js';
import { AdbPhone } from './adb.js';
import { HandoffSessions } from './handoffSessions.js';
import type { DeviceToolSpec } from '../chatsMcp/index.js';
import {DeviceAccess} from './deviceAccess.js';
import {registerDeviceAccess} from './deviceAccessTools.js';
import {registerPhoneStream} from './phoneStreamTools.js';
import {desktopMediaContinuation} from './mediaContinuation.js';
import {desktopAcousticProbe} from './acousticProbe.js';

export function attachDeviceSocket(server: Server, authorize: (header?: string) => boolean, activity?: () => Promise<{ chats: any[] }>): () => void {
  const hub = new DeviceHub(dismissAssistCard, Date.now, interactions);
  const control=new PhoneControl(hub),adb=new AdbPhone();
  const access=new DeviceAccess(hub);
  const nativeStream=registerPhoneStream(hub);
  let media:ReturnType<typeof desktopMediaContinuation>|undefined;
  let acoustic:ReturnType<typeof desktopAcousticProbe>|undefined;
  let viewerStart:DeviceToolSpec['handler']|undefined;
  const sessionStatus=(deviceId:string,body:string)=>hub.sendTo(deviceId,{type:'tap_session_status',body:body.slice(0,300)});
  const sessions=new HandoffSessions({connection:id=>hub.connectionSignal(id),control:(id,chat,signal)=>control.requestSession(id,chat,signal),status:sessionStatus,
    nativeAvailable:id=>hub.capabilities(id).includes('native-viewer-v1'),
    serial:async(id,signal)=>{for(const d of await adb.list()){if(signal.aborted)return;try{if(await adb.identity(d.serial,signal)===id)return d.serial;}catch{}}},
    viewer:async(args,signal)=>{if(!args.serial)return nativeStream.start(args.requestId,args.deviceId,args.chatId,signal);if(!viewerStart)throw Error('Viewer is unavailable.');return viewerStart(args,{caller:args.chatId,signal});}});
  const tap = new PhysicalTap(windowsTapAdvertiser, state=>{if(state)handoffPresentation.publish(state);}, undefined, () => {
    const state = powerMonitor.getSystemIdleState(1);
    return state === 'active' || state === 'idle';
  },()=>{const s=chatSelection.snapshot().selected;return s?{id:s.chatId,provider:s.provider,title:s.title,sessionId:s.sessionId}:null;},
    (id,chat,options,key)=>{void sessions.start(id,chat.sessionId?`${chat.provider}:${chat.sessionId}`:chat.id,options,key);});
  const lockTap = () => {tap.suspend();access.close();nativeStream.stopAll();media?.clear();acoustic?.clear();};
  powerMonitor.on('lock-screen', lockTap);
  const stopInteractions = interactions.subscribe(event => {
    if (event.type === 'interaction' && event.request.desktopOnly) return;
    hub.broadcast(event);
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 3_000_000 });
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (request.url !== '/v1/devices/live') return;
    if (request.headers.origin || !authorize(request.headers.authorization) || sockets.clients.size >= 6) { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return; }
    sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws));
  };
  server.on('upgrade', upgrade);
  sockets.on('connection', ws => {
    let disconnect: (() => void) | undefined, id = '', alive = true;
    let tapClient: ReturnType<PhysicalTap['connect']> | undefined;
    const hello = setTimeout(() => ws.close(1008, 'Identify device'), 5000);
    const heartbeat = setInterval(() => { if (!alive) { ws.terminate(); return; } alive = false; ws.ping(); }, 30_000);
    const send = (value: unknown) => { if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 64_000) throw new Error('Device not ready'); ws.send(JSON.stringify(value)); };
    ws.on('pong', () => { alive = true; });
    ws.on('error', () => ws.terminate());
    ws.on('close', () => { clearTimeout(hello); clearInterval(heartbeat); tapClient?.close(); media?.disconnect(id);acoustic?.close(id);disconnect?.(); });
    ws.on('message', data => {
      try {
        const m = JSON.parse(data.toString());
        // Only on-device control results (screen tree / screenshot) may exceed the normal message size.
        if ((data as Buffer).length > 32000 && m.type !== 'control_result' && !(m.type==='viewer_frame'&&(data as Buffer).length<=245000)) throw new Error();
        if (!id) {
          if (m.type !== 'hello' || typeof m.deviceId !== 'string') throw new Error();
          disconnect = hub.connect(m.deviceId, m.kind as DeviceKind, send, Array.isArray(m.capabilities) ? m.capabilities : []); id = m.deviceId; clearTimeout(hello);
          tapClient = tap.connect(m.kind, send,m.deviceId);
          send({ type: 'ready',deviceAccessProtocol:1,mediaContinuityProtocol:1,acousticProtocol:1 });
          if(activity) void activity().then(value=>send({type:'agent_activity',activity:boundedActivity(value)})).catch(()=>{});
          send({ type: 'interaction_sync', ids: interactions.list().filter(request => !request.desktopOnly).map(request => request.id) });
          for (const request of interactions.list().filter(request => !request.desktopOnly)) send({ type: 'interaction', request });
        } else if (['tap_enable', 'tap_knock', 'tap_opened','tap_hold','tap_delivery','tap_refresh'].includes(m.type)) tapClient?.message(m);
        else if(m.type==='device_access_request')access.message(id,m);
        else if(m.type==='acoustic_enable'||m.type==='acoustic_probe'){
          acoustic??=desktopAcousticProbe();void acoustic.message(id,hub.list().find(d=>d.id===id)?.kind??'',m,send).catch(()=>{});
        }
        else if(['media_prepare','media_continue','media_status'].includes(m.type)){
          media??=desktopMediaContinuation();void media.message(id,hub.list().find(d=>d.id===id)?.kind??'',m,send).catch(()=>{});
        }
        else if(m.type==='viewer_frame'||m.type==='viewer_end')nativeStream.message(id,m);
        else if (m.type === 'receipt') hub.receipt(id, m);
        else if (m.type === 'control_result') hub.callResult(id, m);
        else if (m.type === 'control_revoked') hub.revoked(id, m);
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
  const stopActivity = activity ? startLiveActivity(activity, () => hub.list().length > 0, value => hub.broadcast(value)) : () => {};
  const names = ['watch_haptic', 'watch_show_card', 'phone_notify', 'phone_open_url', 'phone_set_timer', 'phone_open_app', 'phone_set_alarm'];
  const unregister = names.map(name => registerDeviceTool({
    name, description: `${name.replaceAll('_', ' ')} on a connected Ally device. Waits for the user's decision; offline devices are not queued.`, requiresConfirmation: true,
    inputSchema: { type: 'object', additionalProperties: false, properties: { chatId: { type: 'string', description: 'Originating provider:sessionId; required when caller context is unavailable.' }, deviceId: { type: 'string' }, title: { type: 'string', maxLength: 80 }, body: { type: 'string', maxLength: 1200 }, url: { type: 'string' }, packageName: { type: 'string', maxLength: 200 }, hour: { type: 'integer', minimum: 0, maximum: 23 }, minute: { type: 'integer', minimum: 0, maximum: 59 }, seconds: { type: 'integer', minimum: 1, maximum: 86400 } } },
    handler: async (args, ctx) => { const result = await hub.command(name.startsWith('watch_') ? 'watch' : 'phone', name, { ...args, chatId: originatingChat(args, ctx.caller) }, ctx.signal); return { content: [{ type: 'text', text: result.message }], isError: !result.ok }; },
  }));
  unregister.push(registerDeviceTool({ name: 'device_list', description: 'List connected Ally phones and watches, including device IDs.', inputSchema: { type: 'object', properties: {} }, handler: async () => ({ content: [{ type: 'text', text: JSON.stringify(hub.list()) }] }) }));
  unregister.push(registerPhoneControl(hub,control,{promptSignal:caller=>{const split=caller.indexOf(':');const provider=caller.slice(0,split);return provider==='codex'||provider==='claude'?managedSessionSignal(provider,caller.slice(split+1)):undefined;},preview:async(args,ctx)=>{if(!viewerStart)throw Error('Local viewer unavailable.');return viewerStart(args,ctx);}}));
  unregister.push(registerDeviceAccess(hub,access));
  unregister.push(registerScrcpyViewer(hub,{onStart:handler=>{viewerStart=handler;}}));
  unregister.push(registerQuestionTool());
  unregister.push(registerAccessRequestTool());
  return () => { nativeStream.close();access.close();sessions.close();powerMonitor.off('lock-screen', lockTap); tap.close(); stopActivity(); stopUnreadReplies(); stopInteractions(); stopCards(); stopReplies(); unregister.forEach(stop => stop()); hub.close(); interactions.closeAll(); server.off('upgrade', upgrade); sockets.clients.forEach(ws => ws.terminate()); sockets.close(); };
}
