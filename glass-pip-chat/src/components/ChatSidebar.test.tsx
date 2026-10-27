import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import ChatSidebar, { groupByProject, runningEntries, recentEntries } from './ChatSidebar';
import type { Chat } from '@/types/chat';

const chat = (provider: 'claude' | 'codex', sessionId: string): Chat => ({ id: provider, title: `${provider} conversation`, messages: [], createdAt: 1, updatedAt: 2, agent: { provider, sessionId, cwd: 'C:\\Users\\test' } });
beforeEach(() => localStorage.clear());

it('hides cached native and imported internal aliases while preserving a real Guardian review chat and its unread receipt', async () => {
  const previous = window.pip, markRead = vi.fn();
  const readStates = vi.fn().mockResolvedValue([
    { key: 'codex:internal-review', revision: 'internal', unread: false, hidden: true },
    { key: 'codex:user-review', revision: 'real', unread: true },
  ]);
  window.pip = { agent: { readStates, markRead } } as any;
  try {
    const internal = { ...chat('codex', 'internal-review'), id: 'saved-internal', title: 'Internal cached row' };
    const real = { ...chat('codex', 'user-review'), id: 'saved-user', title: 'Guardian review' };
    render(<ChatSidebar chats={[internal, real]} externalSessions={[{ provider: 'codex', id: 'internal-review', title: 'Internal native row', updatedAt: 1 }]} activeChat={null} onChatSelect={vi.fn()} onChatCreate={vi.fn()} onChatDelete={vi.fn()} onChatRename={vi.fn()} isCollapsed={false} onToggleCollapse={vi.fn()} theme="dark" platform="win32" />);
    await waitFor(() => expect(screen.queryByText('Internal cached row')).not.toBeInTheDocument());
    expect(screen.queryByText('Internal native row')).not.toBeInTheDocument();
    expect(screen.getByText('Guardian review')).toBeInTheDocument();
    expect(readStates).toHaveBeenCalledWith(['codex:internal-review', 'codex:user-review']);
    expect(markRead).not.toHaveBeenCalled();
  } finally { window.pip = previous; }
});

it('keeps every recent and unread chat, including notifications outside the loaded page',()=>{
  const entries=Array.from({length:12},(_,i)=>({kind:'chat' as const,chat:{...chat('codex',`session-${i}`),id:`chat-${i}`},updatedAt:i}));
  const rows=recentEntries(entries,new Set(['codex:session-0','claude:older-unread']));
  expect(rows).toHaveLength(13);
  expect(rows.at(-1)?.kind).toBe('session');
  expect(recentEntries(entries,new Set()).map(row=>row.kind==='chat' && row.chat.id)).toEqual(rows.filter(row=>row.kind==='chat').map(row=>row.kind==='chat' && row.chat.id));
});
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
    fireEvent.click(screen.getByRole('button', { name: /Recent & unread/ }));
    await waitFor(() => expect(screen.getAllByLabelText('Unread reply')).toHaveLength(3));
    expect(markRead).not.toHaveBeenCalled();
  } finally { window.pip = original; }
});

it('opens recent chats like a folder and reveals every remaining chat only on View more', () => {
  const chats = Array.from({ length: 12 }, (_, i) => ({ ...chat('codex', `session-${i}`), id: `chat-${i}`, title: `Chat ${i}`, createdAt: i + 1, updatedAt: i + 1 }));
  const select = vi.fn();
  const props = { chats, activeChat: null, onChatSelect: select, onChatCreate: vi.fn(), onChatDelete: vi.fn(), onChatRename: vi.fn(), isCollapsed: false, onToggleCollapse: vi.fn(), theme: 'dark' as const, platform: 'win32' };
  const { unmount } = render(<ChatSidebar {...props} />);
  const recent = within(screen.getByRole('region', { name: 'Recent chats' }));
  expect(recent.getByRole('button', { name: /Recent & unread/ })).toHaveAttribute('aria-expanded', 'false');
  expect(recent.queryByText('Chat 11')).not.toBeInTheDocument();
  fireEvent.click(recent.getByRole('button', { name: /Recent & unread/ }));
  expect(recent.getByRole('button', { name: /Recent & unread/ })).toHaveAttribute('aria-expanded', 'true');
  expect(recent.getByText('Chat 11')).toBeInTheDocument();
  expect(recent.queryByText('Chat 0')).not.toBeInTheDocument();
  fireEvent.click(recent.getByRole('button', { name: 'View more (6)' }));
  for (const c of chats) expect(recent.getByText(c.title)).toBeInTheDocument();
  fireEvent.click(recent.getByText('Chat 0'));
  expect(select).toHaveBeenCalledWith('chat-0');
  fireEvent.click(recent.getByRole('button', { name: 'View less' }));
  expect(recent.queryByText('Chat 0')).not.toBeInTheDocument();
  unmount();
  render(<ChatSidebar {...props} />);
  expect(within(screen.getByRole('region', { name: 'Recent chats' })).getByRole('button', { name: /Recent & unread/ })).toHaveAttribute('aria-expanded', 'true');
});

it('keeps older unread chats behind View more without acknowledging their receipt', async () => {
  const previous = window.pip;
  const markRead = vi.fn();
  window.pip = { agent: { readStates: vi.fn().mockResolvedValue([{ key: 'claude:older-unread', revision: 'pending', unread: true }]), markRead } } as any;
  const open = vi.fn();
  try {
    const chats = Array.from({ length: 8 }, (_, i) => ({ ...chat('codex', `s-${i}`), id: `c-${i}`, createdAt: i + 1 }));
    render(<ChatSidebar chats={chats} activeChat={null} onChatSelect={vi.fn()} onOpenAgentSession={open} onChatCreate={vi.fn()} onChatDelete={vi.fn()} onChatRename={vi.fn()} isCollapsed={false} onToggleCollapse={vi.fn()} theme="dark" platform="win32" />);
    const recent = within(screen.getByRole('region', { name: 'Recent chats' }));
    await waitFor(() => expect(recent.getByLabelText('Unread reply')).toBeInTheDocument());
    fireEvent.click(recent.getByRole('button', { name: /Recent & unread/ }));
    fireEvent.click(recent.getByRole('button', { name: 'View more (3)' }));
    fireEvent.click(recent.getByText('Unread conversation'));
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ provider: 'claude', id: 'older-unread' }));
    expect(markRead).not.toHaveBeenCalled();
  } finally { window.pip = previous; }
});
