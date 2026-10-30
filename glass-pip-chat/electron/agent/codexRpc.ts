import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import { codexProfileEnvironment } from './codexAccounts.js';

export class CodexRpcError extends Error {
  constructor(message: string, readonly code: number, readonly data?: unknown) { super(message); }
}
import { childEnv, launcherFor, resolveAgentBinary } from './binaries.js';

/** Prefer the native sandbox when supported; Codex retains managed-policy and
 * legacy fallback selection. This never changes a turn's permissions/approvals. */
export const codexSandboxStartupArgs = (platform = process.platform): string[] =>
  platform === 'win32' ? ['-c', 'features.prefer_mxc=true'] : [];

/** A private stdio connection. Browsing uses read/list only; each turn owns its own server. */
export class CodexRpc {
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private closed = false;
  private lines: readline.Interface;
  private constructor(readonly child: ChildProcess) {
    const lines = this.lines = readline.createInterface({ input: child.stdout! });
    lines.on('line', line => {
      let msg: any;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.method) {
        if (msg.id != null) {
          const handler = this.onRequest;
          if (!handler) this.send({ id: msg.id, error: { code: -32601, message: `No interactive client for ${msg.method}` } });
          else void Promise.resolve().then(() => handler(msg.method, msg.params ?? {}, msg.id)).then(
            result => this.send({ id: msg.id, result }),
            error => this.send({ id: msg.id, error: { code: -32603, message: error instanceof Error ? error.message : 'Interaction unavailable' } }),
          );
        } else this.onNotification?.(msg.method, msg.params ?? {});
      } else {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(msg.id);
        if (msg.error) pending.reject(new CodexRpcError(msg.error.message, msg.error.code, msg.error.data));
        else pending.resolve(msg.result);
      }
    });
    child.stderr?.on('data', () => {}); // Diagnostic logs may contain private tool data.
    child.on('error', error => this.fail(error));
    child.on('close', code => { lines.close(); this.fail(new Error(`Codex app-server closed (${code ?? 'signal'})`)); });
    child.stdin?.on('error', error => this.fail(error));
  }
  onNotification?: (method: string, params: any) => void;
  onRequest?: (method: string, params: any, id: string | number) => Promise<unknown>;
  onClose?: (error: Error) => void;

  static async connect(binary?: string, codexHome?: string): Promise<CodexRpc> {
    const bin = await resolveAgentBinary('codex', binary);
    if (!bin) throw new Error('Codex CLI not found. Install Codex or set its executable in Settings.');
    const launcher = launcherFor(bin);
    if (launcher.shell) throw new Error('Set the Codex executable path in Settings; app-server requires a direct executable.');
    const rpc = new CodexRpc(spawn(launcher.command, [...launcher.prefixArgs, 'app-server', ...codexSandboxStartupArgs(), ...(codexHome ? ['-c', 'cli_auth_credentials_store="file"'] : [])], {
      env: codexHome ? codexProfileEnvironment(childEnv(), codexHome) : childEnv(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    }));
    try {
      await rpc.request('initialize', { clientInfo: { name: 'ally', title: 'Ally', version: '1.0.0' }, capabilities: { experimentalApi: true, mcpServerOpenaiFormElicitation: true } });
      rpc.send({ method: 'initialized', params: {} });
      return rpc;
    } catch (error) { rpc.close(); throw error; }
  }

  private send(message: unknown) { if (!this.closed) this.child.stdin!.write(JSON.stringify(message) + '\n'); }
  request(method: string, params: unknown, timeoutMs = 30000): Promise<any> {
    if (this.closed) return Promise.reject(new Error('Codex connection is closed'));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex ${method} timed out`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  private fail(error: Error) {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear();
    this.onClose?.(error);
  }
  close() {
    this.fail(new Error('Codex connection closed'));
    // MCP descendants can inherit stdio on Windows; release our private pipe
    // readers even if those descendants outlive the app-server process.
    this.lines.close();
    this.child.stdout?.destroy();
    this.child.stderr?.destroy();
    this.child.stdin?.end();
    this.child.kill();
  }
}
