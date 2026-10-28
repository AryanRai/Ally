import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn as spawnProcess, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { childEnv, isWin, launcherFor, type Launcher } from './binaries.js';

/**
 * One CodeGraph MCP server per project folder, shared by every turn Ally runs there.
 * Codex and Claude otherwise start a separate CodeGraph (three processes, plus its own file
 * watcher) for each turn. Agents connect over local HTTP with a per-run secret in the path; the
 * shared server speaks stdio, so requests are re-numbered on the way in and back out, and the
 * server is set up once and that setup is replayed to each new connection.
 * A folder's server closes after a quiet period with no Ally turn using it, and starts again on
 * the next request.
 */

const IDLE_MS = 10 * 60_000, REQUEST_TIMEOUT_MS = 125_000, MAX_BODY = 4 * 1024 * 1024;
const PROTOCOL = '2025-06-18';

type Json = Record<string, any>;
interface Pending { resolve: (message: Json) => void; timer: ReturnType<typeof setTimeout> }
interface Folder { id: string; dir: string; child?: ChildProcess; ready?: Promise<Json>; pending: Map<number, Pending>; nextId: number; busy: number; lastUsed: number }

/** CodeGraph's npm command shim on PATH, launched without a shell. */
export function findCodegraph(env: NodeJS.ProcessEnv = process.env): Launcher | undefined {
  const names = isWin ? ['codegraph.cmd', 'codegraph.exe'] : ['codegraph'];
  for (const dir of (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      const file = path.join(dir, name);
      if (!fs.existsSync(file)) continue;
      const launcher = launcherFor(file);
      return launcher.shell ? undefined : launcher;
    }
  }
}

const folderId = (dir: string) => createHash('sha256').update(isWin ? dir.toLowerCase() : dir).digest('hex').slice(0, 24);
const rpcError = (id: unknown, message: string, code = -32603): Json => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export class CodegraphPool {
  private server?: http.Server;
  private port = 0;
  private readonly token = randomBytes(24).toString('hex');
  private readonly folders = new Map<string, Folder>();
  private reaper?: ReturnType<typeof setInterval>;

  constructor(private readonly launcher: Launcher, private readonly spawn: typeof spawnProcess = spawnProcess, private readonly now = Date.now, private readonly idleMs = IDLE_MS) {}

  async start(): Promise<void> {
    if (this.server) return;
    const server = http.createServer((req, res) => { void this.handle(req, res); });
    server.requestTimeout = REQUEST_TIMEOUT_MS + 5000;
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()); });
    this.port = (server.address() as { port: number }).port;
    this.server = server;
    this.reaper = setInterval(() => this.reap(), 60_000);
    this.reaper.unref?.();
  }

  /** The shared server's address for a folder, or undefined if the folder does not exist. */
  url(cwd: string | undefined): string | undefined {
    if (!this.server || !cwd) return;
    const dir = path.resolve(cwd);
    try { if (!fs.statSync(dir).isDirectory()) return; } catch { return; }
    const id = folderId(dir);
    if (!this.folders.has(id)) this.folders.set(id, { id, dir, pending: new Map(), nextId: 1, busy: 0, lastUsed: this.now() });
    return `http://127.0.0.1:${this.port}/codegraph/${this.token}/${id}`;
  }

  /** An Ally turn in this folder is running; its server is never closed meanwhile. */
  acquire(cwd: string | undefined): () => void {
    // Registers the folder too: a turn holds it before its config asks for the address.
    const folder = this.url(cwd) && cwd ? this.folders.get(folderId(path.resolve(cwd))) : undefined;
    if (!folder) return () => {};
    folder.busy++; folder.lastUsed = this.now();
    let released = false;
    return () => { if (released) return; released = true; folder.busy = Math.max(0, folder.busy - 1); folder.lastUsed = this.now(); };
  }

  /** Servers running now, for diagnostics and tests. */
  running(): string[] { return [...this.folders.values()].filter(f => f.child).map(f => f.dir); }

  reap(): void {
    for (const folder of this.folders.values()) {
      if (folder.child && !folder.busy && !folder.pending.size && this.now() - folder.lastUsed >= this.idleMs) this.close(folder);
    }
  }

  stop(): void {
    clearInterval(this.reaper);
    for (const folder of this.folders.values()) this.close(folder);
    this.server?.close(); this.server?.closeAllConnections?.(); this.server = undefined;
  }

  private close(folder: Folder) {
    const child = folder.child;
    folder.child = undefined; folder.ready = undefined;
    for (const [id, pending] of folder.pending) { clearTimeout(pending.timer); pending.resolve(rpcError(id, 'CodeGraph closed.')); }
    folder.pending.clear();
    if (child && child.exitCode === null) { child.stdin?.end(); child.kill(); }
  }

  /** Starts the folder's server once and sets it up; a crash or watchdog kill starts it again on the next request. */
  private ensure(folder: Folder): Promise<Json> {
    if (folder.ready) return folder.ready;
    const child = this.spawn(this.launcher.command, [...this.launcher.prefixArgs, 'serve', '--mcp', '--path', folder.dir], { cwd: folder.dir, env: childEnv(), windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    folder.child = child;
    const lines = readline.createInterface({ input: child.stdout! });
    lines.on('line', line => {
      let message: Json;
      try { message = JSON.parse(line); } catch { return; }
      if (message.method && message.id !== undefined) {
        // CodeGraph asking the client: answer for the folder; nothing else is supported.
        const reply = message.method === 'roots/list'
          ? { jsonrpc: '2.0', id: message.id, result: { roots: [{ uri: new URL(`file:///${folder.dir.replace(/\\/g, '/')}`).href, name: path.basename(folder.dir) }] } }
          : rpcError(message.id, 'Not supported by Ally\'s shared CodeGraph.', -32601);
        child.stdin?.write(JSON.stringify(reply) + '\n');
        return;
      }
      const pending = typeof message.id === 'number' ? folder.pending.get(message.id) : undefined;
      if (!pending) return; // notifications from the server are not relayed
      folder.pending.delete(message.id); clearTimeout(pending.timer); pending.resolve(message);
    });
    const gone = () => { if (folder.child === child) { folder.child = undefined; folder.ready = undefined; for (const [id, p] of folder.pending) { clearTimeout(p.timer); p.resolve(rpcError(id, 'CodeGraph restarted; try the call again.')); } folder.pending.clear(); } };
    child.on('exit', gone); child.on('error', gone);
    child.stdin?.on('error', () => {});
    folder.ready = this.call(folder, 'initialize', { protocolVersion: PROTOCOL, capabilities: { roots: {} }, clientInfo: { name: 'ally-shared-codegraph', version: '1.0.0' } }).then(message => {
      if (message.error) throw Error(message.error.message ?? 'CodeGraph did not start.');
      child.stdin?.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      return message.result as Json;
    });
    folder.ready.catch(() => { if (folder.child === child) this.close(folder); });
    return folder.ready;
  }

  private call(folder: Folder, method: string, params: unknown): Promise<Json> {
    const id = folder.nextId++;
    return new Promise(resolve => {
      const timer = setTimeout(() => { folder.pending.delete(id); resolve(rpcError(id, 'CodeGraph did not answer in time.')); }, REQUEST_TIMEOUT_MS);
      folder.pending.set(id, { resolve, timer });
      folder.child?.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const send = (status: number, body?: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'Cache-Control': 'no-store', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    const match = /^\/codegraph\/([0-9a-f]{48})\/([0-9a-f]{24})$/.exec(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    const folder = match && match[1] === this.token ? this.folders.get(match[2]) : undefined;
    // Agents only; a web page must never reach a local code index.
    if (!folder || req.headers.origin) { send(404, { error: 'Not found' }); req.resume(); return; }
    if (req.method === 'DELETE') { send(200); return; }
    if (req.method !== 'POST') { send(405, undefined, { Allow: 'POST, DELETE' }); req.resume(); return; }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) { send(413, rpcError(null, 'Request too large.', -32600)); return; } chunks.push(chunk); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { send(400, rpcError(null, 'Invalid JSON.', -32700)); return; }
    folder.lastUsed = this.now();
    const messages = (Array.isArray(body) ? body : [body]) as Json[];
    const replies: Json[] = [];
    let session: string | undefined;
    for (const message of messages) {
      if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') { replies.push(rpcError(message?.id, 'Invalid request.', -32600)); continue; }
      if (message.id === undefined || message.method === undefined) continue; // notifications and client replies
      try {
        const init = await this.ensure(folder);
        if (message.method === 'initialize') {
          session = randomBytes(16).toString('hex');
          // Requests are the same across recent versions; agree to the client's.
          const asked = message.params?.protocolVersion;
          replies.push({ jsonrpc: '2.0', id: message.id, result: { ...init, ...(typeof asked === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? { protocolVersion: asked } : {}) } });
          continue;
        }
        const answer = await this.call(folder, message.method, message.params);
        replies.push({ ...answer, id: message.id });
      } catch (error) { replies.push(rpcError(message.id, error instanceof Error ? error.message : 'CodeGraph is unavailable.')); }
      folder.lastUsed = this.now();
    }
    if (!replies.length) { send(202); return; }
    send(200, Array.isArray(body) ? replies : replies[0], session ? { 'Mcp-Session-Id': session } : {});
  }
}

let shared: CodegraphPool | undefined;
let starting: Promise<CodegraphPool | undefined> | undefined;
/** Ally's one pool, started on first use; undefined when CodeGraph is not installed. */
export function codegraphPool(): Promise<CodegraphPool | undefined> {
  if (shared) return Promise.resolve(shared);
  starting ??= (async () => {
    const launcher = findCodegraph();
    if (!launcher) return undefined;
    const pool = new CodegraphPool(launcher);
    await pool.start();
    shared = pool;
    return pool;
  })().catch(() => undefined).finally(() => { starting = undefined; });
  return starting;
}
export function stopCodegraphPool() { shared?.stop(); shared = undefined; }
/** The pool if it has started; turns started before then keep their usual CodeGraph. */
export function currentCodegraphPool(): CodegraphPool | undefined { return shared; }
