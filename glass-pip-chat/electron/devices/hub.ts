import { randomUUID } from 'node:crypto';
import type { InteractionBroker } from './interactions.js';

export type DeviceKind = 'watch' | 'phone';
export interface DeviceCard { id: string; title: string; body: string; sessionId?: string; at?: string; chatId?: string; provider?: 'codex' | 'claude'; kind?: 'response' | 'attention' | 'note'; createdAt?: number }
export interface DeviceCommand { id: string; action: string; title: string; body: string; chatId?: string; url?: string; seconds?: number; packageName?: string; hour?: number; minute?: number; expiresAt: number }
interface Device { kind: DeviceKind; send: (message: unknown) => void; controller: AbortController }
interface Pending { deviceId: string; approved: boolean; expiresAt: number; cleanup?: () => void; timer: ReturnType<typeof setTimeout>; resolve: (result: { ok: boolean; message: string }) => void }

/** Delivery receipts never imply user approval. Commands are never replayed. */
export class DeviceHub {
  private devices = new Map<string, Device>();
  private cards = new Map<string, { kind: DeviceKind; card: DeviceCard; expires: number; seen: Set<string> }>();
  private pending = new Map<string, Pending>();
  constructor(private dismiss: (id: string) => void, private now = Date.now, private interactions?: InteractionBroker) {}
  connect(id: string, kind: DeviceKind, send: Device['send']): () => void {
    if (!/^[\w-]{8,80}$/.test(id) || !['watch', 'phone'].includes(kind)) throw new Error('Invalid device');
    if (this.devices.has(id)) throw new Error('Device is already connected');
    const controller = new AbortController();
    this.devices.set(id, { kind, send, controller });
    try { for (const [key, item] of this.cards) {
      if (item.expires < this.now()) this.cards.delete(key);
      else if (item.kind === kind && !item.seen.has(id)) send({ type: 'card', card: item.card });
    } } catch (error) { this.devices.delete(id); throw error; }
    return () => {
      controller.abort();
      this.devices.delete(id);
      for (const [key, item] of this.pending) if (item.deviceId === id) this.finish(key, false, 'Device disconnected; action was not confirmed.');
    };
  }
  publish(kind: DeviceKind, card: DeviceCard): void {
    if (this.cards.has(card.id)) return;
    const safe = { ...card, title: card.title.slice(0, 80), body: card.body.slice(0, 1200) };
    this.cards.set(card.id, { kind, card: safe, expires: this.now() + 600_000, seen: new Set() });
    while (this.cards.size > 50) this.cards.delete(this.cards.keys().next().value!);
    for (const device of this.devices.values()) if (device.kind === kind) {
      try { device.send({ type: 'card', card: safe }); } catch { /* Unacknowledged cards replay on reconnect. */ }
    }
  }
  receipt(deviceId: string, message: Record<string, unknown>): void {
    const id = typeof message.id === 'string' ? message.id : '';
    const card = this.cards.get(id);
    if (card && this.devices.get(deviceId)?.kind === card.kind) {
      if (message.status === 'received' || message.status === 'suppressed') card.seen.add(deviceId);
      if (message.status === 'dismissed') { this.dismiss(id); this.cards.delete(id); }
    }
    const pending = this.pending.get(id);
    if (!pending || pending.deviceId !== deviceId) return;
    if (pending.expiresAt <= this.now()) { this.finish(id, false, 'Device approval expired.'); return; }
    if (message.status === 'approved') pending.approved = true;
    else if (message.status === 'rejected' || message.status === 'dismissed') this.finish(id, false, 'Declined on device.');
    else if (message.status === 'done') this.finish(id, pending.approved, pending.approved ? 'Confirmed and completed on device.' : 'No user approval was received.');
    else if (message.status === 'handed_off') this.finish(id, pending.approved, pending.approved ? 'Approved on device; opened the system app. Its final action is not verified.' : 'No user approval was received.');
    else if (message.status === 'suppressed') this.finish(id, false, 'Device quiet settings suppressed the alert.');
    else if (message.status === 'failed') this.finish(id, false, 'Device could not complete the action.');
  }
  command(kind: DeviceKind, action: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<{ ok: boolean; message: string }> {
    if (signal?.aborted) return Promise.resolve({ ok: false, message: 'Request cancelled.' });
    if (!['watch_haptic', 'watch_show_card', 'phone_notify', 'phone_open_url', 'phone_open_app', 'phone_set_timer', 'phone_set_alarm', 'phone_control_approve'].includes(action) || !action.startsWith(kind + '_')) return Promise.resolve({ ok: false, message: 'Unsupported device action.' });
    const candidates = [...this.devices].filter(([id, d]) => d.kind === kind && (!args.deviceId || args.deviceId === id));
    if (candidates.length !== 1) return Promise.resolve({ ok: false, message: candidates.length ? 'Multiple devices connected; specify deviceId.' : 'Device is offline. Enable Keep connected in its Ally settings.' });
    if (this.pending.size >= 8) return Promise.resolve({ ok: false, message: 'Too many pending device requests.' });
    const [deviceId, device] = candidates[0];
    const command: DeviceCommand = { id: randomUUID(), action, title: String(args.title || 'Ally request').slice(0, 80), body: String(args.body || '').slice(0, 1200), expiresAt: this.now() + 120_000 };
    if (typeof args.chatId === 'string' && /^(codex|claude):[\w-]{8,100}$/.test(args.chatId)) command.chatId = args.chatId;
    if (action === 'phone_open_url') {
      try { const url = new URL(String(args.url)); if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2000) throw new Error(); command.url = url.href; }
      catch { return Promise.resolve({ ok: false, message: 'Provide a valid HTTPS URL without credentials.' }); }
    }
    if (action === 'phone_open_app') {
      if (typeof args.packageName !== 'string' || args.packageName.length > 200 || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(args.packageName)) return Promise.resolve({ ok: false, message: 'Provide the Android package name of an installed app.' });
      command.packageName = args.packageName;
      command.body = [command.body, `Open app: ${args.packageName}`].filter(Boolean).join('\n');
    }
    if (action === 'phone_set_alarm') {
      if (!Number.isInteger(args.hour) || !Number.isInteger(args.minute) || Number(args.hour) < 0 || Number(args.hour) > 23 || Number(args.minute) < 0 || Number(args.minute) > 59) return Promise.resolve({ ok: false, message: 'Provide an hour (0–23) and minute (0–59), in the phone’s local time.' });
      command.hour = Number(args.hour); command.minute = Number(args.minute);
      command.body = [command.body, `Alarm: ${String(args.hour).padStart(2, '0')}:${String(args.minute).padStart(2, '0')} (phone local time)`].filter(Boolean).join('\n');
    }
    if (action === 'phone_set_timer') {
      if (!Number.isInteger(args.seconds) || Number(args.seconds) < 1 || Number(args.seconds) > 86400) return Promise.resolve({ ok: false, message: 'Timer must be 1–86400 seconds.' });
      command.seconds = Number(args.seconds);
    }
    return new Promise(resolve => {
      const timer = setTimeout(() => this.finish(command.id, false, 'No device approval before expiry; action not confirmed.'), 120_000);
      const abort = () => this.finish(command.id, false, 'Request cancelled.');
      const approvalController = new AbortController();
      this.pending.set(command.id, { deviceId, timer, expiresAt: command.expiresAt, approved: false, resolve, cleanup: () => { signal?.removeEventListener('abort', abort); approvalController.abort(); } });
      signal?.addEventListener('abort', abort, { once: true });
      if (this.interactions && command.chatId) {
        void this.interactions.request({ id: command.id, chatId: command.chatId, kind: 'approval', targetDeviceId: deviceId, deviceAction: action, title: command.title, detail: command.body,
          fields: [], actions: [{ value: 'accept', label: 'Allow once' }, { value: 'decline', label: 'Decline' }], expiresAt: command.expiresAt }, approvalController.signal).then(answer => {
          const pending = this.pending.get(command.id);
          if (!pending) return;
          if (answer.action !== 'accept' || command.expiresAt <= this.now() || this.devices.get(deviceId) !== device) {
            this.finish(command.id, false, answer.action === 'decline' ? 'Declined by user.' : 'No decision received; request expired or was cancelled. Open Ally Inbox to review new requests; phone notification settings can hide alerts.'); return;
          }
          pending.approved = true;
          if (action === 'phone_control_approve') { this.finish(command.id, true, 'User approved the exact plan in chat.'); return; }
          try { device.send({ type: 'authorized_command', command }); } catch { this.finish(command.id, false, 'Approved, but target device disconnected.'); }
        }).catch(() => this.finish(command.id, false, 'Could not present this request in chat.'));
        return;
      }
      try { device.send({ type: 'command', command }); } catch { this.finish(command.id, false, 'Device delivery failed.'); }
    });
  }
  list() { return [...this.devices].map(([id, d]) => ({ id, kind: d.kind })); }
  connectionSignal(id: string) { return this.devices.get(id)?.controller.signal; }
  broadcast(message: unknown) { for (const device of this.devices.values()) { try { device.send(message); } catch { /* Reconnect resynchronizes pending requests. */ } } }
  close() { for (const device of this.devices.values()) device.controller.abort(); for (const id of this.pending.keys()) this.finish(id, false, 'Ally stopped.'); this.devices.clear(); }
  private finish(id: string, ok: boolean, message: string) { const p = this.pending.get(id); if (!p) return; clearTimeout(p.timer); p.cleanup?.(); this.pending.delete(id); p.resolve({ ok, message }); }
}
