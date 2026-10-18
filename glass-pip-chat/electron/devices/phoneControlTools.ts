import { registerDeviceTool } from '../chatsMcp/index.js';
import { PhoneControl } from './phoneControl.js';
import type { DeviceHub } from './hub.js';

export function registerPhoneControl(hub: DeviceHub): () => void {
  const control = new PhoneControl(hub);
  const stops = [
    registerDeviceTool({ name: 'phone_control_devices', description: 'Discover authorized ADB development transports and their matching connected Ally phone identities. Duplicate transports may refer to the same phone. No screen access.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, handler: async () => ({ content: [{ type: 'text', text: JSON.stringify(await control.devices()) }] }) }),
    registerDeviceTool({
      name: 'phone_control', requiresConfirmation: true,
      description: 'Inspect or perform a finite exact plan on an explicitly identified Android phone through ADB. First call operations:[] to inspect; use its revision as expectedRevision for actions. Every call waits for real on-phone consent and returns the resulting UI; screenshot:true also returns PNG. Never use for credentials, OTP, security approvals, payments or sending communications. Use native composer/manual handoff for sensitive tasks. No shell commands, no unattended replay; at most 8 operations and 60 seconds after approval. Basic Latin text only. A failed batch can have partially executed: check phone_action_status before retrying with a new ID.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['requestId', 'serial', 'deviceId', 'operations'], properties: {
        chatId: { type: 'string', description: 'Originating provider:sessionId; required when caller context is unavailable.' }, requestId: { type: 'string', minLength: 8, maxLength: 80 }, serial: { type: 'string' }, deviceId: { type: 'string' }, expectedRevision: { type: 'string' }, screenshot: { type: 'boolean' },
        operations: { type: 'array', maxItems: 8, items: { oneOf: [
          { type: 'object', required: ['type', 'x', 'y'], additionalProperties: false, properties: { type: { const: 'tap' }, x: { type: 'integer', minimum: 0 }, y: { type: 'integer', minimum: 0 } } },
          { type: 'object', required: ['type', 'x', 'y', 'endX', 'endY', 'durationMs'], additionalProperties: false, properties: { type: { const: 'swipe' }, x: { type: 'integer', minimum: 0 }, y: { type: 'integer', minimum: 0 }, endX: { type: 'integer', minimum: 0 }, endY: { type: 'integer', minimum: 0 }, durationMs: { type: 'integer', minimum: 100, maximum: 2000 } } },
          { type: 'object', required: ['type', 'text'], additionalProperties: false, properties: { type: { const: 'text' }, text: { type: 'string', maxLength: 200 } } },
          { type: 'object', required: ['type', 'key'], additionalProperties: false, properties: { type: { const: 'key' }, key: { enum: ['home', 'back'] } } },
          { type: 'object', required: ['type', 'packageName'], additionalProperties: false, properties: { type: { const: 'open_app' }, packageName: { type: 'string', maxLength: 200 } } },
        ] } },
      } }, handler: (args, ctx) => control.execute(args, ctx.caller, ctx.signal),
    }),
    registerDeviceTool({ name: 'phone_action_status', description: 'Read bounded in-memory phone action history, with partial-operation counts. Does not retain screenshots, entered text or UI.', inputSchema: { type: 'object', additionalProperties: false, properties: { requestId: { type: 'string' } } }, handler: async args => ({ content: [{ type: 'text', text: JSON.stringify(control.history(args.requestId)) }] }) }),
    registerDeviceTool({ name: 'phone_action_cancel', description: 'Cancel a pending/running phone-control request. Cannot undo operations already delivered.', inputSchema: { type: 'object', additionalProperties: false, required: ['requestId'], properties: { requestId: { type: 'string' } } }, handler: async args => ({ content: [{ type: 'text', text: JSON.stringify({ cancelled: control.cancel(args.requestId) }) }] }) }),
  ];
  return () => { control.close(); stops.forEach(stop => stop()); };
}
