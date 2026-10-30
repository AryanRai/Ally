import { describe, it, expect, vi } from 'vitest';
import { AdbPhone, assertOperationAllowed, inspectUi, validateOperations, type AdbRun } from './adb';

const xml = '<hierarchy><node package="com.example.notes" password="false" bounds="[0,0][1080,2400]" text="Notes" /></hierarchy>';
describe('bounded ADB adapter', () => {
  it('lets Ally screens, its widget and overlay be inspected, but never Android permission screens',()=>{
    expect(inspectUi(xml.replace('com.example.notes','dev.ally.phone'))).toContain('Notes');
    const widget = '<hierarchy><node package="com.google.android.apps.nexuslauncher" bounds="[0,0][1080,2400]"><node package="dev.ally.phone" text="Agent Monitor" bounds="[100,100][500,300]" /></node></hierarchy>';
    expect(inspectUi(widget)).toContain('Agent Monitor');
    expect(()=>inspectUi(xml.replace('com.example.notes','com.android.permissioncontroller'))).toThrow('Protected app');
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
    // Other apps and system keys stay usable meanwhile.
    expect(() => assertOperationAllowed({ type: 'tap', x: 900, y: 2200 }, view(launcher + monitor + card))).not.toThrow();
    expect(() => assertOperationAllowed({ type: 'key', key: 'home' }, view(launcher + card))).not.toThrow();
  });
  it('rejects remote-shell injection, substitutions, invalid packages and arbitrary keys', () => {
    for (const text of ['hello;reboot', '$(id)', '`id`', 'a%sb', 'a\nb', '你好', '*', 'x&y']) expect(() => validateOperations([{ type: 'text', text }])).toThrow();
    for (const op of [{ type: 'open_app', packageName: 'com.foo;reboot' }, { type: 'open_app', packageName: 'com.android.settings' }, { type: 'key', key: 'enter' }, { type: 'tap', x: -1, y: 2 }, { type: 'swipe', x: 0, y: 0, endX: 1, endY: 1, durationMs: 9999 }]) expect(() => validateOperations([op])).toThrow();
  });
  it('targets one serial, encodes text spaces and never invokes a host shell', async () => {
    const run = vi.fn<AdbRun>(async () => Buffer.from('')); const adb = new AdbPhone(run);
    await adb.perform('usb-1234', { type: 'text', text: 'hello world' }, { ui: xml, revision: 'r', width: 1080, height: 2400 });
    expect(run.mock.calls[0][0]).toEqual(['-s', 'usb-1234', 'shell', 'input', 'text', 'hello%sworld']);
    await expect(adb.identity('-unsafe')).rejects.toThrow();
  });
  it('refuses sensitive, locked, malformed and security screens', () => {
    expect(inspectUi(xml)).toContain('Notes');
    for (const sample of [xml.replace('password="false"', 'password="true"'), xml.replace('Notes', 'Verification code'), xml.replace('com.example.notes', 'com.android.permissioncontroller'), xml.replace('com.example.notes', 'com.android.systemui'), '<xml/>']) expect(() => inspectUi(sample)).toThrow();
  });
  it('refuses send/approval buttons and coordinates outside the screen', async () => {
    const run = vi.fn(async () => Buffer.from('')); const adb = new AdbPhone(run);
    const view = { ui: xml.replace('Notes', 'Send'), revision: 'r', width: 1080, height: 2400 };
    await expect(adb.perform('usb-1234', { type: 'tap', x: 5, y: 5 }, view)).rejects.toThrow('Protected control');
    await expect(adb.perform('usb-1234', { type: 'tap', x: 1080, y: 5 }, view)).rejects.toThrow('outside');
    expect(run).not.toHaveBeenCalled();
  });
  it('cleans hierarchy temp files even when inspection fails, and validates PNG data', async () => {
    const run = vi.fn(async (args: string[]) => Buffer.from(args.includes('cat') ? '<bad/>' : ''));
    const adb = new AdbPhone(run);
    await expect(adb.view('usb-1234')).rejects.toThrow();
    expect(run.mock.calls.at(-1)![0]).toEqual(expect.arrayContaining(['rm', '-f']));
    await expect(adb.screenshot('usb-1234')).rejects.toThrow('Screenshot unavailable');
  });
});
