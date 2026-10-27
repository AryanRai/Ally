import { registerDeviceTool } from '../chatsMcp/index.js';
import { PhoneControl } from './phoneControl.js';
import type { DeviceHub } from './hub.js';
import { originatingChat } from './interactions.js';
import {AdbPhone} from './adb.js';
import {controlTransport} from './phoneTransport.js';

export function registerPhoneControl(hub: DeviceHub, control = new PhoneControl(hub)): () => void {
  const adb=new AdbPhone();
  const stops = [
    registerDeviceTool({ name: 'phone_control_devices', description: 'Discover controllable Ally phones. Prefer transport "on-device" (works on any network, no ADB; omit serial). ADB development transports are listed too; duplicates may be the same phone. Shows any active control session. No screen access.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, handler: async () => ({ content: [{ type: 'text', text: JSON.stringify(await control.devices()) }] }) }),
    registerDeviceTool({
      name: 'phone_control', requiresConfirmation: true,
      description: 'Inspect or perform a finite exact plan on the user’s Android phone. Omit serial for preflight selection: prefer on-device Accessibility control on any network; use an exact-identity authorized ADB adapter only when on-device support is absent. Never change executor after a refusal or failed plan. device_access_status explains readiness; device_access_prepare offers native local QR or bounded watch maintenance. First call operations:[] to inspect; use its revision as expectedRevision for actions. The first call asks the user once to start a control session for this chat (sessionMinutes, default 15, max 60); later calls in that session run without asking until it ends or the user taps Stop. Returns the resulting UI; screenshot:true also returns an image. Never use for credentials, OTP, security approvals, payments or sending communications; hand those to the user. No shell commands, no unattended replay; at most 8 operations and 60 seconds per call. On-device text supports Unicode; ADB text is basic Latin. A failed batch can have partially executed: check phone_action_status before retrying with a new ID.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['requestId', 'operations'], properties: {
        chatId: { type: 'string', description: 'Originating provider:sessionId; required when caller context is unavailable.' }, requestId: { type: 'string', minLength: 8, maxLength: 80 }, serial: { type: 'string' }, deviceId: { type: 'string' }, expectedRevision: { type: 'string' }, screenshot: { type: 'boolean' }, sessionMinutes: { type: 'integer', minimum: 1, maximum: 60 },
        operations: { type: 'array', maxItems: 8, items: { oneOf: [
          { type: 'object', required: ['type', 'x', 'y'], additionalProperties: false, properties: { type: { const: 'tap' }, x: { type: 'integer', minimum: 0 }, y: { type: 'integer', minimum: 0 } } },
          { type: 'object', required: ['type', 'x', 'y', 'endX', 'endY', 'durationMs'], additionalProperties: false, properties: { type: { const: 'swipe' }, x: { type: 'integer', minimum: 0 }, y: { type: 'integer', minimum: 0 }, endX: { type: 'integer', minimum: 0 }, endY: { type: 'integer', minimum: 0 }, durationMs: { type: 'integer', minimum: 100, maximum: 2000 } } },
          { type: 'object', required: ['type', 'text'], additionalProperties: false, properties: { type: { const: 'text' }, text: { type: 'string', maxLength: 500 } } },
          { type: 'object', required: ['type', 'key'], additionalProperties: false, properties: { type: { const: 'key' }, key: { enum: ['home', 'back', 'recents'] } } },
          { type: 'object', required: ['type', 'packageName'], additionalProperties: false, properties: { type: { const: 'open_app' }, packageName: { type: 'string', maxLength: 200 } } },
        ] } },
      } }, handler: async (args, ctx) => control.execute(await controlTransport(hub,adb,args,ctx.signal), ctx.caller, ctx.signal),
    }),
    registerDeviceTool({ name: 'phone_action_status', description: 'Read bounded in-memory phone action history, with partial-operation counts. Does not retain screenshots, entered text or UI.', inputSchema: { type: 'object', additionalProperties: false, properties: { requestId: { type: 'string' } } }, handler: async args => ({ content: [{ type: 'text', text: JSON.stringify(control.history(args.requestId)) }] }) }),
    registerDeviceTool({ name: 'phone_control_end', description: 'End this chat’s phone control session early (also clears the phone notification).', inputSchema: { type: 'object', additionalProperties: false, required: ['deviceId'], properties: { deviceId: { type: 'string' }, chatId: { type: 'string' } } }, handler: async (args, ctx) => ({ content: [{ type: 'text', text: JSON.stringify({ ended: control.endSession(args.deviceId, originatingChat(args, ctx.caller)) }) }] }) }),
    registerDeviceTool({ name: 'phone_action_cancel', description: 'Cancel a pending/running phone-control request. Cannot undo operations already delivered.', inputSchema: { type: 'object', additionalProperties: false, required: ['requestId'], properties: { requestId: { type: 'string' } } }, handler: async args => ({ content: [{ type: 'text', text: JSON.stringify({ cancelled: control.cancel(args.requestId) }) }] }) }),
  ];
  return () => { control.close(); stops.forEach(stop => stop()); };
}
