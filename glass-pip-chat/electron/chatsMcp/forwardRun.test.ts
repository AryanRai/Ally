// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../agent/runner.js', () => ({ startAgentRun: vi.fn(async () => 'run') }));
import { startAgentRun } from '../agent/runner.js';
import { interactions } from '../devices/interactions.js';
import { startForwardedRun } from './forwardRun.js';

afterEach(() => { interactions.closeAll(); vi.clearAllMocks(); });
it('routes a forwarded native decision to the destination inbox without downgrading full access', async () => {
  const opts = { provider: 'codex' as const, sessionId: 'destination-1234', prompt: 'Fix upload', cwd: 'C:/project', permission: 'full' as const, codexDesktop: true };
  await startForwardedRun(opts, vi.fn(), 'codex');
  const [actual, , , interact, surface] = vi.mocked(startAgentRun).mock.calls[0];
  expect(actual).toBe(opts); expect(actual.permission).toBe('full'); expect(surface).toBe('desktop');
  const controller = new AbortController();
  const response = interact!('item/commandExecution/requestApproval', { threadId: opts.sessionId, command: 'inspect upload', availableDecisions: ['accept', 'decline'] }, controller.signal);
  const card = interactions.list()[0];
  expect(card.chatId).toBe('codex:destination-1234');
  let answered = false; void response.then(() => { answered = true; });
  await Promise.resolve(); expect(answered).toBe(false);
  interactions.answer(card.id, { action: 'accept' }, 'watch');
  await expect(response).resolves.toEqual({ decision: 'accept' });
  expect(startAgentRun).toHaveBeenCalledOnce();
});
it('withdraws a stopped forwarded decision without approving it', async () => {
  await startForwardedRun({ provider: 'codex', sessionId: 'destination-1234', prompt: 'Fix', permission: 'readonly', cwd: 'C:/project' }, vi.fn());
  const interact = vi.mocked(startAgentRun).mock.calls[0][3]!;
  const controller = new AbortController();
  const response = interact('item/commandExecution/requestApproval', { threadId: 'destination-1234', command: 'inspect', availableDecisions: ['accept','cancel'] }, controller.signal);
  controller.abort();
  await expect(response).resolves.toEqual({ decision: 'cancel' });
  expect(interactions.list()).toHaveLength(0);
});
