import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useChats } from './useChats';
afterEach(() => { cleanup(); localStorage.clear(); });
it('retains transcript identity on unrelated parent renders and refreshes real message mutations', () => {
  const { result, rerender } = renderHook(() => useChats());
  const before = result.current.activeChat;
  rerender(); expect(result.current.activeChat).toBe(before);
  const chatId = before!.id;
  act(() => { result.current.addMessage(chatId, { id: 'new', role: 'user', content: 'Synthetic', timestamp: 10 }); });
  expect(result.current.activeChat).not.toBe(before);
  expect(result.current.activeChat!.messages.at(-1)?.content).toBe('Synthetic');
});
