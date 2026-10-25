import { useState } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Chat } from '@/types/chat';
import type { SelectionSnapshot } from '../../electron/agent/selection';
import { useSharedChatSelection } from './useSharedChatSelection';

const original = window.pip;
afterEach(() => { cleanup(); window.pip = original; });
const chat = (id: string): Chat => ({ id, title: id, createdAt: 1, updatedAt: 1, messages: [], agent: { provider: 'codex', sessionId: id } });
const selection = (id: string): SelectionSnapshot => ({ version: id, origin: 'notch', selected: { chatId: `codex:${id}`, sessionId: id, provider: 'codex', title: id, permission: 'readonly' } });

it('publishes desktop choices and opens notch choices without an echo or an agent send', async () => {
  let state: SelectionSnapshot = { version: 'initial', selected: null, origin: 'desktop' };
  let emit!: (state: SelectionSnapshot) => void;
  const setSelection = vi.fn(async (selected, version) => {
    expect(version).toBe(state.version);
    state = { version: crypto.randomUUID(), selected, origin: 'desktop' }; emit(state);
    return { accepted: true, ...state };
  });
  window.pip = { agent: { getSelection: async () => state, setSelection, onSelection: (cb: typeof emit) => { emit = cb; return () => {}; } } } as any;
  const open = vi.fn();
  const { result } = renderHook(() => {
    const [current, select] = useState(chat('first'));
    const error = useSharedChatSelection(current, true, 'readonly', async session => { open(session); select(chat(session.id)); });
    return { current, select, error };
  });
  await waitFor(() => expect(setSelection).toHaveBeenCalledOnce());
  act(() => { state = selection('second'); emit(state); });
  await waitFor(() => expect(result.current.current.id).toBe('second'));
  expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 'second', provider: 'codex' }));
  expect(setSelection).toHaveBeenCalledOnce();
  act(() => result.current.select(chat('third')));
  await waitFor(() => expect(setSelection).toHaveBeenCalledTimes(2));
  expect(state.selected?.sessionId).toBe('third'); expect(result.current.error).toBe('');
});

it('ignores a stale startup read after a newer notch selection and ignores later history completion', async () => {
  let resolve!: (snapshot: SelectionSnapshot) => void, emit!: (snapshot: SelectionSnapshot) => void;
  const setSelection = vi.fn();
  window.pip = { agent: { getSelection: () => new Promise(r => { resolve = r; }), setSelection, onSelection: (cb: typeof emit) => { emit = cb; return () => {}; } } } as any;
  const open = vi.fn(async (_session: { id: string }) => {});
  renderHook(() => useSharedChatSelection(chat('old'), true, 'readonly', open));
  await act(async () => { emit(selection('new')); resolve({ version: 'old', selected: null, origin: 'desktop' }); });
  expect(open).toHaveBeenCalledOnce(); expect(open.mock.calls[0][0]).toMatchObject({ id: 'new' });
  expect(setSelection).not.toHaveBeenCalled();
});
