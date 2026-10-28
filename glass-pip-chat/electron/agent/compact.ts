import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { CodexRpc } from './codexRpc.js';
import { codexAccounts, useCodexProfile } from './codexAccounts.js';
import { interactiveCodexSession } from './codexMigration.js';
import { CodexChatUnownedError, CodexDesktopClient, CodexDesktopUnavailableError } from './codexDesktop.js';
import { childEnv, launcherFor, resolveAgentBinary } from './binaries.js';
import { claudeResumeLaunch } from './claudeResume.js';
import type { AgentProvider } from './types.js';

/** What actually happened. `compacted` is true only when the owner reported a finished compaction. */
export interface CompactOutcome {
  compacted: boolean;
  provider: AgentProvider;
  reason?: string;
  /** Context size before/after, as reported by the agent itself. Absent when it did not report one. */
  tokensBefore?: number;
  tokensAfter?: number;
  contextWindow?: number;
}

export interface CompactRequest { provider: AgentProvider; sessionId: string; cwd?: string; codexDesktop?: boolean }

const SESSION_ID = /^[\w-]{1,200}$/;
const compacting = new Set<string>();
export const isCompacting = (provider: AgentProvider, sessionId: string) => compacting.has(`${provider}:${sessionId}`);

/** Compacts a chat's real session through the process Ally uses to own it. Never forks or retries. */
export async function compactAgentSession(request: CompactRequest, deps: Partial<CompactDeps> = {}): Promise<CompactOutcome> {
  const { provider, sessionId } = request;
  if (!SESSION_ID.test(sessionId)) return { compacted: false, provider, reason: 'Invalid session.' };
  const key = `${provider}:${sessionId}`;
  if (compacting.has(key)) return { compacted: false, provider, reason: 'This chat is already compacting.' };
  compacting.add(key);
  try {
    const resolved = { ...codexDeps, ...claudeDeps, ...deps } as CompactDeps;
    return provider === 'codex' ? await compactCodex(request, resolved) : await compactClaude(request, resolved);
  } finally { compacting.delete(key); }
}

interface CompactDeps {
  desktopOwner: (sessionId: string) => Promise<string | undefined>;
  connectCodex: (accountId: string) => Promise<Pick<CodexRpc, 'request' | 'close'> & { onNotification?: (method: string, params: any) => void }>;
  mapSession: (rpc: any, sessionId: string) => Promise<string>;
  runClaude: (sessionId: string, cwd: string | undefined) => Promise<{ events: any[]; error?: string }>;
  sessionFile: (sessionId: string) => string | undefined;
  timeoutMs: number;
}

const codexDeps: Partial<CompactDeps> = {
  // A desktop-owned chat stays with Codex desktop: its follower API submits
  // turns only, and Ally must not resume that thread from another server.
  desktopOwner: async sessionId => {
    let client: CodexDesktopClient | undefined;
    try { client = await CodexDesktopClient.connect(); return await client.owner(sessionId); }
    catch (error) { if (error instanceof CodexChatUnownedError || error instanceof CodexDesktopUnavailableError) return undefined; throw error; }
    finally { client?.close(); }
  },
  connectCodex: async accountId => CodexRpc.connect(undefined, codexAccounts.home(accountId)),
  mapSession: (rpc, id) => interactiveCodexSession(rpc, id, {}),
  timeoutMs: 180_000,
};

async function compactCodex(request: CompactRequest, deps: CompactDeps): Promise<CompactOutcome> {
  const not = (reason: string): CompactOutcome => ({ compacted: false, provider: 'codex', reason });
  if (request.codexDesktop) {
    let owner: string | undefined;
    try { owner = await deps.desktopOwner(request.sessionId); }
    catch { return not('Ally could not check whether Codex desktop owns this chat. Nothing was compacted.'); }
    if (owner) return not('This chat is open in Codex desktop, which compacts it automatically. Ally does not compact desktop-owned chats.');
  }
  const accountId = codexAccounts.route(request.sessionId);
  const release = useCodexProfile(accountId);
  let rpc: Awaited<ReturnType<CompactDeps['connectCodex']>> | undefined;
  try {
    rpc = await deps.connectCodex(accountId);
    const threadId = accountId === 'default' ? await deps.mapSession(rpc, request.sessionId) : request.sessionId;
    try { await rpc.request('thread/resume', { threadId, excludeTurns: true }); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return not(/active writer/i.test(message) ? 'Another Codex window owns this chat. Nothing was compacted.' : `Codex could not open this chat: ${message}`);
    }
    let usage: any;
    const done = new Promise<CompactOutcome>((resolve) => {
      let compactionItem = false;
      const timer = setTimeout(() => resolve(not('Codex did not finish compacting in time. Check the chat in Ally before retrying.')), deps.timeoutMs);
      rpc!.onNotification = (method, p) => {
        if (p.threadId !== threadId) return;
        if (method === 'thread/tokenUsage/updated') usage = p.tokenUsage;
        if (method === 'item/completed' && p.item?.type === 'contextCompaction') compactionItem = true;
        if (method === 'turn/completed') {
          clearTimeout(timer);
          if (p.turn?.status === 'completed' && compactionItem) resolve({ compacted: true, provider: 'codex' });
          else resolve(not(p.turn?.error?.message || `Codex compaction ${p.turn?.status ?? 'failed'}.`));
        }
      };
    });
    await rpc.request('thread/compact/start', { threadId });
    const outcome = await done;
    if (outcome.compacted && usage) {
      const after = usage.last?.totalTokens;
      if (Number.isFinite(after) && after > 0) outcome.tokensAfter = after;
      if (Number.isFinite(usage.modelContextWindow)) outcome.contextWindow = usage.modelContextWindow;
    }
    return outcome;
  } catch (error) {
    return not(error instanceof Error ? error.message : String(error));
  } finally {
    if (rpc) { rpc.onNotification = undefined; rpc.close(); }
    release();
  }
}

const API_FAILURE = /^\s*(?:Failed to authenticate|API Error|Prompt is too long|Error:)/i;

const claudeDeps: Partial<CompactDeps> = {
  sessionFile: sessionId => {
    const root = path.join(os.homedir(), '.claude', 'projects');
    try {
      for (const dir of fs.readdirSync(root)) {
        const file = path.join(root, dir, `${sessionId}.jsonl`);
        if (fs.existsSync(file)) return file;
      }
    } catch { /* No Claude history. */ }
    return undefined;
  },
  runClaude: async (sessionId, cwd) => {
    const bin = await resolveAgentBinary('claude');
    if (!bin) return { events: [], error: 'Claude Code CLI not found.' };
    const launcher = launcherFor(bin);
    // The prompt goes through stdin; arguments are fixed apart from the validated id.
    const args = ['-p', '--resume', sessionId, '--output-format', 'stream-json', '--verbose'];
    const child = spawn(launcher.command, [...launcher.prefixArgs, ...args], {
      cwd: claudeResumeLaunch(cwd && fs.existsSync(cwd) ? cwd : os.homedir(), sessionId).cwd,
      env: childEnv(), shell: launcher.shell, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stderr?.on('data', () => {});
    child.stdin?.end('/compact');
    const events: any[] = [];
    readline.createInterface({ input: child.stdout! }).on('line', line => { try { events.push(JSON.parse(line)); } catch { /* not JSON */ } });
    const timer = setTimeout(() => child.kill(), 180_000);
    const code = await new Promise<number | null>(resolve => { child.on('close', resolve); child.on('error', () => resolve(-1)); });
    clearTimeout(timer);
    return { events, error: code === 0 ? undefined : `Claude Code exited with ${code}.` };
  },
};

async function compactClaude(request: CompactRequest, deps: CompactDeps): Promise<CompactOutcome> {
  const not = (reason: string): CompactOutcome => ({ compacted: false, provider: 'claude', reason });
  const file = deps.sessionFile(request.sessionId);
  if (!file) return not('Ally could not find this Claude session.');
  const before = fs.readFileSync(file);
  const { events, error } = await deps.runClaude(request.sessionId, request.cwd);
  const boundary = events.findIndex(e => e.type === 'system' && e.subtype === 'compact_boundary');
  const summary = boundary < 0 ? undefined : events.slice(boundary + 1).find(e => e.type === 'user' && !e.isReplay)?.message?.content;
  const summaryText = typeof summary === 'string' ? summary.replace(/^This session is being continued[^\n]*\n(?:[^\n]*\n)?\s*/, '') : '';
  const failed = error || boundary < 0 || events.some(e => e.type === 'result' && e.is_error) || !summaryText.trim() || API_FAILURE.test(summaryText);
  if (failed) {
    // Claude Code can record a "summary" that is only an API error. Undo exactly
    // what this run appended so the chat keeps its real history.
    const after = fs.readFileSync(file);
    if (after.length > before.length && after.subarray(0, before.length).equals(before)) fs.truncateSync(file, before.length);
    const apiError = API_FAILURE.test(summaryText) ? summaryText.split('\n')[0].slice(0, 160) : undefined;
    return not(apiError ? `Claude Code could not compact: ${apiError}` : error ?? 'Claude Code did not report a compaction.');
  }
  const meta = events[boundary].compact_metadata ?? {};
  return {
    compacted: true, provider: 'claude',
    ...(Number.isFinite(meta.pre_tokens) ? { tokensBefore: meta.pre_tokens } : {}),
    ...(Number.isFinite(meta.post_tokens) ? { tokensAfter: meta.post_tokens } : {}),
  };
}
