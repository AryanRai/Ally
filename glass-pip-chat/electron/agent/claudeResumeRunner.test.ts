import fs from 'node:fs';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { startAgentRun, stopAllAgentRuns } from './runner';
import { claudeResumeLaunch } from './claudeResume';

vi.mock('node:child_process', () => {
  const mock = { spawn: vi.fn(), execFile: vi.fn(), execFileSync: vi.fn(), execSync: vi.fn() };
  return { ...mock, default: mock };
});
vi.mock('./binaries.js', () => ({ isWin: false, childEnv: () => ({}), resolveAgentBinary: async () => 'fake-claude', launcherFor: () => ({ command: 'fake-claude', prefixArgs: [], shell: false }) }));
vi.mock('./runningSessions.js', () => ({ trackRunningSession: vi.fn(), finishRunningSession: vi.fn() }));
vi.mock('./claudeResume.js', () => ({ claudeResumeLaunch: vi.fn() }));
vi.mock('../chatsMcp/registry.js', () => ({ allyChatsMcpServers: () => ({}) }));
afterEach(() => { stopAllAgentRuns(); vi.clearAllMocks(); });

it('launches in the original project, retaining UUID, permission, working folder context and prompt', async () => {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  vi.mocked(spawn).mockReturnValue(child as never);
  vi.mocked(claudeResumeLaunch).mockReturnValue({ cwd: os.tmpdir(), context: 'Work from the requested subfolder.' });
  const id = '60ce8fdb-d410-4e20-8e53-6a80107d3625';
  await startAgentRun({ provider: 'claude', cwd: process.cwd(), sessionId: id, permission: 'readonly', prompt: 'original unsent message', robot: { instructions: 'Keep the robot instructions.' } }, vi.fn());
  const [, args, options] = vi.mocked(spawn).mock.calls[0];
  expect(options).toMatchObject({ cwd: os.tmpdir(), shell: false });
  expect(args).toContain('--resume'); expect(args![args!.indexOf('--resume') + 1]).toBe(id);
  expect(args![args!.indexOf('--permission-mode') + 1]).toBe('plan');
  expect(args).not.toContain('--fork-session');
  const context = fs.readFileSync(args![args!.indexOf('--append-system-prompt-file') + 1], 'utf8');
  expect(context).toContain('Keep the robot instructions.'); expect(context).toContain('Work from the requested subfolder.');
  expect(child.stdin.read().toString()).toBe('original unsent message');
  child.emit('close', 0);
});
