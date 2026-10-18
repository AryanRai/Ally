import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import ChatSidebar, { groupByProject, runningEntries } from './ChatSidebar';
import type { Chat } from '@/types/chat';

const chat = (provider: 'claude' | 'codex', sessionId: string): Chat => ({ id: provider, title: `${provider} conversation`, messages: [], createdAt: 1, updatedAt: 2, agent: { provider, sessionId, cwd: 'C:\\Users\\test' } });
describe('provider sections', () => {
  it('keeps progress and Stop on the running chat when selection changes', () => {
    const onStop = vi.fn();
    const onSelect = vi.fn();
    const props = { chats: [chat('claude', 'c'), chat('codex', 'x')], activeChat: 'codex', onChatSelect: onSelect, onChatCreate: vi.fn(), onChatDelete: vi.fn(), onChatRename: vi.fn(), isCollapsed: false, onToggleCollapse: vi.fn(), theme: 'dark' as const, platform: 'win32', runningChatId: 'codex', workingStatus: 'Thinking…', onStop };
    const { rerender } = render(<ChatSidebar {...props} />);
    rerender(<ChatSidebar {...props} activeChat="claude" />);
    const runningRow = screen.getByRole('button', { name: /codex conversation Thinking/ }).parentElement!;
    expect(within(runningRow).getByRole('status')).toHaveTextContent('Thinking…');
    fireEvent.click(within(runningRow).getByRole('button', { name: 'Stop codex conversation' }));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    rerender(<ChatSidebar {...props} runningChatId={null} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Stop codex/ })).not.toBeInTheDocument();
  });
  it('keeps identical folders in separate engine sections and labels the real home directory', () => {
    const groups = groupByProject([chat('claude', 'same'), chat('codex', 'same')], [], 'C:/Users/test/');
    expect(groups.map(g => [g.provider, g.name])).toEqual([['claude', 'Home'], ['codex', 'Home']]);
    expect(groupByProject([chat('codex', 'same')], [], 'C:/Other')[0].name).toBe('test');
  });
  it('deduplicates migrated links within their engine only', () => {
    const groups = groupByProject([chat('codex', 'old')], [
      { provider: 'codex', id: 'new', originalSessionId: 'old', title: 'migrated', updatedAt: 1 },
      { provider: 'claude', id: 'old', title: 'Claude', updatedAt: 1 },
    ]);
    expect(groups.flatMap(g => g.entries)).toHaveLength(2);
  });
  it('renders large Claude/Codex headers, per-row labels and working-folder context', () => {
    render(<ChatSidebar chats={[chat('claude', 'c'), chat('codex', 'x')]} activeChat="codex" onChatSelect={() => {}} onChatCreate={() => {}} onChatDelete={() => {}} onChatRename={() => {}} isCollapsed={false} onToggleCollapse={() => {}} theme="dark" platform="win32" homeCwd="C:/Users/test" />);
    expect(screen.getByRole('heading', { name: 'Claude' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Codex' })).toBeInTheDocument();
    expect(screen.getAllByText('Working folders')).toHaveLength(2);
    expect(screen.getAllByText('Home')).toHaveLength(2);
    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
  });
});

it('deduplicates a linked running session and keeps exact cross-provider destinations', () => {
  const sessions = [
    { provider: 'codex' as const, id: 'x', title: 'Coding', updatedAt: 2 },
    { provider: 'claude' as const, id: 'x', title: 'Review', updatedAt: 1 },
  ];
  const entries = runningEntries([chat('codex', 'x')], sessions, 'codex');
  expect(entries).toHaveLength(2);
  const open = vi.fn(); const select = vi.fn();
  render(<ChatSidebar chats={[chat('codex', 'x')]} activeChat={null} runningSessions={sessions} onChatSelect={select} onOpenAgentSession={open} onChatCreate={() => {}} onChatDelete={() => {}} onChatRename={() => {}} isCollapsed={false} onToggleCollapse={() => {}} theme="dark" platform="win32" />);
  const running = screen.getByRole('region', { name: 'Running chats' });
  fireEvent.click(within(running).getByText('codex conversation'));
  expect(select).toHaveBeenCalledWith('codex');
  fireEvent.click(within(running).getByText('Review'));
  expect(open).toHaveBeenCalledWith(sessions[1]);
  expect(running.compareDocumentPosition(screen.getByRole('region', { name: 'Recent chats' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});


it('shows blue unread dots for linked and native chats without clearing them from the picker', async () => {
  const original = window.pip;
  const readStates = vi.fn().mockResolvedValue([{ key: 'codex:x', revision: 'one', unread: true }, { key: 'claude:c', revision: 'two', unread: false }]);
  const markRead = vi.fn();
  window.pip = { agent: { readStates, markRead } } as unknown as typeof window.pip;
  try {
    render(<ChatSidebar chats={[chat('codex', 'x'), chat('claude', 'c')]} activeChat="claude" onChatSelect={() => {}} onChatCreate={() => {}} onChatDelete={() => {}} onChatRename={() => {}} isCollapsed={false} onToggleCollapse={() => {}} theme="dark" platform="win32" />);
    await waitFor(() => expect(screen.getAllByLabelText('Unread reply')).toHaveLength(2));
    expect(markRead).not.toHaveBeenCalled();
  } finally { window.pip = original; }
});
