import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface CloudTunnelConfig { enabled: boolean; hostname: string; binary: string; tokenFile: string }

/** Own only Ally's connector. Existing cloudflared services and tunnels are independent. */
export function startCloudTunnel(config: CloudTunnelConfig, userData: string): (() => void) | undefined {
  if (!config.enabled) return;
  const tokenFile = path.resolve(userData, config.tokenFile);
  const relative = path.relative(userData, tokenFile);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(tokenFile) || !fs.existsSync(config.binary)) {
    console.error('Ally watch cloud connection: connector or private token file is missing');
    return;
  }
  let stopped = false;
  let child: ChildProcess | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  const launch = () => {
    if (stopped) return;
    // Do not inherit another tunnel's token, routing, debug logging, or configuration.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('TUNNEL_')));
    const started = Date.now();
    const connector = spawn(config.binary, ['tunnel', '--no-autoupdate', '--loglevel', 'warn', 'run', '--token-file', tokenFile],
      { env, windowsHide: true, stdio: 'ignore' });
    child = connector;
    let settled = false;
    const restart = () => {
      if (settled) return;
      settled = true;
      child = undefined;
      if (stopped) return;
      failures = Date.now() - started > 60000 ? 0 : failures + 1;
      console.warn('Ally watch cloud connector stopped; reconnecting');
      timer = setTimeout(launch, Math.min(30000, 2000 * 2 ** Math.min(failures, 4)));
    };
    connector.once('error', restart);
    connector.once('exit', restart);
  };
  launch();
  return () => { stopped = true; clearTimeout(timer); child?.kill(); child = undefined; };
}
