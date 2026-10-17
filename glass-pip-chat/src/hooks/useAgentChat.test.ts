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
