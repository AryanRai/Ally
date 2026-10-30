import { assertOperationAllowed, phoneViewFromXml, validateOperations, type PhoneOperation, type PhoneView } from './adb.js';
import type { DeviceHub } from './hub.js';

export interface ControlGrant { id: string; deviceId: string; chatId: string; expiresAt: number; scope?: 'prompt' | 'timed' }

/**
 * Drives the phone through the Ally app's own accessibility executor over the authenticated
 * device socket, so it works on any network without ADB. The desktop still owns every safety
 * check; the phone additionally refuses calls outside its active grant.
 */
export class AccessibilityPhone {
  constructor(private hub: DeviceHub) {}
  static supported(hub: DeviceHub, deviceId: string) { return hub.capabilities(deviceId).includes('on-device-control'); }
  async status(deviceId: string, signal?: AbortSignal) {
    const result = await this.hub.call(deviceId, 'control.status', {}, signal, 8000);
    return { enabled: result.enabled === true };
  }
  async grant(grant: ControlGrant, title: string, signal?: AbortSignal) {
    await this.hub.call(grant.deviceId, 'control.grant', { grantId: grant.id, chatId: grant.chatId, title, expiresAt: grant.expiresAt }, signal, 8000);
  }
  /** Waits while the phone asks the user to unlock (their own fingerprint/face/PIN prompt). */
  async ready(grant: ControlGrant, signal?: AbortSignal) {
    try { await this.hub.call(grant.deviceId, 'control.ready', scope(grant), signal, 90_000); }
    catch (error) { if (!(error instanceof Error && /Unsupported phone control call/.test(error.message))) throw error; }
  }
  end(grant: ControlGrant) { void this.hub.call(grant.deviceId, 'control.end', { grantId: grant.id }, undefined, 5000).catch(() => {}); }
  async view(grant: ControlGrant, signal?: AbortSignal): Promise<PhoneView> {
    const result = await this.hub.call(grant.deviceId, 'control.view', scope(grant), signal);
    if (typeof result.xml !== 'string') throw Error('The phone returned no screen.');
    const view = phoneViewFromXml(result.xml);
    // Prefer the real display size: the tree's largest node can be smaller than the screen.
    const width = Number(result.width), height = Number(result.height);
    return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= 10000 && height <= 10000 ? { ...view, width, height } : view;
  }
  async screenshot(grant: ControlGrant, signal?: AbortSignal) {
    const result = await this.hub.call(grant.deviceId, 'control.screenshot', scope(grant), signal);
    if (result.mimeType !== 'image/jpeg' || typeof result.data !== 'string' || result.data.length > 2_800_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.data)) throw Error('Screenshot unavailable.');
    const head = Buffer.from(result.data.slice(0, 8), 'base64');
    if (head[0] !== 0xff || head[1] !== 0xd8) throw Error('Screenshot unavailable.');
    return { mimeType: 'image/jpeg' as const, data: result.data, scale: Number(result.scale) || 1 };
  }
  async perform(grant: ControlGrant, operation: PhoneOperation, view: PhoneView, signal?: AbortSignal) {
    validateOperations([operation], { unicodeText: true });
    assertOperationAllowed(operation, view);
    await this.hub.call(grant.deviceId, 'control.perform', { ...scope(grant), operation }, signal);
  }
}

const scope = (grant: ControlGrant) => ({ grantId: grant.id, chatId: grant.chatId });
