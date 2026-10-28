import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isWin, launcherFor, pickExecutable } from './binaries';

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function shim(kind: 'native' | 'legacy') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-cli-')); directories.push(dir);
  const target = kind === 'native' ? 'cli.exe' : 'cli.js';
  fs.writeFileSync(path.join(dir, target), 'fixture');
  const file = path.join(dir, 'claude.cmd');
  fs.writeFileSync(file, `IF EXIST "%dp0%\\node.exe" (\r\n SET "_prog=%dp0%\\node.exe"\r\n)\r\n"%_prog%" "%dp0%\\${target}" %*`);
  return { file, target: path.join(dir, target) };
}

describe.skipIf(!isWin)('Windows CLI launch resolution', () => {
  it('prefers a native npm CLI over an earlier legacy shim on inherited PATH', () => {
    const legacy = shim('legacy'), native = shim('native');
    expect(pickExecutable([legacy.file, native.file])).toBe(native.file);
    expect(launcherFor(native.file)).toEqual({ command: native.target, prefixArgs: [], shell: false });
    expect(pickExecutable([legacy.file])).toBe(legacy.file);
  });
  it('skips optional node.exe and unwraps the JS CLI without a shell', () => {
    const legacy = shim('legacy');
    expect(launcherFor(legacy.file)).toEqual({ command: 'node', prefixArgs: [legacy.target], shell: false });
    fs.writeFileSync(path.join(path.dirname(legacy.file), 'node.exe'), 'fixture');
    expect(launcherFor(legacy.file).prefixArgs).toEqual([legacy.target]);
  });
  it('preserves explicit executable paths and refuses to invent a missing shim target', () => {
    expect(launcherFor('C:\\Custom CLI\\claude.exe')).toEqual({ command: 'C:\\Custom CLI\\claude.exe', prefixArgs: [], shell: false });
    const native = shim('native'); fs.unlinkSync(native.target);
    expect(launcherFor(native.file).shell).toBe(true);
  });
});
