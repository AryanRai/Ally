import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatSidebar from './ChatSidebar';
import type { ChatSearchResult } from './ChatSearch';
import type { Chat } from '@/types/chat';

const linked: Chat = { id: 'saved', title: 'Saved chat', messages: [], createdAt: 1, updatedAt: 2, agent: { provider: 'claude', sessionId: 'claude-1', cwd: 'C:\\Work\\Ally' } };
const hit = (provider: 'claude' | 'codex', id: string, title: string) => ({ provider, id, title, folder: 'C:\\Work\\Ally', updatedAt: Date.now(), snippet: `…about ${title}…` });
const base = { activeChat: null, onChatSelect: vi.fn(), onChatCreate: vi.fn(), onChatDelete: vi.fn(), onChatRename: vi.fn(), isCollapsed: false, onToggleCollapse: vi.fn(), theme: 'dark' as const, platform: 'win32' };
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

it('debounces, shows provider/folder/snippet and opens results through the row paths', async () => {
  const search = vi.fn(async (q: string): Promise<ChatSearchResult> => ({ hits: q === 'watch speech' ? [hit('codex', 'old-1', 'Watch speech'), hit('claude', 'claude-1', 'Saved chat')] : [], pending: 0 }));
  const onOpenAgentSession = vi.fn(), onChatSelect = vi.fn();
  render(<ChatSidebar {...base} chats={[linked]} onChatSelect={onChatSelect} onOpenAgentSession={onOpenAgentSession} onSearchChats={search} />);
  const input = screen.getByRole('searchbox', { name: 'Search chats' });
  fireEvent.change(input, { target: { value: 'w' } });
  fireEvent.change(input, { target: { value: 'watch speech' } });
  const option = await screen.findByRole('option', { name: /Watch speech/ });
  expect(search).toHaveBeenCalledTimes(1);
  expect(search).toHaveBeenCalledWith('watch speech');
  expect(option).toHaveTextContent('Codex · Ally');
  expect(option).toHaveTextContent('…about Watch speech…');
  expect(screen.queryByText('Recent & unread')?.closest('.hidden')).toBeTruthy();

  fireEvent.click(option);
  expect(onOpenAgentSession).toHaveBeenCalledWith(expect.objectContaining({ provider: 'codex', id: 'old-1', title: 'Watch speech' }));
  expect(input).toHaveValue('');

  fireEvent.change(input, { target: { value: 'watch speech' } });
  await screen.findByRole('option', { name: /Saved chat/ });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChatSelect).toHaveBeenCalledWith('saved');
});

it('ignores a slow stale answer and clears on Escape', async () => {
  let releaseOld!: (r: ChatSearchResult) => void;
  const search = vi.fn((q: string) => q === 'old' ? new Promise<ChatSearchResult>(r => { releaseOld = r; }) : Promise.resolve({ hits: [hit('claude', 'n', 'Newer')], pending: 0 }));
  render(<ChatSidebar {...base} chats={[]} onSearchChats={search} />);
  const input = screen.getByRole('searchbox', { name: 'Search chats' });
  fireEvent.change(input, { target: { value: 'old' } });
  await waitFor(() => expect(search).toHaveBeenCalledWith('old'));
  fireEvent.change(input, { target: { value: 'new' } });
  await screen.findByRole('option', { name: /Newer/ });
  await act(async () => releaseOld({ hits: [hit('claude', 'o', 'Stale')], pending: 0 }));
  expect(screen.queryByRole('option', { name: /Stale/ })).not.toBeInTheDocument();

  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input).toHaveValue('');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.getByText('Recent & unread').closest('.hidden')).toBeNull();
});

it('searches again while transcripts are still being indexed', async () => {
  vi.useFakeTimers();
  try {
    const search = vi.fn()
      .mockResolvedValueOnce({ hits: [], pending: 12 })
      .mockResolvedValueOnce({ hits: [hit('codex', 'deep', 'Deep match')], pending: 0 });
    render(<ChatSidebar {...base} chats={[]} onSearchChats={search} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search chats' }), { target: { value: 'dma' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(screen.getByRole('status')).toHaveTextContent('Reading 12 more chats');
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(search).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('option', { name: /Deep match/ })).toBeInTheDocument();
  } finally { vi.useRealTimers(); }
});

it('opens search from the collapsed rail and with Ctrl+F', () => {
  const onToggleCollapse = vi.fn();
  const { rerender } = render(<ChatSidebar {...base} chats={[]} isCollapsed onToggleCollapse={onToggleCollapse} onSearchChats={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Search chats' }));
  expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document, { key: 'f', ctrlKey: true });
  expect(onToggleCollapse).toHaveBeenCalledTimes(2);

  rerender(<ChatSidebar {...base} chats={[]} isCollapsed={false} onToggleCollapse={onToggleCollapse} onSearchChats={vi.fn()} />);
  expect(screen.getByRole('searchbox', { name: 'Search chats' })).toHaveFocus();
});

it('shows no search without a backend', () => {
  render(<ChatSidebar {...base} chats={[]} />);
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
});
