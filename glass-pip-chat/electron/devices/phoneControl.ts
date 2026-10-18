import { createHash } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { AdbPhone, validateOperations, type PhoneOperation } from './adb.js';
import type { DeviceHub } from './hub.js';
import type { ToolResult } from '../chatsMcp/protocol.js';
import { originatingChat } from './interactions.js';

interface Action {
  id: string; deviceId: string; state: 'approval' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number; updatedAt: number; completedOperations: number; totalOperations: number;
  inFlightOperation?: number; deliveryUncertain?: boolean;
  digest: string; controller: AbortController; message?: string;
}

/** One finite, immutable plan per native approval. No execution queue or model loop. */
export class PhoneControl {
  private actions = new Map<string, Action>();
  private busy = new Set<string>();
  constructor(private hub: DeviceHub, private adb = new AdbPhone(), private now = Date.now) {}
  async devices() {
    return Promise.all((await this.adb.list()).map(async device => {
      const deviceId = await this.adb.identity(device.serial).catch(() => undefined);
      return { ...device, deviceId, connected: !!deviceId && this.connected(deviceId), capabilities: deviceId ? ['inspect', 'screenshot', 'tap', 'swipe', 'text-basic-latin', 'home', 'back', 'open_app'] : [], developmentAdapter: true };
    }));
  }
  history(id?: unknown) {
    return [...this.actions.values()].filter(a => !id || a.id === id).map(({ controller: _controller, digest: _digest, ...publicAction }) => publicAction);
  }
  cancel(id: unknown) {
    const action = this.actions.get(String(id));
    if (!action || !['approval', 'running'].includes(action.state)) return false;
    action.state = 'cancelled'; action.updatedAt = this.now(); action.message = 'Cancelled; already completed operations cannot be undone.'; action.controller.abort();
    return true;
  }
  close() { for (const a of this.actions.values()) this.cancel(a.id); }
  private connected(id: string) { return this.hub.list().some(d => d.id === id && d.kind === 'phone'); }
  async execute(args: Record<string, unknown>, caller?: string, parentSignal?: AbortSignal): Promise<ToolResult> {
    const chatId = originatingChat(args, caller);
    const { requestId, serial, deviceId, expectedRevision } = args;
    if (typeof requestId !== 'string' || !/^[\w-]{8,80}$/.test(requestId) || typeof serial !== 'string' || typeof deviceId !== 'string') throw Error('Provide a unique requestId, explicit ADB serial and Ally deviceId from phone_control_devices.');
    const operations = validateOperations(args.operations);
    if (operations.length && (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision))) throw Error('Inspect first; actions require the returned expectedRevision.');
    const screenshot = args.screenshot === true;
    const digest = createHash('sha256').update(JSON.stringify({ serial, deviceId, chatId, operations, expectedRevision, screenshot })).digest('hex');
    const previous = this.actions.get(requestId);
    if (previous) {
      if (previous.digest !== digest) throw Error('requestId was already used for different parameters.');
      return { content: [{ type: 'text', text: JSON.stringify(this.history(requestId)) }] };
    }
    if (this.actions.size >= 500) throw Error('Phone control audit is full for this Ally process. Restart to begin a new audit.');
    if (this.busy.has(deviceId) || this.busy.has(serial)) throw Error('This phone already has an active control request.');
    const controller = new AbortController();
    const action: Action = { id: requestId, deviceId, state: 'approval', createdAt: this.now(), updatedAt: this.now(), completedOperations: 0, totalOperations: operations.length, digest, controller };
    this.actions.set(requestId, action); this.busy.add(deviceId); this.busy.add(serial);
    const signal = controller.signal;
    const connection = this.hub.connectionSignal(deviceId);
    const disconnected = () => controller.abort();
    parentSignal?.addEventListener('abort', disconnected, { once: true });
    if (parentSignal?.aborted) disconnected();
    connection?.addEventListener('abort', disconnected, { once: true });
    const check = async () => {
      if (signal.aborted) throw Error('Cancelled or expired.');
      if (!connection || connection.aborted || this.hub.connectionSignal(deviceId) !== connection) throw Error('Ally phone disconnected.');
      if (await this.adb.identity(serial, signal) !== deviceId) throw Error('ADB serial does not match the approved Ally phone.');
    };
    // Also bounds approval wait and all subprocesses. Native approvals themselves expire after two minutes.
    const expiry = setTimeout(() => controller.abort(), 180_000);
    try {
      await check();
      const plan = operations.map((op: PhoneOperation, i) => `${i + 1}. ${JSON.stringify(op)}`).join('\n');
      const body = `Request ${requestId}\nADB device ${serial}\n${plan || 'Inspect visible screen only.'}\nReturn UI hierarchy${screenshot ? ' and screenshot' : ''} to the requesting agent.\nApproval expires in 2 minutes; approved execution lasts at most 60 seconds. Never enter passwords, codes, purchases or send messages.\nAlly will return to your previous app after approval.`;
      if (body.length > 1200) throw Error('Plan too long for a readable device approval. Use fewer operations.');
      const approval = await this.hub.command('phone', 'phone_control_approve', { deviceId, chatId, title: 'Control this phone once', body }, signal);
      if (!approval.ok) throw Error(approval.message);
      await pause(750, undefined, { signal }); // Allow the phone to restore its prior app after a cross-device decision.
      await check(); action.state = 'running'; action.updatedAt = this.now();
      const deadline = this.now() + 60_000;
      const executionExpiry = setTimeout(() => controller.abort(), 60_000);
      try {
        let view = await this.adb.view(serial, signal);
        if (operations.length && view.revision !== expectedRevision) throw Error('Screen changed since inspection. Inspect again before acting.');
        for (const operation of operations) {
          await check();
          if (this.now() > deadline) throw Error('Execution approval expired.');
          action.inFlightOperation = action.completedOperations + 1;
          await this.adb.perform(serial, operation, view, signal);
          action.completedOperations++; delete action.inFlightOperation; action.updatedAt = this.now();
          await pause(250, undefined, { signal });
          view = await this.adb.view(serial, signal);
        }
        await check();
        const content: ToolResult['content'] = [{ type: 'text', text: JSON.stringify({ requestId, ...view, completedOperations: action.completedOperations, note: 'Input delivery is confirmed; app outcomes require inspecting the returned screen.' }) }];
        if (screenshot) {
          const data = await this.adb.screenshot(serial, signal);
          // Refuse the image if the UI changed or became sensitive during capture.
          const after = await this.adb.view(serial, signal);
          if (after.revision !== view.revision) throw Error('Screen changed during capture; screenshot withheld.');
          content.push({ type: 'image', mimeType: 'image/png', data });
        }
        await check(); action.state = 'completed'; action.updatedAt = this.now();
        return { content };
      } finally { clearTimeout(executionExpiry); }
    } catch (error) {
      if (action.inFlightOperation) action.deliveryUncertain = true;
      if (action.state !== 'cancelled') { action.state = signal.aborted ? 'cancelled' : 'failed'; action.message = error instanceof Error ? error.message : 'Phone control failed.'; }
      action.updatedAt = this.now();
      return { content: [{ type: 'text', text: JSON.stringify(this.history(requestId)) }], isError: true };
    } finally { clearTimeout(expiry); connection?.removeEventListener('abort', disconnected); parentSignal?.removeEventListener('abort', disconnected); this.busy.delete(deviceId); this.busy.delete(serial); }
  }
}
