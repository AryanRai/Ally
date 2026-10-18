import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAgentChat, type AgentTurnResult } from './useAgentChat';
import type { AgentEvent } from '../types/agent';

describe('chat cancellation', () => {
  it('honors Stop during startup, preserves buffered output and releases the next run', async () => {
    let accept!: (id: string) => void;
    let receive!: (data: { runId: string; event: AgentEvent }) => void;
    const unsubscribe = vi.fn();
    const bridge = {
      getConfig: vi.fn().mockResolvedValue({ permission: 'edit' }),
      send: vi.fn().mockImplementation(() => new Promise<string>(resolve => { accept = resolve; })),
      stop: vi.fn().mockResolvedValue(true),
      onEvent: vi.fn().mockImplementation(callback => { receive = callback; return unsubscribe; }),
    };
    window.pip.agent = bridge as unknown as NonNullable<typeof window.pip.agent>;
    const { result } = renderHook(() => useAgentChat());
    const callbacks = { onText: vi.fn(), onThinking: vi.fn(), onSegments: vi.fn() };
    let turn!: Promise<AgentTurnResult>;
    await act(async () => {
      turn = result.current.runTurn({ provider: 'codex', prompt: 'test', model: 'default' }, callbacks);
    });
    act(() => { expect(result.current.stop()).toBe(true); result.current.stop(); });
    expect(bridge.stop).not.toHaveBeenCalled();
    receive({ runId: 'first', event: { kind: 'text', text: 'Partial reply' } });
    await act(async () => { accept('first'); await Promise.resolve(); });
    // Keep the run busy until the backend acknowledges interruption.
    await expect(result.current.runTurn({ provider: 'codex', prompt: 'too early', model: 'default' }, callbacks)).rejects.toThrow('already working');
    await act(async () => { receive({ runId: 'first', event: { kind: 'done' } }); await turn; });
    expect(await turn).toMatchObject({ text: 'Partial reply', stopped: true });
    expect(bridge.stop).toHaveBeenCalledExactlyOnceWith('first');
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(result.current.stop()).toBe(false);
    await act(async () => {
      turn = result.current.runTurn({ provider: 'claude', prompt: 'next', model: 'default' }, callbacks);
      accept('second');
      await Promise.resolve();
      result.current.stop();
      receive({ runId: 'second', event: { kind: 'done' } });
      await turn;
    });
    expect(bridge.stop).toHaveBeenLastCalledWith('second');
  });
});


it('keeps concurrent chat output, follow-ups and Stop isolated', async () => {
  const listeners = new Set<(data: { runId: string; event: AgentEvent }) => void>();
  const bridge = {
    getConfig: vi.fn().mockResolvedValue({ permission: 'edit' }),
    send: vi.fn().mockResolvedValueOnce('run-a').mockResolvedValueOnce('run-b'),
    stop: vi.fn().mockResolvedValue(true), steer: vi.fn().mockResolvedValue('queued'),
    onEvent: vi.fn(callback => { listeners.add(callback); return () => listeners.delete(callback); }),
  };
  window.pip.agent = bridge as unknown as NonNullable<typeof window.pip.agent>;
  const { result } = renderHook(() => useAgentChat());
  const a = { onText: vi.fn(), onThinking: vi.fn(), onSegments: vi.fn() };
  const b = { onText: vi.fn(), onThinking: vi.fn(), onSegments: vi.fn() };
  const emit = (runId: string, event: AgentEvent) => listeners.forEach(fn => fn({ runId, event }));
  let first!: Promise<AgentTurnResult>, second!: Promise<AgentTurnResult>;
  await act(async () => {
    first = result.current.runTurn({ provider: 'codex', prompt: 'a', model: 'default' }, a, 'chat-a');
    second = result.current.runTurn({ provider: 'claude', prompt: 'b', model: 'default' }, b, 'chat-b');
  });
  act(() => { emit('run-a', { kind: 'text', text: 'A' }); emit('run-b', { kind: 'text', text: 'B' }); });
  expect(a.onText).toHaveBeenCalledExactlyOnceWith('A'); expect(b.onText).toHaveBeenCalledExactlyOnceWith('B');
  await act(async () => { await result.current.steer('later', 'queue', 'chat-b'); });
  expect(bridge.steer).toHaveBeenCalledWith('run-b', 'later', expect.any(String), 'queue');
  act(() => { result.current.stop('chat-a'); });
  expect(bridge.stop).toHaveBeenCalledExactlyOnceWith('run-a');
  await act(async () => { emit('run-a', { kind: 'done' }); await first; });
  expect(await first).toMatchObject({ stopped: true, text: 'A' });
  await act(async () => { emit('run-b', { kind: 'text', text: ' continues' }); emit('run-b', { kind: 'done' }); await second; });
  expect(await second).toMatchObject({ text: 'B continues', stopped: false });
  expect(listeners.size).toBe(0);
});
