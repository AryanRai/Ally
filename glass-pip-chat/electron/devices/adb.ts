import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export type AdbRun = (args: string[], signal?: AbortSignal) => Promise<Buffer>;
export type PhoneOperation =
  | { type: 'tap'; x: number; y: number }
  | { type: 'swipe'; x: number; y: number; endX: number; endY: number; durationMs: number }
  | { type: 'text'; text: string }
  | { type: 'key'; key: 'back' | 'home' | 'recents' }
  | { type: 'open_app'; packageName: string };
export interface PhoneView { revision: string; width: number; height: number; ui: string }

export function adbBinary(): string {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
  const candidate = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  return existsSync(candidate) ? candidate : 'adb';
}
export function createAdbRun(): AdbRun {
  const binary = adbBinary();
  return (args, signal) => new Promise((resolve, reject) => {
    execFile(binary, args, { encoding: 'buffer', windowsHide: true, timeout: 15_000, maxBuffer: 12 * 1024 * 1024, signal }, (err, stdout) => {
      // Never expose subprocess stderr (it can contain UI or entered text).
      if (err) reject(new Error(signal?.aborted ? 'Phone action cancelled.' : 'ADB unavailable, timed out or device disconnected.'));
      else resolve(stdout);
    });
  });
}

const packagePattern = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const blockedPackage = /(?:permissioncontroller|packageinstaller|systemui|authenticator|password|keychain|bank|wallet|dev\.ally\.)/i;
/** ADB's input tool is basic Latin only; the on-device executor sets text through accessibility and accepts Unicode. */
export function validateOperations(value: unknown, options: { unicodeText?: boolean } = {}): PhoneOperation[] {
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
      case 'key': if (item.key === 'home' || item.key === 'back' || (options.unicodeText && item.key === 'recents')) return { type: 'key', key: item.key }; break;
      case 'text':
        // Android's input tool is not a Unicode IME. No remote shell metacharacters or % substitutions.
        if (typeof item.text === 'string' && /^[A-Za-z0-9 .,\@_+:\-]{1,200}$/.test(item.text)) return { type: 'text', text: item.text };
        if (options.unicodeText && typeof item.text === 'string' && /^[^\p{C}]{1,500}$/u.test(item.text)) return { type: 'text', text: item.text };
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
  // Ordinary screens are readable even when they mention sign-in, payment or unlock (a launcher with a
  // Wallet icon, WhatsApp's Payments entry). Credential entry stays manual: password fields are never
  // shown with their text, and typing into them or OTP/card fields is refused in assertOperationAllowed.
  const packages = [...xml.matchAll(/\bpackage="([^"]*)"/g)].map(m => m[1]);
  // Ally's own screens, widget and notch overlay can be inspected and used; only its decision
  // controls (approvals, permissions, answers to its own requests) are refused, in assertOperationAllowed.
  // System status/navigation bars occur on ordinary screens. Other SystemUI surfaces are not controllable.
  if (packages.some(p => p !== 'com.android.systemui' && !/^dev\.ally\./i.test(p) && blockedPackage.test(p))) throw Error('Protected app: continue manually on the phone.');
  const appNodes = packages.filter(p => p && p !== 'com.android.systemui');
  if (!appNodes.length) throw Error('System or lock screen: continue manually on the phone.');
  return xml.replace(/<node\b[^>]*package="com\.android\.systemui"[^>]*>/g, node => node.replace(/(text|content-desc)="[^"]*"/g, '$1=""'));
}

const SETTINGS_APP = /settings/i;
const TOGGLE = /(?:Switch|CheckBox|RadioButton|SeekBar|ToggleButton|CompoundButton|Slider)$/;
/**
 * Settings apps can be read, scrolled and navigated; changing anything there needs the user's yes first.
 * Returns what the operation would change, or undefined. Typing, toggles/sliders (or a row holding one)
 * and dialog buttons count as changes. Mirrors the phone's PhoneToolPolicy.settingsChange.
 */
export function settingsChange(operation: PhoneOperation, view: PhoneView): string | undefined {
  const nodes = [...view.ui.matchAll(/<node\b[^>]*>/g)].map(m => m[0]);
  const attr = (node: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(node)?.[1] ?? '';
  const app = nodes.map(n => attr(n, 'package')).find(p => p && p !== 'com.android.systemui' && !/^dev\.ally\./i.test(p));
  if (!app || !SETTINGS_APP.test(app)) return undefined;
  const label = (n: string) => [attr(n, 'text'), attr(n, 'content-desc')].find(Boolean);
  if (operation.type === 'text') { const focused = nodes.find(n => attr(n, 'focused') === 'true'); return `Type "${operation.text.slice(0, 80)}"${focused && label(focused) ? ` into “${label(focused)!.slice(0, 80)}”` : ''} in Settings`; }
  if (operation.type !== 'tap' && operation.type !== 'swipe') return undefined;
  const box = (n: string) => { const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(attr(n, 'bounds')); return m ? m.slice(1).map(Number) : undefined; };
  const area = (n: string) => { const b = box(n)!; return (b[2] - b[0]) * (b[3] - b[1]); };
  const under = nodes.filter(n => { const b = box(n); return b && attr(n, 'package') === app && operation.x >= b[0] && operation.x < b[2] && operation.y >= b[1] && operation.y < b[3]; });
  const smallest = (list: string[]) => list.sort((a, b) => area(a) - area(b))[0];
  const target = smallest(under.filter(n => attr(n, 'clickable') === 'true')) ?? smallest([...under]);
  if (!target) return undefined;
  const tb = box(target)!;
  const within = nodes.filter(n => { const b = box(n); return b && b[0] >= tb[0] && b[1] >= tb[1] && b[2] <= tb[2] && b[3] <= tb[3]; });
  const changes = operation.type === 'swipe' ? under.some(n => TOGGLE.test(attr(n, 'class')))
    : TOGGLE.test(attr(target, 'class')) || attr(target, 'class').endsWith('Button') || within.some(n => TOGGLE.test(attr(n, 'class')));
  if (!changes) return undefined;
  const name = label(target) ?? within.map(label).find(Boolean) ?? 'this control';
  return `${operation.type === 'swipe' ? 'Adjust' : 'Change'} “${name.slice(0, 80)}” in Settings`;
}

/** Shared by ADB and on-device control: content and geometry bind actions to the inspected screen. */
export function phoneViewFromXml(xml: string): PhoneView {
  const ui = inspectUi(xml);
  const bounds = [...xml.matchAll(/\bbounds="\[-?\d+,-?\d+\]\[(\d+),(\d+)\]"/g)];
  const width = Math.max(0, ...bounds.map(m => Number(m[1]))), height = Math.max(0, ...bounds.map(m => Number(m[2])));
  if (!width || !height || width > 10000 || height > 10000) throw Error('Cannot determine screen bounds.');
  return { ui, revision: createHash('sha256').update(ui).digest('hex'), width, height };
}

/** Decision controls in Ally's own UI: approving, refusing or answering what Ally asks the user. */
const ALLY_DECISION = /(?:text|content-desc|resource-id)="[^"]*\b(?:approv\w*|allow\w*|deny|denied|reject\w*|decline\w*|accept\w*|grant\w*|permit\w*|authori[sz]\w*|consent\w*|always|once|answer\w*|decision\w*|interaction\w*|yes|no|don't|dont|skip|choose|choice|option\w*)\b/i;
/** Ally's approval and question cards always show one of these; while any is visible, no Ally control is tapped. */
const ALLY_DECISION_SHOWN = /(?:text|content-desc)="[^"]*(?:your approval|approval needed|needs your answer|answer this request|continue on this phone|\bapproval\b|\bquestion\b|\bpermission)/i;

/** Paying, buying, transferring money, or granting an app or account access. */
const MONEY_OR_CONSENT = /(?:text|content-desc)="[^"]*\b(?:pay|pay now|buy|buy now|purchase|checkout|place order|send money|transfer|authori[sz]e|grant access)\b/i;
const CREDENTIAL_FIELD = /(?:text|content-desc|resource-id|hint)="[^"]*(?:password|passcode|\bpin\b|one.time|otp|verification code|security code|card number|cvv|cvc)/i;
/** Refuses coordinates off the inspected screen and taps on SystemUI or Send/Pay/Approve-style controls. */
export function assertOperationAllowed(operation: PhoneOperation, view: PhoneView) {
  const within = (x: number, y: number) => x < view.width && y < view.height;
  if ((operation.type === 'tap' || operation.type === 'swipe') && (!within(operation.x, operation.y) || (operation.type === 'swipe' && !within(operation.endX, operation.endY)))) throw Error('Coordinates outside the inspected screen.');
  // A decision on screen freezes all of Ally's own UI: its answer buttons can carry any label.
  const nodes = [...view.ui.matchAll(/<node\b[^>]*>/g)].map(m => m[0]);
  const allyDecisionShown = nodes.some(node => /package="dev\.ally\./i.test(node) && ALLY_DECISION_SHOWN.test(node));
  // Credentials stay manual: never type into a focused password, passcode, OTP or card field.
  if (operation.type === 'text' && nodes.some(node => /\bfocused="true"/.test(node) && (/password="true"/.test(node) || CREDENTIAL_FIELD.test(node)))) throw Error('Credential field: enter it manually on the phone.');
  if (operation.type === 'text' && allyDecisionShown) {
    // Typing goes to the focused field; refuse when that may be an Ally answer box.
    const focusKnown = nodes.some(node => /\bfocused="(?:true|false)"/.test(node));
    if (!focusKnown || nodes.some(node => /package="dev\.ally\./i.test(node) && /\bfocused="true"/.test(node))) throw Error('Protected control: answer Ally\'s own request on the phone yourself.');
  }
  if (operation.type === 'tap' || operation.type === 'swipe') {
    for (const match of view.ui.matchAll(/<node\b[^>]*>/g)) {
      const node = match[0], bounds = /bounds="\[(-?\d+),(-?\d+)\]\[(\d+),(\d+)\]"/.exec(node);
      if (!bounds) continue;
      const hit = (x: number, y: number) => x >= +bounds[1] && x < +bounds[3] && y >= +bounds[2] && y < +bounds[4];
      // SystemUI is protected where it can be touched; an empty, non-clickable frame (an idle volume dialog) is not.
      const systemUi = /package="com\.android\.systemui"/.test(node) && (/clickable="true"/.test(node) || /(?:text|content-desc)="[^"]+"/.test(node));
      // Money and consent stay manual; sending messages, deleting or removing items do not.
      const protectedNode = systemUi || MONEY_OR_CONSENT.test(node)
        // An agent must never decide Ally's own approvals, permissions or questions, whichever way.
        || (/package="dev\.ally\./i.test(node) && (allyDecisionShown || ALLY_DECISION.test(node)));
      if (protectedNode && (hit(operation.x, operation.y) || (operation.type === 'swipe' && hit(operation.endX, operation.endY)))) throw Error('Protected control: complete this action manually on the phone.');
    }
  }
}

export class AdbPhone {
  constructor(readonly run: AdbRun = createAdbRun()) {}
  private target(serial: string) {
    if (!/^[A-Za-z0-9_.:\-]{4,180}$/.test(serial) || serial.startsWith('-')) throw Error('Invalid explicit ADB serial.');
    return ['-s', serial];
  }
  async list(signal?:AbortSignal) {
    const output = (await (signal?this.run(['devices', '-l'],signal):this.run(['devices', '-l']))).toString();
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
    return phoneViewFromXml(xml);
  }
  async screenshot(serial: string, signal?: AbortSignal) {
    const data = await this.run([...this.target(serial), 'exec-out', 'screencap', '-p'], signal);
    if (data.length > 10_000_000 || !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error('Screenshot unavailable.');
    return data.toString('base64');
  }
  async perform(serial: string, operation: PhoneOperation, view: PhoneView, signal?: AbortSignal) {
    // Revalidate at the executor boundary too; no caller can bypass typed validation.
    validateOperations([operation]);
    assertOperationAllowed(operation, view);
    let args: string[];
    switch (operation.type) {
      case 'tap': args = ['input', 'tap', `${operation.x}`, `${operation.y}`]; break;
      case 'swipe': args = ['input', 'swipe', `${operation.x}`, `${operation.y}`, `${operation.endX}`, `${operation.endY}`, `${operation.durationMs}`]; break;
      case 'text': args = ['input', 'text', operation.text.replaceAll(' ', '%s')]; break;
      case 'key': args = ['input', 'keyevent', operation.key === 'home' ? '3' : operation.key === 'back' ? '4' : '187']; break;
      case 'open_app': args = ['monkey', '-p', operation.packageName, '-c', 'android.intent.category.LAUNCHER', '1']; break;
    }
    const result = (await this.run([...this.target(serial), 'shell', ...args], signal)).toString();
    if (/error|exception|aborted|not found/i.test(result)) throw Error('Android could not perform the operation.');
  }
}
