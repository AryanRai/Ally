// Spawning agent turns and streaming their normalized events.
import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { childEnv, isWin, launcherFor, resolveAgentBinary } from './binaries.js';
import { ClaudeStreamParser, CodexStreamParser, StreamParser } from './parsers.js';
import type { AgentEvent, AgentRunOptions } from './types.js';

interface ActiveRun {
  child: ChildProcess;
  cleanup: () => void;
}

const runs = new Map<string, ActiveRun>();
let runCounter = 0;

/** Robot context goes through temp files so long text never hits the command line. */
function writeRobotFiles(runId: string, opts: AgentRunOptions): { files: string[]; promptFile?: string; mcpFile?: string } {
  if (!opts.robot) return { files: [] };
  const dir = path.join(os.tmpdir(), 'ally-agent');
  fs.mkdirSync(dir, { recursive: true });
  const promptFile = path.join(dir, `${runId}-prompt.md`);
  fs.writeFileSync(promptFile, opts.robot.instructions);
  const files = [promptFile];
  let mcpFile: string | undefined;
  if (opts.robot.mcpUrl) {
    mcpFile = path.join(dir, `${runId}-mcp.json`);
    fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { howyouseeme: { type: 'http', url: opts.robot.mcpUrl } } }));
    files.push(mcpFile);
  }
  return { files, promptFile, mcpFile };
}

function claudeArgs(opts: AgentRunOptions, robot: { promptFile?: string; mcpFile?: string }): string[] {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  const mode = opts.permission === 'full' ? 'bypassPermissions' : opts.permission === 'readonly' ? 'plan' : 'acceptEdits';
  args.push('--permission-mode', mode);
  if (opts.model && opts.model !== 'default') args.push('--model', opts.model);
  if (opts.sessionId) args.push('--resume', opts.sessionId);
  if (robot.promptFile) args.push('--append-system-prompt-file', robot.promptFile);
  if (robot.mcpFile) args.push('--mcp-config', robot.mcpFile);
  // Images can't ride on a plain-text prompt; send the turn as a stream-json user message
  if (opts.images?.length) args.push('--input-format', 'stream-json');
  return args;
}

function codexArgs(opts: AgentRunOptions): string[] {
  const args = ['exec'];
  if (opts.sessionId) args.push('resume');
  // `-i` takes several files, so it must be followed by another flag, not the `-` stdin marker
  for (const image of opts.images ?? []) args.push('-i', image);
  args.push('--json', '--skip-git-repo-check');
  if (opts.permission === 'full') {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  } else {
    // `-s` isn't accepted by `exec resume`, so set the sandbox via config instead
    const sandbox = opts.permission === 'readonly' ? 'read-only' : 'workspace-write';
    args.push('-c', `sandbox_mode="${sandbox}"`, '-c', 'approval_policy="never"');
  }
  if (opts.model && opts.model !== 'default') args.push('-m', opts.model);
  if (opts.robot) {
    // JSON string escapes are valid TOML basic-string escapes
    args.push('-c', `developer_instructions=${JSON.stringify(opts.robot.instructions)}`);
    if (opts.robot.mcpUrl) args.push('-c', `mcp_servers.howyouseeme.url=${JSON.stringify(opts.robot.mcpUrl)}`);
  }
  if (opts.sessionId) args.push(opts.sessionId);
  args.push('-'); // prompt comes from stdin
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
): Promise<string> {
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
  const robot = writeRobotFiles(runId, opts);
  const cleanup = () => robot.files.forEach(f => fs.rmSync(f, { force: true }));

  const args = opts.provider === 'claude' ? claudeArgs(opts, robot) : codexArgs(opts);
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

  const parser: StreamParser = opts.provider === 'claude' ? new ClaudeStreamParser() : new CodexStreamParser();
  let finished = false;
  const send = (ev: AgentEvent) => {
    if (ev.kind === 'done') {
      if (finished) return;
      finished = true;
    }
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
  for (const id of [...runs.keys()]) stopAgentRun(id);
}
