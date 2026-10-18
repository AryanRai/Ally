import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CollapsedHeader from './CollapsedHeader';
import CollapsedResponsePreview from './CollapsedResponsePreview';
import type { Message } from '@/types/chat';

vi.mock('@/components/glow/AgentPresence', () => ({ default: () => <span>Ally</span> }));
vi.mock('../UnifiedModelSelector', () => ({ UnifiedModelSelector: () => <button>Model</button> }));
vi.mock('./WatchReplyContent', () => ({ default: ({ content }: { content: string }) => <p>{content}</p> }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const user: Message = { id: 'u1', role: 'user', content: 'Take meeting notes', timestamp: 1 };
const reply: Message = { id: 'a1', role: 'assistant', content: 'Decisions and next steps', timestamp: 2 };
const props = {
  platform: 'win32', theme: 'dark' as const, isTyping: false, messages: [] as Message[],
  quickInput: '', setQuickInput: vi.fn(), onSend: vi.fn(), onStop: vi.fn(),
  onCollapseToggle: vi.fn(), onSizeChange: vi.fn(), onHide: vi.fn(), onCopyMessage: vi.fn(),
  isResizing: false, size: 'S', hasNewContext: false, contextData: {}, contextToggleEnabled: false,
  currentModel: 'codex:default', showModelSelector: false, onModelSelectorToggle: vi.fn(), onModelSelect: vi.fn(),
  mood: 'idle' as const, sensing: false, robotStatus: 'idle' as const, pulse: null,
};

describe('collapsed live reader', () => {
  it('keeps context and agent toggles in one small row while history is inside More', () => {
    const screenToggle = vi.fn(), clipboardToggle = vi.fn();
    render(<CollapsedHeader {...props} messages={[user, reply]} screenAutoAttach onScreenAutoAttachToggle={screenToggle} onClipboardAutoAttachToggle={clipboardToggle} />);
    const screenButton = screen.getByRole('button', { name: 'Screen · auto' });
    const clipboardButton = screen.getByRole('button', { name: 'Clipboard' });
    expect(screenButton.parentElement).toBe(clipboardButton.parentElement);
    expect(screenButton.parentElement).toContainElement(screen.getByRole('button', { name: 'Agent status' }));
    expect(screen.queryByRole('button', { name: /Recent messages/ })).not.toBeInTheDocument();
    fireEvent.click(screenButton); fireEvent.click(clipboardButton);
    expect(screenToggle).toHaveBeenCalledOnce(); expect(clipboardToggle).toHaveBeenCalledOnce();
  });
  it('keeps Meeting inside More controls and retains setup while hidden in a short manual window', () => {
    const { container } = render(<CollapsedHeader {...props} heightConstrained menuControls={<div><button>Meeting</button><input aria-label="Meeting draft" defaultValue="saved" /></div>} />);
    expect(screen.queryByRole('button', { name: 'Meeting' })).not.toBeInTheDocument();
    const more = screen.getByRole('button', { name: 'More controls' });
    fireEvent.click(more);
    expect(screen.getByRole('button', { name: 'Meeting' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Meeting draft'), { target: { value: 'retained' } });
    fireEvent.click(more);
    expect(screen.queryByRole('button', { name: 'Meeting' })).not.toBeInTheDocument();
    fireEvent.click(more);
    expect(screen.getByLabelText('Meeting draft')).toHaveValue('retained');
    expect(container.firstElementChild).toHaveClass('max-h-full', 'overflow-y-auto');
  });
  it('never labels a working chat Stopped because an older answer had an interrupted footer', () => {
    const messages = [user, { ...reply, content: 'Earlier answer\n\n⏹️ Stopped' }];
    const { rerender } = render(<CollapsedHeader {...props} messages={messages} isTyping stopDisabledReason="Live in Codex · Stop there" workingStatus="Thinking…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Thinking…');
    expect(screen.getByRole('region', { name: 'Live update' })).toHaveTextContent('Earlier answer');
    expect(screen.queryByText(/Stopped|was interrupted/)).not.toBeInTheDocument();
    rerender(<CollapsedHeader {...props} messages={messages} />);
    expect(screen.getByText('Earlier reply')).toBeInTheDocument();
    expect(screen.getByText('This earlier reply was interrupted.')).toBeInTheDocument();
  });
  it('shows one working status even with history open, and keeps Stop separate from guidance', () => {
    const onStop = vi.fn(), onSend = vi.fn();
    render(<CollapsedHeader {...props} messages={[{ ...reply, id: 'older' }, user]} isTyping quickInput="Also track actions" onStop={onStop} onSend={onSend} />);
    fireEvent.click(screen.getByRole('button', { name: 'More controls' }));
    fireEvent.click(screen.getByRole('button', { name: /Recent messages/ }));
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getAllByText('Thinking…')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Queue message' }));
    expect(onSend).toHaveBeenCalledWith('Also track actions', true, 'queue');
    expect(onStop).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('retains the finished reply and clears it for a new user turn', () => {
    const { rerender } = render(<CollapsedHeader {...props} messages={[user]} isTyping currentResponse="Decisions and next steps" />);
    rerender(<CollapsedHeader {...props} messages={[user, reply]} />);
    expect(screen.getByRole('region', { name: 'Latest reply' })).toHaveTextContent(reply.content);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    rerender(<CollapsedHeader {...props} messages={[user, reply, { ...user, id: 'u2' }]} isTyping />);
    expect(screen.queryByText(reply.content)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Thinking…');
  });

  it('keeps controls open until toggled or Escape, including when the pointer leaves', () => {
    render(<CollapsedHeader {...props} />);
    const more = screen.getByRole('button', { name: 'More controls' });
    fireEvent.click(more);
    fireEvent.mouseLeave(more.closest('.flex-col')!);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(more, { key: 'Escape' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('textbox', { name: 'Message Ally' })).toHaveFocus();
  });

  it('does not offer Stop for an external app turn', () => {
    render(<CollapsedHeader {...props} isTyping stopDisabledReason="Live in Codex · Stop there" workingStatus="Working · Read file" />);
    expect(screen.queryByRole('button', { name: 'Stop response' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Working · Read file');
  });

  it('auto-opens each turn but respects collapsing during the current stream', () => {
    const { rerender } = render(<CollapsedResponsePreview response="First words" responseId="u1" isTyping />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse reply' }));
    rerender(<CollapsedResponsePreview response="First words plus more" responseId="u1" isTyping />);
    expect(screen.queryByRole('region', { name: 'Live update' })).not.toBeInTheDocument();
    rerender(<CollapsedResponsePreview response="Next turn" responseId="u2" isTyping />);
    expect(screen.getByRole('region', { name: 'Live update' })).toHaveTextContent('Next turn');
  });

  it('follows chunks, pauses when reading above, and resumes on demand', () => {
    const { rerender } = render(<CollapsedResponsePreview response="First words" isTyping />);
    const panel = screen.getByRole('region', { name: 'Live update' });
    Object.defineProperties(panel, { scrollHeight: { value: 600, configurable: true }, clientHeight: { value: 192 } });
    rerender(<CollapsedResponsePreview response="More words" isTyping />);
    expect(panel.scrollTop).toBe(600);
    panel.scrollTop = 100;
    fireEvent.wheel(panel, { deltaY: -100 });
    fireEvent.scroll(panel);
    rerender(<CollapsedResponsePreview response="Even more words" isTyping />);
    expect(panel.scrollTop).toBe(100);
    fireEvent.click(screen.getByRole('button', { name: 'Follow latest' }));
    expect(panel.scrollTop).toBe(600);
    expect(screen.queryByRole('button', { name: 'Follow latest' })).not.toBeInTheDocument();
  });

  it('does not mistake layout scroll events for the reader scrolling up', () => {
    const { rerender } = render(<CollapsedResponsePreview response="First words" isTyping />);
    const panel = screen.getByRole('region', { name: 'Live update' });
    Object.defineProperties(panel, { scrollHeight: { value: 600 }, clientHeight: { value: 192 } });
    fireEvent.scroll(panel);
    expect(screen.queryByRole('button', { name: 'Follow latest' })).not.toBeInTheDocument();
    rerender(<CollapsedResponsePreview response="New words after layout" isTyping />);
    expect(panel.scrollTop).toBe(600);
  });

  it('reports real content height again when panels grow and disconnects on unmount', () => {
    let resize: () => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 126 } as DOMRect);
    const measure = vi.fn();
    const { unmount } = render(<CollapsedHeader {...props} onHeightChange={measure} />);
    expect(measure).toHaveBeenLastCalledWith(126);
    bounds.mockReturnValue({ height: 361.2 } as DOMRect);
    act(() => resize());
    expect(measure).toHaveBeenLastCalledWith(362);
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('copies readable watch replies and shows send failures', () => {
    const copy = vi.fn();
    render(<CollapsedHeader {...props} messages={[user, { ...reply, content: '{"text":"Meeting notes","components":[]}' }]} onCopyMessage={copy} sendFailure="Could not send; your draft is preserved" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy reply' }));
    expect(copy).toHaveBeenCalledWith('Meeting notes');
    expect(screen.getByRole('alert')).toHaveTextContent('draft is preserved');
  });
});


it('changes Stop into an explicit Resume control without sending the composer draft', () => {
  const onResume=vi.fn(), onStop=vi.fn(), onSend=vi.fn();
  const {rerender}=render(<CollapsedHeader {...props} onResume={onResume} onStop={onStop} onSend={onSend} isTyping />);
  expect(screen.queryByRole('button',{name:'Resume response'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Stop response'})); expect(onStop).toHaveBeenCalledOnce();
  rerender(<CollapsedHeader {...props} onResume={onResume} onStop={onStop} onSend={onSend} quickInput="Keep this draft" />);
  expect(screen.queryByRole('button',{name:'Stop response'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Resume response'}));
  expect(onResume).toHaveBeenCalledOnce();expect(onSend).not.toHaveBeenCalled();
});
