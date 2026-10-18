import { expect, it, vi } from 'vitest';
vi.mock('./unread.js', () => ({ nativeUnread: vi.fn(), nativeUnreadSnapshot: vi.fn() }));
import { acceptNativeUnread } from './codexUnread';
import { nativeUnread } from './unread';
it('accepts only the known local native unread protocol and retains the actual read flag', () => {
  const msg = { method: 'thread-read-state-changed', version: 3, params: { hostId: 'local', conversationId: 'a', hasUnreadTurn: true, context: { identity: { kind: 'chatgpt' }, executionHostKey: 'local:test' } } };
  expect(acceptNativeUnread({ ...msg, version: 2 })).toBe(false);
  expect(acceptNativeUnread({ ...msg, params: { ...msg.params, hostId: 'remote' } })).toBe(false);
  expect(acceptNativeUnread({ ...msg, params: { ...msg.params, context: undefined } })).toBe(false);
  expect(nativeUnread).not.toHaveBeenCalled();
  expect(acceptNativeUnread(msg)).toBe(true); expect(nativeUnread).toHaveBeenLastCalledWith('a', true);
  expect(acceptNativeUnread({ ...msg, params: { ...msg.params, hasUnreadTurn: false } })).toBe(true);
  expect(nativeUnread).toHaveBeenLastCalledWith('a', false);
});
