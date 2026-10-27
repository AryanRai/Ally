import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useChatDrafts } from './useChatDrafts';
import { readBackupDrafts, saveBackupDraft } from '../lib/draftStorage';

vi.mock('../lib/draftStorage', async original => ({
  ...await original<typeof import('../lib/draftStorage')>(),
  readBackupDrafts: vi.fn(), saveBackupDraft: vi.fn(),
}));
beforeEach(() => {
  localStorage.clear();
  vi.mocked(readBackupDrafts).mockResolvedValue({});
  vi.mocked(saveBackupDraft).mockResolvedValue();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

it('keeps typing, functional edits and clear working when the transcript fills storage', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  const { result } = renderHook(() => useChatDrafts('chat-a'));
  act(() => { result.current.setInput('hello'); result.current.setInput(old => `${old} world`); });
  expect(result.current.input).toBe('hello world');
  await waitFor(() => expect(saveBackupDraft).toHaveBeenLastCalledWith('chat-a', 'hello world'));
  act(() => result.current.setInput(''));
  await waitFor(() => expect(saveBackupDraft).toHaveBeenLastCalledWith('chat-a', ''));
  expect(result.current.input).toBe('');
});

it('restores fallback drafts without replacing typing that started during hydration', async () => {
  let finish!: (drafts: Record<string, string>) => void;
  vi.mocked(readBackupDrafts).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { result, rerender } = renderHook(({ id }) => useChatDrafts(id), { initialProps: { id: 'a' } });
  act(() => result.current.setInput('new typing'));
  await act(async () => finish({ a: 'old text', b: 'saved fallback' }));
  expect(result.current.input).toBe('new typing');
  rerender({ id: 'b' });
  expect(result.current.input).toBe('saved fallback');
});

it('keeps late callbacks attached to their original chat', async () => {
  const { result, rerender } = renderHook(({ id }) => useChatDrafts(id), { initialProps: { id: 'a' } });
  await act(async () => {});
  const editA = result.current.setInput;
  rerender({ id: 'b' });
  act(() => { result.current.setInput('draft b'); editA('restored a'); });
  expect(result.current.input).toBe('draft b');
  rerender({ id: 'a' });
  expect(result.current.input).toBe('restored a');
});

it('uses an intentional fallback clear over an older local draft after reload', async () => {
  localStorage.setItem('ally-chat-drafts', JSON.stringify({ a: 'already sent' }));
  vi.mocked(readBackupDrafts).mockResolvedValue({ a: '' });
  const { result } = renderHook(() => useChatDrafts('a'));
  await waitFor(() => expect(result.current.input).toBe(''));
});

it('survives both storage failures and retries the next backup', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Storage blocked'); });
  vi.mocked(readBackupDrafts).mockRejectedValue(Error('Unavailable'));
  vi.mocked(saveBackupDraft).mockRejectedValueOnce(Error('Unavailable'));
  const { result } = renderHook(() => useChatDrafts('a'));
  act(() => result.current.setInput('one'));
  await waitFor(() => expect(saveBackupDraft).toHaveBeenCalledTimes(1));
  act(() => result.current.setInput('two'));
  await waitFor(() => expect(saveBackupDraft).toHaveBeenCalledTimes(2));
  expect(result.current.input).toBe('two');
});
