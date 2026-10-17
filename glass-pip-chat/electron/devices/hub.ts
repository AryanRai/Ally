import { randomUUID } from 'node:crypto';

export type DeviceKind = 'watch' | 'phone';
export interface DeviceCard { id: string; title: string; body: string; sessionId?: string; at?: string }
export interface DeviceCommand { id: string; action: string; title: string; body: string; url?: string; seconds?: number; expiresAt: number }
interface Device { kind: DeviceKind; send: (message: unknown) => void }
interface Pending { deviceId: string; approved: boolean; timer: ReturnType<typeof setTimeout>; resolve: (result: { ok: boolean; message: string }) => void }

/** Delivery receipts never imply user approval. Commands are never replayed. */
export class DeviceHub {
  private devices = new Map<string, Device>();
  private cards = new Map<string, { kind: DeviceKind; card: DeviceCard; expires: number; seen: Set<string> }>();
  private pending = new Map<string, Pending>();
  constructor(private dismiss: (id: string) => void, private now = Date.now) {}
  connect(id: string, kind: DeviceKind, send: Device['send']): () => void {
    if (!/^[\w-]{8,80}$/.test(id) || !['watch', 'phone'].includes(kind)) throw new Error('Invalid device');
    if (this.devices.has(id)) throw new Error('Device is already connected');
    this.devices.set(id, { kind, send });
    try { for (const [key, item] of this.cards) {
      if (item.expires < this.now()) this.cards.delete(key);
      else if (item.kind === kind && !item.seen.has(id)) send({ type: 'card', card: item.card });
    } } catch (error) { this.devices.delete(id); throw error; }
    return () => {
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
    if (message.status === 'approved') pending.approved = true;
    else if (message.status === 'rejected' || message.status === 'dismissed') this.finish(id, false, 'Declined on device.');
    else if (message.status === 'done') this.finish(id, pending.approved, pending.approved ? 'Confirmed and completed on device.' : 'No user approval was received.');
    else if (message.status === 'handed_off') this.finish(id, pending.approved, pending.approved ? 'Approved on device; opened the system app. Its final action is not verified.' : 'No user approval was received.');
    else if (message.status === 'suppressed') this.finish(id, false, 'Device quiet settings suppressed the alert.');
    else if (message.status === 'failed') this.finish(id, false, 'Device could not complete the action.');
  }
  command(kind: DeviceKind, action: string, args: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    const candidates = [...this.devices].filter(([id, d]) => d.kind === kind && (!args.deviceId || args.deviceId === id));
    if (candidates.length !== 1) return Promise.resolve({ ok: false, message: candidates.length ? 'Multiple devices connected; specify deviceId.' : 'Device is offline. Enable Keep connected in its Ally settings.' });
    if (this.pending.size >= 8) return Promise.resolve({ ok: false, message: 'Too many pending device requests.' });
    const [deviceId, device] = candidates[0];
    const command: DeviceCommand = { id: randomUUID(), action, title: String(args.title || 'Ally request').slice(0, 80), body: String(args.body || '').slice(0, 1200), expiresAt: this.now() + 120_000 };
    if (action === 'phone_open_url') {
      try { const url = new URL(String(args.url)); if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2000) throw new Error(); command.url = url.href; }
      catch { return Promise.resolve({ ok: false, message: 'Provide a valid HTTPS URL without credentials.' }); }
    }
    if (action === 'phone_set_timer') {
      if (!Number.isInteger(args.seconds) || Number(args.seconds) < 1 || Number(args.seconds) > 86400) return Promise.resolve({ ok: false, message: 'Timer must be 1–86400 seconds.' });
      command.seconds = Number(args.seconds);
    }
    return new Promise(resolve => {
      const timer = setTimeout(() => this.finish(command.id, false, 'No device approval before expiry; action not confirmed.'), 120_000);
      this.pending.set(command.id, { deviceId, timer, approved: false, resolve });
      try { device.send({ type: 'command', command }); } catch { this.finish(command.id, false, 'Device delivery failed.'); }
    });
  }
  list() { return [...this.devices].map(([id, d]) => ({ id, kind: d.kind })); }
  close() { for (const id of this.pending.keys()) this.finish(id, false, 'Ally stopped.'); this.devices.clear(); }
  private finish(id: string, ok: boolean, message: string) { const p = this.pending.get(id); if (!p) return; clearTimeout(p.timer); this.pending.delete(id); p.resolve({ ok, message }); }
}
