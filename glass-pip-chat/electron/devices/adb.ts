import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export type AdbRun = (args: string[], signal?: AbortSignal) => Promise<Buffer>;
export type PhoneOperation =
  | { type: 'tap'; x: number; y: number }
  | { type: 'swipe'; x: number; y: number; endX: number; endY: number; durationMs: number }
  | { type: 'text'; text: string }
  | { type: 'key'; key: 'back' | 'home' }
  | { type: 'open_app'; packageName: string };
export interface PhoneView { revision: string; width: number; height: number; ui: string }

export function createAdbRun(): AdbRun {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
  const candidate = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  const binary = existsSync(candidate) ? candidate : 'adb';
  return (args, signal) => new Promise((resolve, reject) => {
    execFile(binary, args, { encoding: 'buffer', windowsHide: true, timeout: 15_000, maxBuffer: 12 * 1024 * 1024, signal }, (err, stdout) => {
      // Never expose subprocess stderr (it can contain UI or entered text).
      if (err) reject(new Error(signal?.aborted ? 'Phone action cancelled.' : 'ADB unavailable, timed out or device disconnected.'));
      else resolve(stdout);
    });
  });
}

const packagePattern = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const blockedPackage = /(?:permissioncontroller|packageinstaller|systemui|settings|authenticator|password|keychain|bank|wallet|dev\.ally\.)/i;
export function validateOperations(value: unknown): PhoneOperation[] {
  if (!Array.isArray(value) || value.length > 8) throw Error('Provide at most 8 operations (empty means inspect only).');
  return value.map(item => {
    if (!item || typeof item !== 'object') throw Error('Invalid operation.');
    const integer = (v: unknown, max = 10000) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= max;
    switch (item.type) {
      case 'tap':
        if (integer(item.x) && integer(item.y)) return { type: 'tap', x: item.x, y: item.y };
        break;
      case 'swipe':
        if ([item.x, item.y, item.endX, item.endY].every(v => integer(v)) && integer(item.durationMs, 2000) && item.durationMs >= 100)
          return { type: 'swipe', x: item.x, y: item.y, endX: item.endX, endY: item.endY, durationMs: item.durationMs };
        break;
      case 'key': if (item.key === 'home' || item.key === 'back') return { type: 'key', key: item.key }; break;
      case 'text':
        // Android's input tool is not a Unicode IME. No remote shell metacharacters or % substitutions.
        if (typeof item.text === 'string' && /^[A-Za-z0-9 .,\@_+:\-]{1,200}$/.test(item.text)) return { type: 'text', text: item.text };
        break;
      case 'open_app':
        if (typeof item.packageName === 'string' && item.packageName.length <= 200 && packagePattern.test(item.packageName) && !blockedPackage.test(item.packageName)) return { type: 'open_app', packageName: item.packageName };
        break;
    }
    throw Error('Unsupported operation or unsafe parameters. Text supports 1–200 basic Latin characters; sensitive apps are excluded.');
  });
}

/** Fail closed on known sensitive surfaces. This is a development adapter, not an accessibility service. */
export function inspectUi(xml: string): string {
  if (!xml.includes('<hierarchy') || !xml.includes('</hierarchy>') || xml.length > 1_000_000) throw Error('Cannot inspect this screen.');
  const labels = [...xml.matchAll(/(?:text|content-desc|resource-id)="([^"]*)"/g)].map(m => m[1].replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_all, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)))).join('\n');
  if (/password="true"/i.test(xml) || /(?:password|passcode|one.time|verification code|security code|unlock|biometric|sign.in|log.in|credit card|payment|purchase|checkout|send money)/i.test(labels)) throw Error('Sensitive screen: continue manually on the phone.');
  const packages = [...xml.matchAll(/\bpackage="([^"]*)"/g)].map(m => m[1]);
  // System status/navigation bars occur on ordinary screens. Other SystemUI surfaces are not controllable.
  if (packages.some(p => p !== 'com.android.systemui' && blockedPackage.test(p))) throw Error('Protected app: continue manually on the phone.');
  const appNodes = packages.filter(p => p && p !== 'com.android.systemui');
  if (!appNodes.length) throw Error('System or lock screen: continue manually on the phone.');
  return xml.replace(/<node\b[^>]*package="com\.android\.systemui"[^>]*>/g, node => node.replace(/(text|content-desc)="[^"]*"/g, '$1=""'));
}

export class AdbPhone {
  constructor(readonly run: AdbRun = createAdbRun()) {}
  private target(serial: string) {
    if (!/^[A-Za-z0-9_.:\-]{4,180}$/.test(serial) || serial.startsWith('-')) throw Error('Invalid explicit ADB serial.');
    return ['-s', serial];
  }
  async list() {
    const output = (await this.run(['devices', '-l'])).toString();
    return output.split(/\r?\n/).flatMap(line => {
      const m = /^(\S+)\s+device\s+(.*)$/.exec(line);
      return m ? [{ serial: m[1], model: /model:(\S+)/.exec(m[2])?.[1] || 'Android', transport: 'authorized-adb' }] : [];
    });
  }
  async identity(serial: string, signal?: AbortSignal) {
    const id = (await this.run([...this.target(serial), 'exec-out', 'run-as', 'dev.ally.phone', 'cat', 'files/phone-control-id'], signal)).toString().trim();
    if (!/^[\w-]{8,80}$/.test(id)) throw Error('Update the Ally phone app and enable Keep connected first.');
    return id;
  }
  async view(serial: string, signal?: AbortSignal): Promise<PhoneView> {
    const target = this.target(serial), file = `/data/local/tmp/ally-control-${randomUUID()}.xml`;
    let xml: string;
    try {
      await this.run([...target, 'shell', 'uiautomator', 'dump', file], signal);
      xml = (await this.run([...target, 'exec-out', 'cat', file], signal)).toString();
    } finally { await this.run([...target, 'shell', 'rm', '-f', file]).catch(() => {}); }
    const ui = inspectUi(xml);
    const bounds = [...xml.matchAll(/\bbounds="\[\d+,\d+\]\[(\d+),(\d+)\]"/g)];
    const width = Math.max(0, ...bounds.map(m => Number(m[1]))), height = Math.max(0, ...bounds.map(m => Number(m[2])));
    if (!width || !height || width > 10000 || height > 10000) throw Error('Cannot determine screen bounds.');
    // Content and geometry bind actions to the inspected screen, not the approval inbox.
    return { ui, revision: createHash('sha256').update(ui).digest('hex'), width, height };
  }
  async screenshot(serial: string, signal?: AbortSignal) {
    const data = await this.run([...this.target(serial), 'exec-out', 'screencap', '-p'], signal);
    if (data.length > 10_000_000 || !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error('Screenshot unavailable.');
    return data.toString('base64');
  }
  async perform(serial: string, operation: PhoneOperation, view: PhoneView, signal?: AbortSignal) {
    // Revalidate at the executor boundary too; no caller can bypass typed validation.
    validateOperations([operation]);
    const within = (x: number, y: number) => x < view.width && y < view.height;
    if ((operation.type === 'tap' || operation.type === 'swipe') && (!within(operation.x, operation.y) || (operation.type === 'swipe' && !within(operation.endX, operation.endY)))) throw Error('Coordinates outside the inspected screen.');
    if (operation.type === 'tap' || operation.type === 'swipe') {
      for (const match of view.ui.matchAll(/<node\b[^>]*>/g)) {
        const node = match[0], bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
        if (!bounds) continue;
        const hit = (x: number, y: number) => x >= +bounds[1] && x < +bounds[3] && y >= +bounds[2] && y < +bounds[4];
        const protectedNode = /package="com\.android\.systemui"/.test(node) || /(?:text|content-desc)="[^"]*\b(?:send|pay|buy|purchase|confirm|approve|allow|delete|remove|submit)\b/i.test(node);
        if (protectedNode && (hit(operation.x, operation.y) || (operation.type === 'swipe' && hit(operation.endX, operation.endY)))) throw Error('Protected control: complete this action manually on the phone.');
      }
    }
    let args: string[];
    switch (operation.type) {
      case 'tap': args = ['input', 'tap', `${operation.x}`, `${operation.y}`]; break;
      case 'swipe': args = ['input', 'swipe', `${operation.x}`, `${operation.y}`, `${operation.endX}`, `${operation.endY}`, `${operation.durationMs}`]; break;
      case 'text': args = ['input', 'text', operation.text.replaceAll(' ', '%s')]; break;
      case 'key': args = ['input', 'keyevent', operation.key === 'home' ? '3' : '4']; break;
      case 'open_app': args = ['monkey', '-p', operation.packageName, '-c', 'android.intent.category.LAUNCHER', '1']; break;
    }
    const result = (await this.run([...this.target(serial), 'shell', ...args], signal)).toString();
    if (/error|exception|aborted|not found/i.test(result)) throw Error('Android could not perform the operation.');
  }
}
