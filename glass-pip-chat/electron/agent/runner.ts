// Spawning agent turns and streaming their normalized events.
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { childEnv, isWin, launcherFor, resolveAgentBinary } from './binaries.js';
import { ClaudeStreamParser, StreamParser } from './parsers.js';
import { runCodexTurn } from './codexRun.js';
import { runCodexDesktopTurn } from './codexDesktopRun.js';
import { trackRunningSession, finishRunningSession } from './runningSessions.js';
import { thumbnails } from './thumbs.js';
import { allyChatsMcpServers } from '../chatsMcp/registry.js';
import type { AgentEvent, AgentRobotContext, AgentRunOptions, AgentInteractionHandler } from './types.js';

interface ActiveRun {
  child: ChildProcess;
  cleanup: () => void;
}

const runs = new Map<string, ActiveRun>();
const codexRuns = new Map<string, { stop: () => void }>();
let runCounter = 0;

/** MCP servers Robot mode hands the agent, by server name: perception (HowYouSeeMe) and motion (DroidCore). */
export function robotMcpServers(robot?: AgentRobotContext): Record<string, string> {
  const servers: Record<string, string> = {};
  if (robot?.mcpUrl) servers.howyouseeme = robot.mcpUrl;
  if (robot?.motionMcpUrl) servers.droidcore = robot.motionMcpUrl;
  return servers;
}

/**
 * Robot context and MCP servers go through temp files so long text never hits the
 * command line. Every non-ephemeral run also gets Ally's ally_chats server.
 */
function writeRobotFiles(runId: string, opts: AgentRunOptions): { files: string[]; promptFile?: string; mcpFile?: string } {
  const servers = Object.entries({ ...robotMcpServers(opts.robot), ...allyChatsMcpServers(opts) });
  if (!opts.robot && !servers.length) return { files: [] };
  const dir = path.join(os.tmpdir(), 'ally-agent');
  fs.mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  let promptFile: string | undefined;
  if (opts.robot) {
    promptFile = path.join(dir, `${runId}-prompt.md`);
    fs.writeFileSync(promptFile, opts.robot.instructions);
    files.push(promptFile);
  }
  let mcpFile: string | undefined;
  if (servers.length) {
    mcpFile = path.join(dir, `${runId}-mcp.json`);
    const mcpServers = Object.fromEntries(servers.map(([name, url]) => [name, { type: 'http', url }]));
    fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers }));
    files.push(mcpFile);
  }
  return { files, promptFile, mcpFile };
}

function claudeArgs(opts: AgentRunOptions, robot: { promptFile?: string; mcpFile?: string }): string[] {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  if (opts.ephemeral) args.push('--no-session-persistence', '--tools', '');
  const mode = opts.permission === 'full' ? 'bypassPermissions' : opts.permission === 'readonly' ? 'plan' : 'acceptEdits';
  args.push('--permission-mode', mode);
  if (opts.model && opts.model !== 'default') args.push('--model', opts.model);
  if (opts.sessionId) args.push('--resume', opts.sessionId);
  if (robot.promptFile) args.push('--append-system-prompt-file', robot.promptFile);
  if (robot.mcpFile) args.push('--mcp-config', robot.mcpFile);
  // Non-interactive runs can't answer permission prompts: pre-allow Ally's own chat tools (read-only ones for read-only runs)
  if (Object.keys(allyChatsMcpServers(opts)).length) {
    args.push('--allowedTools', opts.permission === 'readonly'
      ? ['ally_list_chats', 'ally_search_chats', 'ally_read_chat'].map(t => `mcp__ally_chats__${t}`).join(',')
      : 'mcp__ally_chats');
  }
  // Images can't ride on a plain-text prompt; send the turn as a stream-json user message
  if (opts.images?.length) args.push('--input-format', 'stream-json');
  return args;
}

/** stdin payload: plain prompt, or a stream-json user message carrying images (Claude). */
function stdinPayload(opts: AgentRunOptions): string {
  if (opts.provider !== 'claude' || !opts.images?.length) return opts.prompt;
  const images = opts.images.map(file => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/png',
      data: fs.readFileSync(file).toString('base64'),
    },
  }));
  const message = { type: 'user', message: { role: 'user', content: [...images, { type: 'text', text: opts.prompt }] } };
  return JSON.stringify(message) + '\n';
}

// Only reached for .cmd shims we couldn't unwrap: flags, model names, UUIDs, temp paths
const SHELL_SAFE_ARG = /^[\w.:=\-"/\\@]+$/;

/**
 * Start an agent turn. Events stream to `emit`; resolves with the run id as soon
 * as the process is spawned so the caller can stop it.
 */
export async function startAgentRun(
  opts: AgentRunOptions,
  emit: (runId: string, ev: AgentEvent) => void,
  binOverride?: string,
  interact?: AgentInteractionHandler,
  interactionSurface: 'watch' | 'desktop' = 'watch',
): Promise<string> {
  let sessionId = opts.sessionId;
  let finished = false;
  const summary = () => sessionId && !opts.ephemeral ? { provider: opts.provider, id: sessionId, title: opts.prompt.slice(-80), cwd: opts.cwd, updatedAt: Date.now() } : undefined;
  const runId = await startTrackedRun(opts, (id, event) => {
    if (event.kind === 'session') sessionId = event.sessionId;
    if (event.kind === 'done') { finished = true; finishRunningSession(id); }
    else trackRunningSession(id, summary());
    emit(id, event);
  }, binOverride, interact, interactionSurface);
  if (!finished) trackRunningSession(runId, summary());
  return runId;
}

async function startTrackedRun(
  opts: AgentRunOptions,
  emit: (runId: string, ev: AgentEvent) => void,
  binOverride?: string,
  interact?: AgentInteractionHandler,
  interactionSurface: 'watch' | 'desktop' = 'watch',
): Promise<string> {
  if (opts.provider === 'codex' && opts.codexDesktop && opts.sessionId && !opts.ephemeral) {
    const runId = `run-${Date.now()}-${++runCounter}`;
    const run = runCodexDesktopTurn(opts, ev => {
      if (ev.kind === 'done') codexRuns.delete(runId);
      if (ev.kind === 'tool_end' && ev.images) ev = { ...ev, images: thumbnails(ev.images) };
      emit(runId, ev);
    }, interact);
    codexRuns.set(runId, run);
    return runId;
  }
  const bin = await resolveAgentBinary(opts.provider, binOverride);
  if (!bin) {
    throw new Error(opts.provider === 'claude'
      ? 'Claude Code CLI not found. Install it with `npm i -g @anthropic-ai/claude-code`, or set its path in Settings.'
      : 'Codex CLI not found. Install the Codex app or `npm i -g @openai/codex`, or set its path in Settings.');
  }
  if (!opts.cwd || !fs.existsSync(opts.cwd)) {
    throw new Error(`Working folder does not exist: ${opts.cwd || '(none)'}`);
  }

  const runId = `run-${Date.now()}-${++runCounter}`;
  if (opts.provider === 'codex') {
    const run = runCodexTurn(opts, ev => {
      if (ev.kind === 'done') codexRuns.delete(runId);
      if (ev.kind === 'tool_end' && ev.images) ev = { ...ev, images: thumbnails(ev.images) };
      emit(runId, ev);
    }, bin, interact, interactionSurface);
    codexRuns.set(runId, run);
    return runId;
  }
  const robot = writeRobotFiles(runId, opts);
  const cleanup = () => robot.files.forEach(f => fs.rmSync(f, { force: true }));

  const args = claudeArgs(opts, robot);
  const launcher = launcherFor(bin);
  if (launcher.shell && !args.every(a => SHELL_SAFE_ARG.test(a))) {
    cleanup();
    throw new Error(`Can't launch ${bin} safely; set the agent's .exe path in Settings`);
  }

  const child = spawn(launcher.command, [...launcher.prefixArgs, ...args], {
    cwd: opts.cwd,
    env: childEnv(),
    shell: launcher.shell,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  runs.set(runId, { child, cleanup });
  child.stdin?.end(stdinPayload(opts));

  const parser: StreamParser = new ClaudeStreamParser();
  let finished = false;
  const startedAt = Date.now();
  const send = (ev: AgentEvent) => {
    if (ev.kind === 'done') {
      if (finished) return;
      finished = true;
      ev = { ...ev, usage: { ...ev.usage, durationMs: ev.usage?.durationMs ?? Date.now() - startedAt } };
    }
    if (ev.kind === 'tool_end' && ev.images) ev = { ...ev, images: thumbnails(ev.images) };
    emit(runId, ev);
  };

  const rl = readline.createInterface({ input: child.stdout! });
  rl.on('line', line => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) return;
    let obj: unknown;
    try { obj = JSON.parse(trimmed); } catch { return; }
    for (const ev of parser.handle(obj)) send(ev);
  });

  let stderrTail = '';
  child.stderr?.on('data', (buf: Buffer) => {
    const text = buf.toString();
    stderrTail = (stderrTail + text).slice(-2000);
    send({ kind: 'stderr', text });
  });

  const finish = () => {
    runs.delete(runId);
    cleanup();
  };

  child.on('error', err => {
    finish();
    send({ kind: 'done', isError: true, error: err.message });
  });

  child.on('close', code => {
    finish();
    rl.close();
    if (code === 0 || code === null) {
      send({ kind: 'done', sessionId: parser.sessionId });
      return;
    }
    const error = /already has an active writer/.test(stderrTail)
      ? 'This thread is open in the Codex app. Close it there to continue it here.'
      : stderrTail.trim().split(/\r?\n/).slice(-4).join('\n') || `Agent exited with code ${code}`;
    send({ kind: 'done', sessionId: parser.sessionId, isError: true, error });
  });

  return runId;
}

export function stopAgentRun(runId: string): boolean {
  finishRunningSession(runId);
  const codex = codexRuns.get(runId);
  if (codex) { codex.stop(); return true; }
  const run = runs.get(runId);
  if (!run) return false;
  const pid = run.child.pid;
  if (isWin && pid) {
    // Kill the whole tree — the CLI spawns its own tool subprocesses
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  } else {
    run.child.kill('SIGTERM');
  }
  runs.delete(runId);
  run.cleanup();
  return true;
}

export function stopAllAgentRuns(): void {
  for (const [id, run] of codexRuns) { finishRunningSession(id); run.stop(); }
  for (const id of [...runs.keys()]) stopAgentRun(id);
}
