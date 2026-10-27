import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { TapAdvertiser } from './physicalTap.js';

/** Built-in WinRT helper, shipped with assets. No shell, downloads, radio settings or secrets. */
export const windowsTapAdvertiser: TapAdvertiser = {
  start(beacon, status) {
    if (process.platform !== 'win32') { queueMicrotask(() => status('BLE handoff requires the Windows advertiser. Use manual screen review.')); return () => {}; }
    const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const helper = fileURLToPath(new URL('../../assets/physical-tap-advertiser.ps1', import.meta.url));
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-File', helper], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stopped = false, reported = false;
    const fail = (reason: string) => { if (!stopped && !reported) { reported = true; status(reason); } };
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      try {
        const m = JSON.parse(line);
        if (m.type === 'started' && !stopped) { clearTimeout(timeout); status(); }
        if (m.type === 'error') fail(String(m.reason));
      } catch { /* no raw helper output exposed */ }
    });
    child.stderr.resume();
    child.once('error', () => fail('Windows BLE helper could not start. Use manual screen review.'));
    child.once('exit', () => { clearTimeout(timeout); fail('Windows BLE advertiser stopped. Use manual screen review.'); });
    child.stdin.on('error', () => {});
    child.stdin.write(beacon + '\n');
    const timeout = setTimeout(() => { fail('Windows BLE advertiser timed out. Use manual screen review.'); child.kill(); }, 8000);
    return () => { stopped = true; clearTimeout(timeout); lines.close(); child.stdin.end('\n'); const force = setTimeout(() => child.kill(), 1500); force.unref(); child.once('exit', () => clearTimeout(force)); };
  },
};
