import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChatMessage from './ChatMessage';
import WatchReplyContent from './WatchReplyContent';
import type { Message } from '@/types/chat';

vi.mock('./WatchReplyContent', () => ({
  default: vi.fn(({ content }: { content: string }) => <div>{content}</div>),
  OriginalMessage: () => null,
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const actions = { onEdit: vi.fn(), onFork: vi.fn(), onDelete: vi.fn(), onRetry: vi.fn() };
const interrupted: Message = {
  id: 'reply', role: 'assistant', timestamp: 1,
  content: 'Checking the build\n\n⏹️ Stopped',
  metadata: { segments: [{ type: 'text', content: 'Checking the build' }, { type: 'text', content: '⏹️ Stopped' }] },
};

describe('full chat interruption status', () => {
  it('skips unchanged reply work but dispatches the latest action handlers', () => {
    const message: Message = { id: 'saved', role: 'assistant', timestamp: 1, content: 'Saved answer' };
    const oldRetry = vi.fn(), nextRetry = vi.fn();
    const { rerender } = render(<ChatMessage {...actions} onRetry={oldRetry} message={message} />);
    const calls = vi.mocked(WatchReplyContent).mock.calls.length;
    for (let i = 0; i < 24; i++) rerender(<ChatMessage {...actions} onRetry={nextRetry} onDelete={() => {}} message={message} />);
    expect(vi.mocked(WatchReplyContent)).toHaveBeenCalledTimes(calls);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(nextRetry).toHaveBeenCalledWith('saved'); expect(oldRetry).not.toHaveBeenCalled();
  });

  it('updates in-place message edits and replacement metadata without losing an open editor', () => {
    const message: Message = { id: 'saved', role: 'user', timestamp: 1, content: 'Original question' };
    const { rerender } = render(<ChatMessage {...actions} message={message} />);
    message.content = 'Edited in place'; message.timestamp++;
    rerender(<ChatMessage {...actions} message={message} />);
    expect(screen.getByText('Edited in place')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsent edit' } });
    const nextEdit = vi.fn();
    rerender(<ChatMessage {...actions} onEdit={nextEdit} message={message} />);
    expect(screen.getByRole('textbox')).toHaveValue('Unsent edit');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(nextEdit).toHaveBeenCalledWith('saved', 'Unsent edit');
    message.metadata = { context: 'New clipboard context' };
    rerender(<ChatMessage {...actions} message={message} />);
    expect(screen.getByText('+ clipboard · New clipboard context')).toBeInTheDocument();
  });

  it('shows a historical interruption separately and never as the current chat status', () => {
    render(<ChatMessage {...actions} message={interrupted} />);
    expect(screen.getByText('Checking the build')).toBeInTheDocument();
    expect(screen.getByText('This earlier reply was interrupted.')).toBeInTheDocument();
    expect(screen.queryByText('⏹️ Stopped')).not.toBeInTheDocument();
  });

  it('suppresses stale interruption metadata while the exact selected reply is working, restoring it when idle', () => {
    const { rerender } = render(<ChatMessage {...actions} message={interrupted} sessionWorking />);
    expect(screen.queryByText('This earlier reply was interrupted.')).not.toBeInTheDocument();
    expect(screen.queryByText('⏹️ Stopped')).not.toBeInTheDocument();
    rerender(<ChatMessage {...actions} message={interrupted} sessionWorking={false} />);
    expect(screen.getByText('This earlier reply was interrupted.')).toBeInTheDocument();
  });

  it('preserves user messages and ordinary assistant prose containing Stopped', () => {
    render(<ChatMessage {...actions} message={{ id: 'user', role: 'user', timestamp: 1, content: '⏹️ Stopped' }} />);
    render(<ChatMessage {...actions} message={{ id: 'prose', role: 'assistant', timestamp: 2, content: 'Stopped the old server; now building.' }} />);
    expect(screen.getByText('⏹️ Stopped')).toBeInTheDocument();
    expect(screen.getByText('Stopped the old server; now building.')).toBeInTheDocument();
    expect(screen.queryByText('This earlier reply was interrupted.')).not.toBeInTheDocument();
  });
});
