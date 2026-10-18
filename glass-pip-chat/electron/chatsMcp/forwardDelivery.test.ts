// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { forwardDelivery } from './forwardDelivery';
import type { AgentEvent } from '../agent/types';
afterEach(() => vi.useRealTimers());
it('does not report sent on spawn/session/connection; waits for exact accepted turn', async () => {
  vi.useFakeTimers(); let emit!: (event: AgentEvent) => void;
  const start = vi.fn(async callback => { emit = callback; return 'spawned'; }), done = vi.fn();
  const promise = forwardDelivery(start, false, 20000, done); const settled = vi.fn(); void promise.then(settled);
  emit({ kind: 'session', sessionId: 'target' }); emit({ kind: 'tool_start', id: 'ally-desktop-connection', name: 'Codex desktop' });
  await vi.advanceTimersByTimeAsync(100); expect(settled).not.toHaveBeenCalled();
  emit({ kind: 'accepted', sessionId: 'target', turnId: 'confirmed-turn' });
  await expect(promise).resolves.toMatchObject({ status: 'still_running', accepted: true, turnId: 'confirmed-turn' });
  emit({ kind: 'done' }); expect(start).toHaveBeenCalledOnce(); expect(done).toHaveBeenCalledOnce();
});
it('reports setup failure and unconfirmed timeout without claiming delivery or replaying', async () => {
  await expect(forwardDelivery(async () => { throw Error('busy owner'); }, false, 1000, vi.fn())).resolves.toMatchObject({ status: 'error', error: 'busy owner', accepted: false });
  vi.useFakeTimers(); const start = vi.fn(async () => 'spawned');
  const pending = forwardDelivery(start, false, 1000, vi.fn()); await vi.advanceTimersByTimeAsync(1000);
  await expect(pending).resolves.toMatchObject({ status: 'unconfirmed', error: expect.stringContaining('did not resend') }); expect(start).toHaveBeenCalledOnce();
});
it('relays completed replies or errors after accepted delivery without treating timeout as completion', async () => {
  const done = vi.fn();
  await expect(forwardDelivery(async emit => { emit({ kind: 'accepted', sessionId: 'target' }); emit({ kind: 'text', text: 'Real reply' }); emit({ kind: 'done' }); }, true, 20000, done)).resolves.toMatchObject({ status: 'replied', reply: 'Real reply', accepted: true });
  await expect(forwardDelivery(async emit => { emit({ kind: 'done', isError: true, error: 'Not sent' }); }, true, 20000, vi.fn())).resolves.toMatchObject({ status: 'error', error: 'Not sent' });
});
