import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface WatchTransportConfig { serial: string; endpoint?: string; adbPath?: string }
type Run = (args: string[]) => Promise<string>;

/** Only discover the explicitly enrolled watch, never another paired Android device. */
export function watchEndpoints(services: string, serial: string): string[] {
  return [...new Set(services.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^(.+?)\s+_adb-tls-connect\._tcp\.?\s+(\S+)\s*$/);
    return match && match[1].startsWith(`adb-${serial}-`) ? [match[2]] : [];
  }))];
}

export async function reconcileWatch(config: WatchTransportConfig, port: number, run: Run): Promise<string> {
  const devices = await run(['devices']);
  const online = devices.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^(.+?)\s+device\s*$/);
    return match ? [match[1]] : [];
  });
  // Verify the hardware identity before touching any tunnel. A DHCP address can be reused.
  const isWatch = async (target: string) => (await run(['-s', target, 'shell', 'getprop', 'ro.serialno'])).trim() === config.serial;
  let target: string | undefined;
  for (const candidate of online) {
    try { if (await isWatch(candidate)) { target = candidate; break; } }
    catch { /* A different device must not prevent watch recovery. */ }
  }
  if (!target) {
    const discovered = watchEndpoints(await run(['mdns', 'services']), config.serial);
    const candidates = [...new Set([...discovered, ...(config.endpoint ? [config.endpoint] : [])])];
    for (const candidate of candidates) {
      try {
        if (devices.split(/\r?\n/).some(line => line.match(/^(.+?)\s+offline\s*$/)?.[1] === candidate)) {
          await run(['-s', candidate, 'reconnect']);
        }
        await run(['connect', candidate]);
        if (await isWatch(candidate)) { target = candidate; break; }
      } catch { /* An old discovery record can outlive its port. Try the next candidate. */ }
    }
  }
  if (!target) throw new Error('Waiting for the paired watch');
  const mapping = `tcp:${port}`;
  const reverse = await run(['-s', target, 'reverse', '--list']);
  if (!reverse.split(/\r?\n/).some(line => {
    const columns = line.trim().split(/\s+/);
    return columns[1] === mapping && columns[2] === mapping;
  })) await run(['-s', target, 'reverse', mapping, mapping]);
  return target;
}

export function startWatchTransport(config: WatchTransportConfig, port: number, saveEndpoint: (endpoint: string) => void) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '');
  const sdkAdb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  const adb = config.adbPath || (fs.existsSync(sdkAdb) ? sdkAdb : 'adb');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let state = 'reconnecting';
  const run: Run = args => new Promise((resolve, reject) => {
    if (controller.signal.aborted) { reject(new Error('Stopped')); return; }
    execFile(adb, args, { windowsHide: true, timeout: 6000, maxBuffer: 128 * 1024, signal: controller.signal }, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
  const tick = async () => {
    try {
      const endpoint = await reconcileWatch(config, port, run);
      if (controller.signal.aborted) return;
      if (endpoint !== config.endpoint) { config.endpoint = endpoint; saveEndpoint(endpoint); }
      failures = 0;
      if (state !== 'connected') console.log('Ally watch transport connected');
      state = 'connected';
    } catch {
      if (controller.signal.aborted) return;
      if (state === 'connected') console.log('Ally watch transport reconnecting');
      state = 'reconnecting'; failures++;
    }
    if (!controller.signal.aborted) timer = setTimeout(() => void tick(), failures ? Math.min(30000, 2000 * 2 ** Math.min(failures - 1, 4)) : 10000);
  };
  void tick();
  return { status: () => state, stop: () => { clearTimeout(timer); controller.abort(); } };
}
