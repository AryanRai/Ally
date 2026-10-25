import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useExternalSessions } from './useExternalSessions';
import type { AgentSessionSummary } from '@/types/agent';

const original = window.pip;
afterEach(() => { cleanup(); window.pip = original; vi.restoreAllMocks(); });
const row = (provider: 'codex' | 'claude', id: string): AgentSessionSummary => ({ provider, id, title: id, createdAt: 1, updatedAt: 2 });
function bridge(listSessions: ReturnType<typeof vi.fn>) {
  window.pip = { agent: { listSessions, runningSessions: vi.fn().mockResolvedValue([]), onSessionsChanged: vi.fn(() => vi.fn()) } } as any;
}

it('retains failed-provider rows while refreshing others, then accepts authoritative removals', async () => {
  let round = 0;
  const list = vi.fn(async (provider: 'codex' | 'claude') => {
    if (round === 1 && provider === 'codex') throw Error('Codex thread/list timed out');
    return round === 2 ? [] : [row(provider, `${provider}-${provider === 'codex' ? 0 : round}`)];
  });
  bridge(list);
  const { result } = renderHook(useExternalSessions);
  await waitFor(() => expect(result.current.sessions).toHaveLength(2));
  round = 1;
  await act(async () => { await result.current.refresh(); });
  expect(result.current.sessions.map(s => s.id)).toEqual(['claude-1', 'codex-0']);
  round = 2;
  await act(async () => { await result.current.refresh(); });
  expect(result.current.sessions).toEqual([]);
});

it('coalesces focus/change/manual refreshes instead of opening overlapping list scans', async () => {
  const finish: Array<(value: AgentSessionSummary[]) => void> = [];
  const list = vi.fn(() => new Promise<AgentSessionSummary[]>(resolve => finish.push(resolve)));
  bridge(list);
  const { result } = renderHook(useExternalSessions);
  expect(list).toHaveBeenCalledTimes(2);
  const first = result.current.refresh();
  expect(result.current.refresh()).toBe(first);
  window.dispatchEvent(new Event('focus'));
  expect(list).toHaveBeenCalledTimes(2);
  await act(async () => { finish[0]([row('claude', 'c')]); finish[1]([row('codex', 'mech')]); await first; });
  expect(result.current.sessions.map(s => s.id)).toEqual(['c', 'mech']);
});

it('does not start manual or event-driven scans after unmount', async () => {
  const list = vi.fn().mockResolvedValue([]);
  bridge(list);
  const { result, unmount } = renderHook(useExternalSessions);
  await act(async () => { await result.current.refresh(); });
  const refresh = result.current.refresh;
  unmount();
  const calls = list.mock.calls.length;
  window.dispatchEvent(new Event('focus'));
  await refresh();
  expect(list).toHaveBeenCalledTimes(calls);
});

it('loads beyond eighty chats with native cursors, keeps older pages on refresh and retries a failed page', async () => {
  let fail = true;
  const listSessionsPage = vi.fn(async (provider: 'codex' | 'claude', cursor?: string) => {
    if (provider === 'claude') return { sessions: [] };
    const offset = Number(cursor ?? 0);
    if (offset === 30 && fail) throw Error('Temporary list failure');
    return { sessions: Array.from({ length: 30 }, (_, i) => row(provider, `s${offset + i}`)), nextCursor: offset < 60 ? String(offset + 30) : undefined };
  });
  window.pip = { agent: { listSessionsPage, runningSessions: vi.fn().mockResolvedValue([]), onSessionsChanged: vi.fn(() => vi.fn()) } } as any;
  const { result } = renderHook(useExternalSessions);
  await waitFor(() => expect(result.current.sessions).toHaveLength(30));
  await act(async () => { await result.current.loadMore(); });
  expect(result.current.error).toContain('Codex'); expect(result.current.sessions).toHaveLength(30);
  fail = false;
  await act(async () => { await result.current.loadMore(); });
  await act(async () => { await result.current.loadMore(); });
  expect(result.current.sessions).toHaveLength(90); expect(result.current.hasMore).toBe(false);
  expect(listSessionsPage).toHaveBeenCalledWith('codex', '60');
  await act(async () => { await result.current.refresh(); });
  expect(result.current.sessions).toHaveLength(90); expect(result.current.hasMore).toBe(false);
});
