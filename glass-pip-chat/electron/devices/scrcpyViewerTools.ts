import { randomUUID } from 'node:crypto';
import { registerDeviceTool, type DeviceToolSpec } from '../chatsMcp/index.js';
import { AdbPhone } from './adb.js';
import type { DeviceHub } from './hub.js';
import { interactions, originatingChat, type InteractionBroker } from './interactions.js';
import { discoverScrcpy, ScrcpyViewer, type ViewerDependencies, type ViewerRequest } from './scrcpyViewer.js';
import {matchingAdb} from './phoneTransport.js';

interface Options {
  onStart?: (handler:DeviceToolSpec['handler'])=>void;
  register?: (tool: DeviceToolSpec) => () => void;
  broker?: Pick<InteractionBroker, 'request'>;
  executable?: () => string | undefined;
  identity?: ViewerDependencies['identity'];
  list?:AdbPhone['list'];
  spawn?: ViewerDependencies['spawn'];
}
/** No installation, device selection, pairing or viewing happens during registration. */
export function registerScrcpyViewer(hub: DeviceHub, options: Options = {}): () => void {
  const baseRegister = options.register ?? registerDeviceTool, broker = options.broker ?? interactions;
  const register=(spec:DeviceToolSpec)=>{if(spec.name==='phone_viewer_start')options.onStart?.(spec.handler);return baseRegister(spec);};
  const adb = new AdbPhone();
  const executable = options.executable ?? (() => discoverScrcpy(process.env.ALLY_SCRCPY_PATH ? [process.env.ALLY_SCRCPY_PATH] : []));
  const records = new Map<string, { request: ViewerRequest; viewer: ScrcpyViewer }>();
  const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
  const owner = (args: Record<string, unknown>, caller?: string) => {
    if (!caller) throw Error('Viewer tools require an authenticated originating chat.');
    return originatingChat(args, caller);
  };
  const stopRevoked = hub.onRevoked(deviceId => {
    // A phone-side Stop ends any local viewer too, independently of its separate grant ID.
    for (const entry of records.values()) if (entry.request.deviceId === deviceId)
      entry.viewer.stop(entry.request.requestId, entry.request.chatId);
  });
  const properties = { requestId: { type: 'string', minLength: 8, maxLength: 80 }, chatId: { type: 'string' } };
  const unregister = [register({
    name: 'phone_viewer_start', requiresConfirmation: true,
    description: 'Request a separate LOCAL read-only scrcpy window for one selected Android phone. Requires installed configured scrcpy and authorized ADB. A deliberate handoff may request this same workflow; a separate real raw-view approval is always required. Sensitive content may appear because phone-control filtering does not apply. No audio/input/clipboard sync/recording. Stops after 15 minutes, caller cancellation, disconnect, phone Stop or explicit stop. Frames are not sent to the agent.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['requestId', 'deviceId'], properties: { ...properties, deviceId: { type: 'string' }, serial: { type: 'string' } } },
    handler: async (args, ctx) => {
      const chatId = owner(args, ctx.caller);
      if (!ctx.signal || ctx.signal.aborted) throw Error('A live cancellable caller context is required.');
      if (typeof args.requestId !== 'string' || typeof args.deviceId !== 'string') throw Error('Provide requestId and deviceId.');
      const serial=typeof args.serial==='string'?args.serial:await matchingAdb({list:options.list??(()=>adb.list()),identity:options.identity??((s,signal)=>adb.identity(s,signal))},args.deviceId,ctx.signal);
      if(!serial)throw Error('No authorized ADB transport for this phone. Use device_access_prepare for a native local QR, or use phone_control through Accessibility on any network. For an integrated no-ADB preview, use phone_stream_start with separate raw-view and native Android capture consent. Never use another viewer route to evade a refusal.');
      const request: ViewerRequest = { requestId: args.requestId, deviceId: args.deviceId, serial, chatId };
      const previous = records.get(request.requestId);
      if (previous) {
        if (JSON.stringify(previous.request) !== JSON.stringify(request)) throw Error('Viewer requestId already used.');
        return result(previous.viewer.status(request.requestId, chatId));
      }
      if (records.size >= 100) throw Error('Viewer audit is full for this process.');
      for (const entry of records.values()) {
        const status = entry.viewer.status(entry.request.requestId, entry.request.chatId);
        if (status && !['failed', 'stopped'].includes(status.state) &&
            (entry.request.deviceId === request.deviceId || entry.request.serial === request.serial))
          throw Error('This phone already has a viewer request.');
      }
      if (!hub.list().some(device => device.id === request.deviceId && device.kind === 'phone')) throw Error('Selected Ally phone is disconnected.');
      if (!executable()) throw Error('Install scrcpy separately and configure trusted ALLY_SCRCPY_PATH before requesting viewing.');
      const signal = ctx.signal;
      const viewer = new ScrcpyViewer({
        executable, identity: options.identity ?? ((serial, abort) => adb.identity(serial, abort)),
        connection: id => hub.connectionSignal(id), session: id => id === chatId ? signal : undefined,
        spawn: options.spawn,
        authorize: async (bound, abort) => {
          const answer = await broker.request({
            chatId, kind: 'approval', targetDeviceId: bound.deviceId, title: 'Show live phone on this computer?',
            detail: 'Show this phone’s live screen in a separate local window for 15 minutes. No audio, input, clipboard sync or recording. Sensitive content may appear: Ally’s phone-control screen filtering does not apply. Frames are not sent to the agent. Close the window or use phone_viewer_stop to end viewing.',
            fields: [], actions: [{ value: 'accept', label: 'View for 15 minutes' }, { value: 'decline', label: 'Decline' }],
          }, abort);
          return answer.action === 'accept' ? { id: randomUUID(), deviceId: bound.deviceId, serial: bound.serial, chatId, expiresAt: Date.now() + 15 * 60_000, scope: 'unfiltered-local-viewer' as const } : undefined;
        },
      });
      records.set(request.requestId, { request, viewer });
      return result(await viewer.start(request));
    },
  }), register({
    name: 'phone_viewer_status', description: 'Read this authenticated chat’s local phone-viewer lifecycle. Running means spawned; it does not verify visible video.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['requestId'], properties },
    handler: async (args, ctx) => {
      const chatId = owner(args, ctx.caller), entry = records.get(String(args.requestId));
      return result(entry?.viewer.status(String(args.requestId), chatId) ?? { state: 'not-found' });
    },
  }), register({
    name: 'phone_viewer_stop', description: 'Stop this authenticated chat’s pending or running local phone viewer. Does not change the phone or undo prior viewing.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['requestId'], properties },
    handler: async (args, ctx) => {
      const chatId = owner(args, ctx.caller), entry = records.get(String(args.requestId));
      return result({ stopping: entry?.viewer.stop(String(args.requestId), chatId) ?? false });
    },
  })];
  return () => { stopRevoked(); for (const entry of records.values()) entry.viewer.close(); unregister.forEach(stop => stop()); };
}
