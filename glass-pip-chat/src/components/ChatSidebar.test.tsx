import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ChatSidebar, { groupByProject } from './ChatSidebar';
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
