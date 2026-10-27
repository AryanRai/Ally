import { randomUUID } from 'node:crypto';
import { forwardDelivery } from './forwardDelivery.js';
import { usageTool } from './usage.js';
import { readProviderUsage } from '../agent/providerUsage.js';
import { listRunningSessions } from '../agent/runningSessions.js';
import { messageQueue } from '../agent/messageQueue.js';
// ally-chats: an MCP server inside Ally that lets any agent find, read and
// message the user's Claude Code and Codex chats, and open one in Ally.
//
// Transport: Streamable HTTP on 127.0.0.1 only, behind an unguessable path token
// kept in Ally's user data. Requests from browsers (Origin header) and foreign
// Host names are refused, so web pages can't reach it.
import { app, ipcMain, type BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { childEnv, launcherFor, resolveAgentBinary } from '../agent/binaries.js';
import { listCodexChats, loadCodexChat } from '../agent/codexHistory.js';
import { startForwardedRun } from './forwardRun.js';
import { listAgentSessions, loadAgentSession } from '../agent/sessions.js';
import type { AgentConfig, AgentProvider } from '../agent/types.js';
import { handleRpc, type CallContext, type ToolDef, type ToolResult } from './protocol.js';
import { ChatIndex, type SearchHit } from './search.js';
import { chatTools, SERVER_INSTRUCTIONS, type SendResult } from './tools.js';
import { forwarding, serverUrl, setEndpoint, SERVER_NAME } from './registry.js';

export { allyChatsMcpServers, serverUrl, SERVER_NAME } from './registry.js';

const execFileAsync = promisify(execFile);
const DEFAULT_PORT = 18767;
/** 18765 belongs to the watch bridge; 18766 belongs to local speech. */
export function chatServerPort(port: unknown): number {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1024 && port <= 65515 && port !== 18765 && port !== 18766 ? port : DEFAULT_PORT;
}
const MAX_BODY = 1024 * 1024;

interface Persisted { token: string; port: number }
interface OpenRequest { provider: AgentProvider; sessionId: string; title: string; cwd?: string }

let state: { token: string; port: number; listening: boolean } | null = null;
const deviceTools = new Map<string, ToolDef>();
const openListeners = new Set<(req: OpenRequest) => void>();

// ---------------------------------------------------------------------------
// Public hooks (watch/phone integration, runner)
// ---------------------------------------------------------------------------

export interface DeviceToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** The handler must obtain the user's approval on the device before acting, and never auto-approve. */
  requiresConfirmation?: boolean;
  handler: (args: Record<string, unknown>, ctx: CallContext) => Promise<ToolResult>;
}

/** Watch/phone actions become tools on this server for every agent. */
export function registerDeviceTool(spec: DeviceToolSpec): () => void {
  if (!/^[a-z][a-z0-9_]{2,63}$/.test(spec.name)) throw new Error(`Invalid tool name ${spec.name}`);
  deviceTools.set(spec.name, {
    name: spec.name,
    description: spec.requiresConfirmation ? `${spec.description} (The user confirms on the device before it runs.)` : spec.description,
    inputSchema: spec.inputSchema,
    annotations: { readOnlyHint: false, title: spec.name },
    handler: (args, ctx) => spec.handler(args, ctx),
  });
  return () => deviceTools.delete(spec.name);
}

/** Fired when an agent asks Ally to open a chat (desktop does it; the watch may follow). */
export function onOpenChatRequest(cb: (req: OpenRequest) => void): () => void {
  openListeners.add(cb);
  return () => openListeners.delete(cb);
}

// ---------------------------------------------------------------------------
// Chat access
// ---------------------------------------------------------------------------

function agentConfig(): AgentConfig {
  try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'agent-config.json'), 'utf8')); }
  catch { return { defaultCwd: app.getPath('home'), permission: 'edit' }; }
}

const load = async (provider: AgentProvider, id: string) => {
  const snap = provider === 'codex' ? await loadCodexChat(id) : loadAgentSession(provider, id);
  return { messages: snap.messages, cwd: snap.cwd, title: snap.title };
};

const index = new ChatIndex({
  list: async (provider, limit) => (provider === 'codex' ? listCodexChats(limit) : listAgentSessions(provider, limit)),
  load,
});

/** Sidebar search (renderer IPC and the notch bridge): the index ally_search_chats uses, read-only. */
export async function searchChats(query: unknown, limit = 20): Promise<{ hits: SearchHit[]; pending: number }> {
  const q = typeof query === 'string' ? query.slice(0, 200) : '';
  if (!q.trim()) return { hits: [], pending: 0 };
  await index.refreshFor(1500);
  return { hits: index.search(q, { limit: Math.max(1, Math.min(30, Math.floor(limit) || 20)) }), pending: index.pending };
}

async function send(target: { provider: AgentProvider; id: string; cwd?: string; title: string }, message: string, opts: { wait: boolean; timeoutMs: number; caller?: string }): Promise<SendResult> {
  const key = `${target.provider}:${target.id}`;
  if (forwarding.has(key)) return { status: 'error', reply: '', error: 'that chat is still answering a forwarded message' };
  if (opts.caller && forwarding.has(opts.caller)) return { status: 'error', reply: '', error: 'a forwarded turn cannot forward again' };
  const from = opts.caller ? index.get(opts.caller.split(':')[0] as AgentProvider, opts.caller.slice(opts.caller.indexOf(':') + 1))?.title : undefined;
  const prompt = `[Forwarded by Ally at the user's request${from ? ` from the chat "${from}"` : ''}. Your reply is relayed back to the user; answer here, and ask them anything you need.]\n\n${message}`;
  const cfg = agentConfig();
  if ((await listRunningSessions()).some(s => s.provider === target.provider && s.id === target.id)) {
    const receiptId = randomUUID();
    messageQueue.enqueue(key, { id: receiptId, text: prompt, permission: cfg.permission });
    return { status: 'queued', reply: '', receiptId };
  }
  // Another request can arrive while native running-session discovery is pending.
  if (forwarding.has(key)) return { status: 'error', reply: '', error: 'that chat is still answering a forwarded message' };
  forwarding.add(key);
  return forwardDelivery(emit => startForwardedRun({ provider: target.provider, prompt, cwd: target.cwd || cfg.defaultCwd,
    sessionId: target.id, permission: cfg.permission, codexDesktop: cfg.codexDesktop === true },
    (_runId, event) => emit(event), target.provider === 'claude' ? cfg.claudePath : cfg.codexPath),
    opts.wait, opts.timeoutMs, () => forwarding.delete(key));
}

let getWin: () => BrowserWindow | null = () => null;
function open(target: { provider: AgentProvider; id: string; cwd?: string; title: string }): void {
  const req: OpenRequest = { provider: target.provider, sessionId: target.id, title: target.title, cwd: target.cwd };
  const win = getWin();
  if (win && !win.isDestroyed()) {
    if (!win.isVisible()) win.show();
    win.webContents.send('chats:open', req);
  }
  for (const cb of openListeners) { try { cb(req); } catch { /* listeners must not break tools */ } }
}

const tools = () => [...chatTools({ index, load, send, open }), usageTool(() => readProviderUsage(agentConfig().codexPath)), ...deviceTools.values()];

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

function persisted(): Persisted {
  const file = path.join(app.getPath('userData'), 'ally-chats-mcp.json');
  try {
    const p = JSON.parse(fs.readFileSync(file, 'utf8')) as Persisted;
    if (typeof p.token === 'string' && p.token.length >= 32) {
      const port = chatServerPort(p.port);
      if (port !== p.port) fs.writeFileSync(file, JSON.stringify({ ...p, port }, null, 2), { mode: 0o600 });
      return { ...p, port };
    }
  } catch { /* first run */ }
  const fresh = { token: randomBytes(24).toString('hex'), port: DEFAULT_PORT };
  fs.writeFileSync(file, JSON.stringify(fresh, null, 2), { mode: 0o600 });
  return fresh;
}

function savePort(port: number): void {
  const file = path.join(app.getPath('userData'), 'ally-chats-mcp.json');
  const p = persisted();
  if (p.port !== port) fs.writeFileSync(file, JSON.stringify({ ...p, port }, null, 2), { mode: 0o600 });
}

const sameToken = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Request gate, exported for tests: local host only, no browsers, right token. */
export function authorize(req: { method?: string; url?: string; headers: Record<string, string | string[] | undefined> }, token: string, port: number): { ok: true; caller?: string } | { ok: false; status: number } {
  if (req.headers.origin) return { ok: false, status: 403 };
  const host = String(req.headers.host ?? '');
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return { ok: false, status: 403 };
  const url = new URL(req.url ?? '/', `http://${host}`);
  const m = /^\/mcp\/([a-f0-9]+)\/?$/.exec(url.pathname);
  if (!m || !sameToken(m[1], token)) return { ok: false, status: 404 };
  const caller = url.searchParams.get('caller') ?? undefined;
  return { ok: true, caller: caller && /^(claude|codex):[\w.-]{1,200}$/.test(caller) ? caller : undefined };
}

function listen(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (e: NodeJS.ErrnoException) => { server.off('listening', onListening); reject(e); };
    const onListening = () => { server.off('error', onError); resolve(port); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function startServer(): Promise<void> {
  const saved = persisted();
  const server = http.createServer((req, res) => {
    const gate = authorize(req, saved.token, state?.port ?? saved.port);
    if ("status" in gate) { res.writeHead(gate.status).end(); return; }
    if (req.method === 'DELETE') { res.writeHead(200).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > MAX_BODY) req.destroy(); else chunks.push(c); });
    req.on('end', async () => {
      let body: any;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })); return; }
      const controller = new AbortController();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      res.once('close', disconnected);
      const ctx: CallContext = { caller: gate.caller, signal: controller.signal };
      const msgs = Array.isArray(body) ? body : [body];
      const replies = (await Promise.all(msgs.map(m => handleRpc(m, tools, ctx, SERVER_INSTRUCTIONS)))).filter(Boolean);
      res.removeListener('close', disconnected);
      if (controller.signal.aborted || res.destroyed) return;
      if (!replies.length) { res.writeHead(202).end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(Array.isArray(body) ? replies : replies[0]));
    });
  });
  server.requestTimeout = 15 * 60_000; // forwarded turns may take a while
  for (let port = saved.port; port < saved.port + 20; port++) {
    if (port === 18765 || port === 18766) continue;
    try {
      await listen(server, port);
      state = { token: saved.token, port, listening: true };
      setEndpoint({ token: saved.token, port });
      savePort(port);
      app.on('will-quit', () => server.close());
      // Warm the index so the first search is quick
      void index.refresh().catch(() => {});
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
    }
  }
  throw new Error('No free local port for the ally-chats MCP server');
}

// ---------------------------------------------------------------------------
// "Add to Claude Code & Codex" (only on the user's click)
// ---------------------------------------------------------------------------

async function run(bin: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  const launcher = launcherFor(bin);
  try {
    const { stdout, stderr } = await execFileAsync(launcher.command, [...launcher.prefixArgs, ...args], { env: childEnv(), windowsHide: true, shell: launcher.shell, timeout: 30_000 });
    return { ok: true, out: `${stdout}${stderr}` };
  } catch (e: any) {
    return { ok: false, out: `${e?.stdout ?? ''}${e?.stderr ?? ''}${e?.message ?? ''}` };
  }
}

export interface AppRegistration { claude: boolean | null; codex: boolean | null }

async function registrationStatus(): Promise<AppRegistration> {
  const cfg = agentConfig();
  const [claude, codex] = await Promise.all([resolveAgentBinary('claude', cfg.claudePath), resolveAgentBinary('codex', cfg.codexPath)]);
  const url = serverUrl();
  const check = async (bin: string | null, args: string[]) => {
    if (!bin) return null;
    const r = await run(bin, args);
    return r.ok && r.out.includes(url);
  };
  return {
    claude: await check(claude, ['mcp', 'get', SERVER_NAME]),
    codex: await check(codex, ['mcp', 'get', SERVER_NAME]),
  };
}

async function registerInApps(): Promise<{ claude: string; codex: string }> {
  const cfg = agentConfig();
  const url = serverUrl();
  if (!url) throw new Error('The ally-chats server is not running');
  const [claude, codex] = await Promise.all([resolveAgentBinary('claude', cfg.claudePath), resolveAgentBinary('codex', cfg.codexPath)]);
  const result = { claude: 'Claude Code not found', codex: 'Codex not found' };
  if (claude) {
    await run(claude, ['mcp', 'remove', '--scope', 'user', SERVER_NAME]);
    const r = await run(claude, ['mcp', 'add', '--scope', 'user', '--transport', 'http', SERVER_NAME, url]);
    result.claude = r.ok ? 'added' : r.out.trim().slice(0, 300);
  }
  if (codex) {
    await run(codex, ['mcp', 'remove', SERVER_NAME]);
    const r = await run(codex, ['mcp', 'add', SERVER_NAME, '--url', url]);
    result.codex = r.ok ? 'added' : r.out.trim().slice(0, 300);
  }
  return result;
}

async function unregisterFromApps(): Promise<void> {
  const cfg = agentConfig();
  const [claude, codex] = await Promise.all([resolveAgentBinary('claude', cfg.claudePath), resolveAgentBinary('codex', cfg.codexPath)]);
  if (claude) await run(claude, ['mcp', 'remove', '--scope', 'user', SERVER_NAME]);
  if (codex) await run(codex, ['mcp', 'remove', SERVER_NAME]);
}

export function registerChatsMcp(getWindow: () => BrowserWindow | null): void {
  getWin = getWindow;
  void app.whenReady().then(() => startServer()).catch(e => console.error('[ally-chats]', e));
  ipcMain.handle('chatsMcp:status', async () => ({
    running: !!state?.listening,
    port: state?.port,
    tools: tools().map(t => t.name),
    indexed: index.size,
  }));
  ipcMain.handle('chatsMcp:search', (_e, query: unknown) => searchChats(query));
  ipcMain.handle('chatsMcp:appStatus', () => registrationStatus());
  ipcMain.handle('chatsMcp:addToApps', () => registerInApps());
  ipcMain.handle('chatsMcp:removeFromApps', () => unregisterFromApps());
}
