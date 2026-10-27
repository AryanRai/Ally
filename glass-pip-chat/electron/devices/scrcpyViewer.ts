import { spawn, type ChildProcess } from 'node:child_process';
import { statSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';

export interface ViewerRequest { requestId: string; deviceId: string; serial: string; chatId: string }
export interface ViewerGrant {
  id: string; deviceId: string; serial: string; chatId: string; expiresAt: number;
  scope: 'unfiltered-local-viewer';
}
export interface ViewerStatus {
  requestId: string; deviceId: string; chatId: string;
  state: 'authorizing' | 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
  reason?: string;
}
export interface ViewerDependencies {
  /** Only a main-process trusted local installation path. */
  executable(): string | undefined;
  identity(serial: string, signal: AbortSignal): Promise<string | undefined>;
  connection(deviceId: string): AbortSignal | undefined;
  session(chatId: string): AbortSignal | undefined;
  /** Use the real approval broker, never renderer-provided grant data. */
  authorize(request: Readonly<ViewerRequest>, signal: AbortSignal): Promise<ViewerGrant | undefined>;
  spawn?: (executable: string, args: string[]) => ChildProcess;
  now?: () => number;
}
interface Active {
  request: ViewerRequest; status: ViewerStatus; controller: AbortController;
  grant?: ViewerGrant; child?: ChildProcess; cleanup: (() => void)[];
  expiry?: ReturnType<typeof setTimeout>; force?: ReturnType<typeof setTimeout>;
}

/** Explicit approved candidate paths only: no downloads, shell or PATH probing. */
export function discoverScrcpy(candidates: readonly string[]): string | undefined {
  return candidates.find(candidate => {
    if (!isAbsolute(candidate) || !/^scrcpy(?:\.exe)?$/i.test(basename(candidate))) return false;
    try { return statSync(candidate).isFile(); } catch { return false; }
  });
}

/** Raw scrcpy cannot apply phoneControl's per-screen filtering. Require a separate viewer grant. */
export class ScrcpyViewer {
  private records = new Map<string, Active>();
  private devices = new Map<string, Active>();
  private closed = false;
  private now: () => number;
  constructor(private deps: ViewerDependencies) { this.now = deps.now ?? Date.now; }

  status(requestId: string, chatId: string): ViewerStatus | undefined {
    const a = this.records.get(requestId);
    return a?.request.chatId === chatId ? { ...a.status } : undefined;
  }
  async start(input: ViewerRequest): Promise<ViewerStatus> {
    if (this.closed) throw Error('Phone viewer is closed.');
    if (!input || !/^[\w-]{8,80}$/.test(input.requestId) || !validId(input.deviceId) || !validId(input.chatId) ||
        !/^[A-Za-z0-9_.:-]{4,180}$/.test(input.serial) || input.serial.startsWith('-'))
      throw Error('Select an explicit phone, ADB serial and chat.');
    const request = { requestId: input.requestId, deviceId: input.deviceId, serial: input.serial, chatId: input.chatId };
    const previous = this.records.get(request.requestId);
    if (previous) {
      if (JSON.stringify(previous.request) !== JSON.stringify(request)) throw Error('Viewer requestId already used.');
      return { ...previous.status };
    }
    if (this.records.size >= 200) throw Error('Phone viewer audit is full.');
    if (this.devices.has(request.deviceId) || [...this.devices.values()].some(a => a.request.serial === request.serial))
      throw Error('This phone already has a viewer request.');
    const connection = this.deps.connection(request.deviceId), session = this.deps.session(request.chatId);
    if (!connection || connection.aborted || !session || session.aborted) throw Error('Phone or chat session is disconnected.');
    const a: Active = { request, status: { requestId: request.requestId, deviceId: request.deviceId, chatId: request.chatId, state: 'authorizing' }, controller: new AbortController(), cleanup: [] };
    this.records.set(request.requestId, a); this.devices.set(request.deviceId, a);
    const bind = (signal: AbortSignal, reason: string) => {
      const stop = () => this.stopActive(a, reason);
      signal.addEventListener('abort', stop, { once: true });
      a.cleanup.push(() => signal.removeEventListener('abort', stop));
    };
    bind(connection, 'Phone disconnected.'); bind(session, 'Chat session ended.');
    // Bounds identity and approval even if a faulty injected adapter ignores cancellation.
    a.expiry = setTimeout(() => this.stopActive(a, 'Viewer request timed out.'), 150_000);
    const check = () => {
      if (a.controller.signal.aborted || this.closed) throw Error('Phone viewer cancelled.');
      if (connection.aborted || this.deps.connection(request.deviceId) !== connection || session.aborted || this.deps.session(request.chatId) !== session)
        throw Error('Phone or chat session changed.');
      if (a.grant && a.grant.expiresAt <= this.now()) throw Error('Viewer authorization expired.');
    };
    try {
      check();
      if (await cancellable(this.deps.identity(request.serial, a.controller.signal), a.controller.signal) !== request.deviceId)
        throw Error('ADB serial does not match the selected Ally phone.');
      check();
      const grant = await cancellable(this.deps.authorize(Object.freeze({ ...request }), a.controller.signal), a.controller.signal);
      check();
      if (!grant || grant.scope !== 'unfiltered-local-viewer' || !validId(grant.id) || grant.deviceId !== request.deviceId ||
          grant.serial !== request.serial || grant.chatId !== request.chatId || !Number.isFinite(grant.expiresAt) ||
          grant.expiresAt <= this.now() || grant.expiresAt > this.now() + 60 * 60_000)
        throw Error('Separate explicit local-viewer authorization is required.');
      a.grant = { ...grant };
      if (await cancellable(this.deps.identity(request.serial, a.controller.signal), a.controller.signal) !== request.deviceId)
        throw Error('ADB phone identity changed.');
      check();
      clearTimeout(a.expiry);
      a.expiry = setTimeout(() => this.stopActive(a, 'Viewer authorization expired.'), grant.expiresAt - this.now());
      const executable = this.deps.executable();
      if (!executable || !isAbsolute(executable) || !/^scrcpy(?:\.exe)?$/i.test(basename(executable)))
        throw Error('Configure an installed local scrcpy executable first.');
      a.status.state = 'starting';
      a.child = (this.deps.spawn ?? launch)(executable, [
        '--serial=' + request.serial, '--no-control', '--no-audio', '--no-clipboard-autosync', '--window-title=Ally phone viewer',
      ]);
      a.child.once('error', () => {
        a.status.reason = 'Phone viewer subprocess failed.';
        // A spawn failure has no PID; later process errors must not release a possibly live stream.
        if (!a.child?.pid) this.finish(a, 'failed'); else this.stopActive(a, a.status.reason);
      });
      a.child.once('exit', () => this.finish(a, a.status.state === 'failed' ? 'failed' : 'stopped'));
      a.child.once('spawn', () => {
        try { check(); a.status.state = 'running'; }
        catch { this.stopActive(a, a.status.reason ?? 'Phone or chat session changed.'); }
      });
      return { ...a.status };
    } catch {
      if (!a.controller.signal.aborted) {
        // Adapter exceptions may contain private subprocess output; return only a generic reason.
        a.status.reason = 'Viewer unavailable: check explicit consent, local installation and phone/session identity.';
        this.finish(a, 'failed');
      }
      return { ...a.status };
    }
  }
  stop(requestId: string, chatId: string): boolean {
    const a = this.records.get(requestId);
    if (!a || a.request.chatId !== chatId || ['stopped', 'failed'].includes(a.status.state)) return false;
    this.stopActive(a, 'Stopped by user.'); return true;
  }
  revoke(grantId: string, deviceId: string) {
    for (const a of this.devices.values()) if (a.grant?.id === grantId && a.request.deviceId === deviceId)
      this.stopActive(a, 'Viewer authorization revoked.');
  }
  close() {
    this.closed = true;
    for (const a of this.devices.values()) this.stopActive(a, 'Ally closed.');
  }
  private stopActive(a: Active, reason: string) {
    if (['stopped', 'failed'].includes(a.status.state)) return;
    a.status.reason = reason; a.controller.abort();
    if (!a.child) { this.finish(a, 'stopped'); return; }
    if (a.status.state === 'stopping') return;
    a.status.state = 'stopping';
    try { a.child.kill('SIGTERM'); } catch { /* Keep reserved until actual exit. */ }
    a.force = setTimeout(() => { try { a.child?.kill('SIGKILL'); } catch { /* Remain stopping. */ } }, 2000);
  }
  private finish(a: Active, state: 'stopped' | 'failed') {
    a.status.state = state;
    clearTimeout(a.expiry); clearTimeout(a.force);
    for (const clean of a.cleanup.splice(0)) clean();
    if (this.devices.get(a.request.deviceId) === a) this.devices.delete(a.request.deviceId);
  }
}
function validId(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(value); }
function launch(executable: string, args: string[]): ChildProcess {
  return spawn(executable, args, { shell: false, windowsHide: true, stdio: 'ignore' });
}
function cancellable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(Error('Viewer cancelled.')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    pending.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
