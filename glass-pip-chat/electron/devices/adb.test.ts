import { describe, it, expect, vi } from 'vitest';
import { AdbPhone, assertOperationAllowed, inspectUi, phoneViewFromXml, settingsChange, validateOperations, type AdbRun } from './adb';

const xml = '<hierarchy><node package="com.example.notes" password="false" bounds="[0,0][1080,2400]" text="Notes" /></hierarchy>';
describe('bounded ADB adapter', () => {
  it('lets Ally screens, its widget and overlay be inspected, but never Android permission screens',()=>{
    expect(inspectUi(xml.replace('com.example.notes','dev.ally.phone'))).toContain('Notes');
    const widget = '<hierarchy><node package="com.google.android.apps.nexuslauncher" bounds="[0,0][1080,2400]"><node package="dev.ally.phone" text="Agent Monitor" bounds="[100,100][500,300]" /></node></hierarchy>';
    expect(inspectUi(widget)).toContain('Agent Monitor');
    expect(()=>inspectUi(xml.replace('com.example.notes','com.android.permissioncontroller'))).toThrow('Protected app');
    // Text that mentions unlock, payment or sign-in no longer hides a screen, in Ally or any other app.
    const allyReply = xml.replace('com.example.notes','dev.ally.phone').replace('Notes','Please unlock it, then sign in to pay');
    expect(inspectUi(allyReply)).toContain('Please unlock it');
    expect(inspectUi(xml.replace('Notes','Wallet · Payments · Sign in'))).toContain('Payments');
    expect(inspectUi(xml.replace('password="false"','password="true"'))).toContain('Notes');
  });
  it('never lets an agent decide Ally\x27s own approvals or questions, whatever the buttons say',()=>{
    const view = (nodes: string) => ({ ui: `<hierarchy>${nodes}</hierarchy>`, revision: 'r', width: 1080, height: 2400 });
    const launcher = '<node package="com.google.android.apps.nexuslauncher" text="Home" bounds="[0,0][1080,2400]" />';
    const monitor = '<node package="dev.ally.phone" text="Agent Monitor" bounds="[100,100][500,300]" />';
    // Ordinary Ally controls are usable.
    expect(() => assertOperationAllowed({ type: 'tap', x: 200, y: 200 }, view(launcher + monitor))).not.toThrow();
    // Decision words on an Ally control are refused, either way.
    for (const label of ['Approve', 'Allow', 'Deny', 'Always allow', 'Accept'])
      expect(() => assertOperationAllowed({ type: 'tap', x: 200, y: 200 }, view(launcher + monitor.replace('Agent Monitor', label)))).toThrow('Protected control');
    // While an Ally approval or question is shown, every Ally control is refused, including answer
    // buttons with arbitrary labels, and typing into a focused Ally field.
    const card = '<node package="dev.ally.phone" text="Ally needs your answer" bounds="[0,1500][1080,1600]" /><node package="dev.ally.phone" text="Use Chrome" focused="true" bounds="[0,1600][1080,1700]" />';
    for (const y of [1650, 200]) expect(() => assertOperationAllowed({ type: 'tap', x: 300, y }, view(launcher + monitor + card))).toThrow('Protected control');
    expect(() => assertOperationAllowed({ type: 'text', text: 'yes' }, view(launcher + card))).toThrow('Protected control');
    // An idle SystemUI frame (an empty volume dialog) over an app does not block taps; real SystemUI controls do.
    const frame = '<node package="com.android.systemui" text="" content-desc="" clickable="false" bounds="[618,136][1080,2400]" />';
    expect(() => assertOperationAllowed({ type: 'tap', x: 841, y: 1950 }, view(launcher + frame))).not.toThrow();
    expect(() => assertOperationAllowed({ type: 'tap', x: 841, y: 1950 }, view(launcher + frame.replace('clickable="false"', 'clickable="true"')))).toThrow('Protected control');
    // Other apps and system keys stay usable meanwhile.
    expect(() => assertOperationAllowed({ type: 'tap', x: 900, y: 2200 }, view(launcher + monitor + card))).not.toThrow();
    expect(() => assertOperationAllowed({ type: 'key', key: 'home' }, view(launcher + card))).not.toThrow();
  });
  it('rejects remote-shell injection, substitutions, invalid packages and arbitrary keys', () => {
    for (const text of ['hello;reboot', '$(id)', '`id`', 'a%sb', 'a\nb', '你好', '*', 'x&y']) expect(() => validateOperations([{ type: 'text', text }])).toThrow();
    for (const op of [{ type: 'open_app', packageName: 'com.foo;reboot' }, { type: 'open_app', packageName: 'com.android.permissioncontroller' }, { type: 'key', key: 'enter' }, { type: 'tap', x: -1, y: 2 }, { type: 'swipe', x: 0, y: 0, endX: 1, endY: 1, durationMs: 9999 }]) expect(() => validateOperations([op])).toThrow();
  });
  it('targets one serial, encodes text spaces and never invokes a host shell', async () => {
    const run = vi.fn<AdbRun>(async () => Buffer.from('')); const adb = new AdbPhone(run);
    await adb.perform('usb-1234', { type: 'text', text: 'hello world' }, { ui: xml, revision: 'r', width: 1080, height: 2400 });
    expect(run.mock.calls[0][0]).toEqual(['-s', 'usb-1234', 'shell', 'input', 'text', 'hello%sworld']);
    await expect(adb.identity('-unsafe')).rejects.toThrow();
  });
  it('refuses sensitive, locked, malformed and security screens', () => {
    expect(inspectUi(xml)).toContain('Notes');
    for (const sample of [xml.replace('com.example.notes', 'com.android.permissioncontroller'), xml.replace('com.example.notes', 'com.google.android.apps.walletnfcrel'), xml.replace('com.example.notes', 'com.android.systemui'), '<xml/>']) expect(() => inspectUi(sample)).toThrow();
  });
  it('refuses payment/consent buttons, credential typing and coordinates outside the screen', async () => {
    const run = vi.fn(async () => Buffer.from('')); const adb = new AdbPhone(run);
    const view = (ui: string) => ({ ui, revision: 'r', width: 1080, height: 2400 });
    for (const label of ['Pay now', 'Place order', 'Authorize']) await expect(adb.perform('usb-1234', { type: 'tap', x: 5, y: 5 }, view(xml.replace('Notes', label)))).rejects.toThrow('Protected control');
    await expect(adb.perform('usb-1234', { type: 'tap', x: 1080, y: 5 }, view(xml.replace('Notes', 'Send')))).rejects.toThrow('outside');
    const otp = view('<hierarchy><node package="com.example.notes" focused="true" text="" hint="Verification code" bounds="[0,0][1080,200]" /></hierarchy>');
    await expect(adb.perform('usb-1234', { type: 'text', text: '123456' }, otp)).rejects.toThrow('Credential field');
    expect(run).not.toHaveBeenCalled();
  });
  it('lets an approved session send, delete and remove things in ordinary apps', () => {
    for (const label of ['Send', 'Delete', 'Remove', 'Voice call', 'Confirm']) expect(() => assertOperationAllowed({ type: 'tap', x: 5, y: 5 }, { ui: xml.replace('Notes', label), revision: 'r', width: 1080, height: 2400 })).not.toThrow();
  });
  it('cleans hierarchy temp files even when inspection fails, and validates PNG data', async () => {
    const run = vi.fn(async (args: string[]) => Buffer.from(args.includes('cat') ? '<bad/>' : ''));
    const adb = new AdbPhone(run);
    await expect(adb.view('usb-1234')).rejects.toThrow();
    expect(run.mock.calls.at(-1)![0]).toEqual(expect.arrayContaining(['rm', '-f']));
    await expect(adb.screenshot('usb-1234')).rejects.toThrow('Screenshot unavailable');
  });
  it('lets Settings be browsed but asks before changing anything there', () => {
    const tree = '<?xml version="1.0"?><hierarchy>' +
      '<node text="" class="android.widget.FrameLayout" package="com.android.settings" content-desc="" clickable="false" focused="false" bounds="[0,0][1080,2400]">' +
      '<node text="" class="android.widget.LinearLayout" package="com.android.settings" content-desc="" clickable="true" focused="false" bounds="[0,200][1080,400]">' +
      '<node text="Wi-Fi" class="android.widget.TextView" package="com.android.settings" content-desc="" clickable="false" focused="false" bounds="[40,250][600,350]"/>' +
      '<node text="" class="android.widget.Switch" package="com.android.settings" content-desc="" clickable="false" focused="false" bounds="[900,250][1040,350]"/></node>' +
      '<node text="" class="android.widget.LinearLayout" package="com.android.settings" content-desc="" clickable="true" focused="false" bounds="[0,400][1080,600]">' +
      '<node text="Display" class="android.widget.TextView" package="com.android.settings" content-desc="" clickable="false" focused="false" bounds="[40,450][600,550]"/></node>' +
      '</node></hierarchy>';
    const view = phoneViewFromXml(tree);
    expect(validateOperations([{ type: 'open_app', packageName: 'com.android.settings' }])).toHaveLength(1);
    expect(settingsChange({ type: 'tap', x: 300, y: 300 }, view)).toBe('Change “Wi-Fi” in Settings');
    expect(settingsChange({ type: 'tap', x: 300, y: 500 }, view)).toBeUndefined();
    expect(settingsChange({ type: 'swipe', x: 500, y: 1500, endX: 500, endY: 700, durationMs: 300 }, view)).toBeUndefined();
    expect(settingsChange({ type: 'text', text: 'home' }, view)).toMatch(/^Type "home"/);
  });
});
