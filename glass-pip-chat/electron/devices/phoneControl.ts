import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { AdbPhone, validateOperations, type PhoneOperation, type PhoneView } from './adb.js';
import { AccessibilityPhone, type ControlGrant } from './accessibilityPhone.js';
import type { DeviceHub } from './hub.js';
import type { ToolResult } from '../chatsMcp/protocol.js';
import { originatingChat } from './interactions.js';

interface Action {
  id: string; deviceId: string; state: 'approval' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number; updatedAt: number; completedOperations: number; totalOperations: number;
  inFlightOperation?: number; deliveryUncertain?: boolean; transport: 'adb' | 'on-device';
  digest: string; controller: AbortController; message?: string;
}

/** Both executors receive only operations the desktop has validated against the inspected screen. */
interface Transport {
  kind: 'adb' | 'on-device';
  check(signal: AbortSignal): Promise<void>;
  /** Resolves once the phone is unlocked; outside the execution time budget. */
  ready(signal: AbortSignal): Promise<void>;
  view(signal: AbortSignal): Promise<PhoneView>;
  perform(operation: PhoneOperation, view: PhoneView, signal: AbortSignal): Promise<void>;
  screenshot(signal: AbortSignal): Promise<{ mimeType: 'image/png' | 'image/jpeg'; data: string; scale?: number }>;
}

const DEFAULT_MINUTES = 15, MAX_MINUTES = 60;

/**
 * One approval starts a timed control session for one chat and phone; later finite plans in that
 * session run without asking again. Stopping on the phone, expiry or cancellation ends it.
 */
export class PhoneControl {
  private actions = new Map<string, Action>();
  private busy = new Set<string>();
  private grants = new Map<string, ControlGrant>();
  private stopRevoked: () => void;
  constructor(private hub: DeviceHub, private adb = new AdbPhone(), private now = Date.now, private device = new AccessibilityPhone(hub)) {
    this.stopRevoked = hub.onRevoked((deviceId, grantId) => {
      for (const [key, grant] of this.grants) if (grant.id === grantId && grant.deviceId === deviceId) this.grants.delete(key);
      for (const action of this.actions.values()) if (action.deviceId === deviceId && ['approval', 'running'].includes(action.state)) {
        action.state = 'cancelled'; action.updatedAt = this.now(); action.message = 'Stopped on the phone; already completed operations cannot be undone.'; action.controller.abort();
      }
    });
  }
  async devices() {
    const adb = await this.adb.list().catch(() => []);
    const viaAdb = await Promise.all(adb.map(async device => {
      const deviceId = await this.adb.identity(device.serial).catch(() => undefined);
      return { ...device, deviceId, connected: !!deviceId && this.connected(deviceId), capabilities: deviceId ? ['inspect', 'screenshot', 'tap', 'swipe', 'text-basic-latin', 'home', 'back', 'open_app'] : [], developmentAdapter: true };
    }));
    const onDevice = this.hub.list().filter(d => d.kind === 'phone' && AccessibilityPhone.supported(this.hub, d.id)).map(d => ({
      deviceId: d.id, transport: 'on-device', connected: true, serial: undefined,
      capabilities: ['inspect', 'screenshot', 'tap', 'swipe', 'text', 'home', 'back', 'recents', 'open_app'],
      note: 'Works on any network. Omit serial to use it. First use may ask the user to turn on Ally control in Accessibility settings.',
      session: this.sessionFor(d.id),
    }));
    return [...onDevice, ...viaAdb];
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
  /** Ends this chat's session on the desktop and the phone. */
  endSession(deviceId: unknown, chatId: string | undefined) {
    const key = `${deviceId}|${chatId}`, grant = this.grants.get(key);
    if (!grant) return false;
    this.grants.delete(key); this.device.end(grant);
    return true;
  }
  close() { for (const a of this.actions.values()) this.cancel(a.id); for (const g of this.grants.values()) this.device.end(g); this.grants.clear(); this.stopRevoked(); }
  private connected(id: string) { return this.hub.list().some(d => d.id === id && d.kind === 'phone'); }
  private sessionFor(deviceId: string) {
    const active = [...this.grants.values()].filter(g => g.deviceId === deviceId && g.expiresAt > this.now());
    return active.length ? active.map(g => ({ chatId: g.chatId, expiresAt: new Date(g.expiresAt).toISOString() })) : undefined;
  }
  private activeGrant(deviceId: string, chatId: string | undefined) {
    const key = `${deviceId}|${chatId}`, grant = this.grants.get(key);
    if (grant && grant.expiresAt > this.now() + 5000) return grant;
    if (grant) this.grants.delete(key);
    return undefined;
  }

  async execute(args: Record<string, unknown>, caller?: string, parentSignal?: AbortSignal): Promise<ToolResult> {
    const chatId = originatingChat(args, caller);
    const { requestId, serial, expectedRevision } = args;
    const onDevice = serial === undefined;
    const deviceId = typeof args.deviceId === 'string' ? args.deviceId : onDevice ? this.onlyOnDevicePhone() : undefined;
    if (typeof requestId !== 'string' || !/^[\w-]{8,80}$/.test(requestId) || (!onDevice && typeof serial !== 'string') || typeof deviceId !== 'string') throw Error('Provide a unique requestId and the deviceId from phone_control_devices (plus serial only for the ADB development adapter).');
    if (onDevice && !chatId) throw Error('Include chatId (provider:sessionId of this chat); the phone binds its control session to one chat.');
    if (onDevice && !AccessibilityPhone.supported(this.hub, deviceId)) throw Error('This phone is offline or its Ally app predates on-device control. Update Ally on the phone and enable Keep connected.');
    const operations = validateOperations(args.operations, { unicodeText: onDevice });
    if (operations.length && (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision))) throw Error('Inspect first; actions require the returned expectedRevision.');
    const screenshot = args.screenshot === true;
    const minutes = Number.isInteger(args.sessionMinutes) ? Math.min(MAX_MINUTES, Math.max(1, Number(args.sessionMinutes))) : DEFAULT_MINUTES;
    const digest = createHash('sha256').update(JSON.stringify({ serial, deviceId, chatId, operations, expectedRevision, screenshot })).digest('hex');
    const previous = this.actions.get(requestId);
    if (previous) {
      if (previous.digest !== digest) throw Error('requestId was already used for different parameters.');
      return { content: [{ type: 'text', text: JSON.stringify(this.history(requestId)) }] };
    }
    if (this.actions.size >= 500) throw Error('Phone control audit is full for this Ally process. Restart to begin a new audit.');
    const lock = onDevice ? deviceId : String(serial);
    if (this.busy.has(deviceId) || this.busy.has(lock)) throw Error('This phone already has an active control request.');
    const controller = new AbortController();
    const action: Action = { id: requestId, deviceId, state: 'approval', createdAt: this.now(), updatedAt: this.now(), completedOperations: 0, totalOperations: operations.length, digest, controller, transport: onDevice ? 'on-device' : 'adb' };
    this.actions.set(requestId, action); this.busy.add(deviceId); this.busy.add(lock);
    const signal = controller.signal;
    const connection = this.hub.connectionSignal(deviceId);
    const disconnected = () => controller.abort();
    parentSignal?.addEventListener('abort', disconnected, { once: true });
    if (parentSignal?.aborted) disconnected();
    connection?.addEventListener('abort', disconnected, { once: true });
    const linked = async () => {
      if (signal.aborted) throw Error('Cancelled or expired.');
      if (!connection || connection.aborted || this.hub.connectionSignal(deviceId) !== connection) throw Error('Ally phone disconnected.');
    };
    let grant = this.activeGrant(deviceId, chatId);
    const transport: Transport = onDevice ? {
      kind: 'on-device', check: linked, ready: s => this.device.ready(grant!, s),
      view: s => this.device.view(grant!, s), perform: (op, view, s) => this.device.perform(grant!, op, view, s), screenshot: s => this.device.screenshot(grant!, s),
    } : {
      kind: 'adb', ready: async () => {},
      check: async s => { await linked(); if (await this.adb.identity(String(serial), s) !== deviceId) throw Error('ADB serial does not match the approved Ally phone.'); },
      view: s => this.adb.view(String(serial), s), perform: (op, view, s) => this.adb.perform(String(serial), op, view, s),
      screenshot: async s => ({ mimeType: 'image/png' as const, data: await this.adb.screenshot(String(serial), s) }),
    };
    // Also bounds approval wait and all subprocesses. Native approvals themselves expire after two minutes.
    const expiry = setTimeout(() => controller.abort(), 270_000); // approval (2 min) + unlock wait (90 s) + execution (60 s)
    try {
      await transport.check(signal);
      if (onDevice && !grant && !(await this.device.status(deviceId, signal)).enabled)
        throw Error('Ally control is off on the phone. Ask the user to turn it on once in Settings → Accessibility → Ally control (if it is greyed out: Ally App info → ⋮ → Allow restricted settings). A setup notification was shown on the phone.');
      if (!grant) {
        const plan = operations.map((op: PhoneOperation, i) => `${i + 1}. ${JSON.stringify(op)}`).join('\n');
        const body = `Let this chat control your phone for ${minutes} minutes. Ally reads the screen and taps, swipes and types only for this chat's requests, without asking again until the session ends.\nA notification with Stop shows the whole time.\nFirst request ${requestId}${onDevice ? '' : ` via ADB ${serial}`}:\n${plan || 'Look at the screen.'}${screenshot ? '\nIncludes a screenshot.' : ''}\nAlly never enters passwords or codes, pays, or presses Send, Delete or Allow for you.`;
        if (body.length > 1200) throw Error('Plan too long for a readable device approval. Use fewer operations.');
        const approval = await this.hub.command('phone', 'phone_control_approve', { deviceId, chatId, title: `Let Ally control this phone · ${minutes} min`, body, acceptLabel: `Allow ${minutes} min` }, signal);
        if (!approval.ok) throw Error(approval.message);
        await pause(750, undefined, { signal }); // Allow the phone to restore its prior app after a cross-device decision.
        await transport.check(signal);
        grant = { id: `grant-${randomUUID()}`, deviceId, chatId: chatId ?? '', expiresAt: this.now() + minutes * 60_000 };
        if (onDevice) await this.device.grant(grant, 'Ally chat', signal);
        // ADB has no phone-side enforcement; the notice still shows where the app supports it.
        else if (AccessibilityPhone.supported(this.hub, deviceId)) await this.device.grant(grant, 'Ally chat', signal).catch(() => {});
        this.grants.set(`${deviceId}|${chatId}`, grant);
      }
      await transport.ready(signal);
      await transport.check(signal);
      action.state = 'running'; action.updatedAt = this.now();
      const deadline = this.now() + 60_000;
      const executionExpiry = setTimeout(() => controller.abort(), 60_000);
      try {
        let view = await transport.view(signal);
        if (operations.length && view.revision !== expectedRevision) throw Error('Screen changed since inspection. Inspect again before acting.');
        for (const operation of operations) {
          await transport.check(signal);
          if (this.now() > deadline) throw Error('Execution time expired.');
          if (grant.expiresAt <= this.now()) throw Error('The control session ended. Ask again to start a new one.');
          action.inFlightOperation = action.completedOperations + 1;
          await transport.perform(operation, view, signal);
          action.completedOperations++; delete action.inFlightOperation; action.updatedAt = this.now();
          await pause(250, undefined, { signal });
          view = await this.settledView(transport, signal);
        }
        await transport.check(signal);
        let image: Awaited<ReturnType<Transport['screenshot']>> | undefined;
        if (screenshot) {
          // The image must match the returned UI. Unlock and launch animations settle quickly,
          // so re-read and retry briefly; a screen that keeps changing (or turns sensitive) is refused.
          for (let attempt = 0; ; attempt++) {
            if (attempt) { await pause(500, undefined, { signal }); view = await this.settledView(transport, signal); }
            image = await transport.screenshot(signal);
            const after = await transport.view(signal);
            if (after.revision === view.revision) break;
            if (attempt >= 2) throw Error('Screen changed during capture; screenshot withheld.');
          }
        }
        const sessionEnds = new Date(grant.expiresAt).toISOString();
        const content: ToolResult['content'] = [{ type: 'text', text: JSON.stringify({ requestId, ...view, completedOperations: action.completedOperations, transport: transport.kind, sessionEnds, note: 'Input delivery is confirmed; app outcomes require inspecting the returned screen. Further requests from this chat run without asking until the session ends.' }) }];
        if (image) content.push({ type: 'image', mimeType: image.mimeType, data: image.data });
        await transport.check(signal); action.state = 'completed'; action.updatedAt = this.now();
        return { content };
      } finally { clearTimeout(executionExpiry); }
    } catch (error) {
      if (action.inFlightOperation) action.deliveryUncertain = true;
      const message = error instanceof Error ? error.message : 'Phone control failed.';
      // The phone lost its session (app restarted or Stop): ask again next time instead of failing forever.
      if (/No active control session/.test(message)) this.grants.delete(`${deviceId}|${chatId}`);
      if (action.state !== 'cancelled') { action.state = signal.aborted ? 'cancelled' : 'failed'; action.message = message; }
      action.updatedAt = this.now();
      return { content: [{ type: 'text', text: JSON.stringify(this.history(requestId)) }], isError: true };
    } finally { clearTimeout(expiry); connection?.removeEventListener('abort', disconnected); parentSignal?.removeEventListener('abort', disconnected); this.busy.delete(deviceId); this.busy.delete(lock); }
  }
  /** App launches and Back/Home briefly show only system UI; a real lock or system screen still fails after ~1.5 s. */
  private async settledView(transport: Transport, signal: AbortSignal): Promise<PhoneView> {
    for (let attempt = 0; ; attempt++) {
      try { return await transport.view(signal); }
      catch (error) {
        const transient = error instanceof Error && /System or lock screen|Cannot determine screen bounds|screen is unavailable/i.test(error.message);
        if (!transient || attempt >= 5) throw error;
        await pause(300, undefined, { signal });
      }
    }
  }
  private onlyOnDevicePhone() {
    const phones = this.hub.list().filter(d => d.kind === 'phone' && AccessibilityPhone.supported(this.hub, d.id));
    return phones.length === 1 ? phones[0].id : undefined;
  }
}
