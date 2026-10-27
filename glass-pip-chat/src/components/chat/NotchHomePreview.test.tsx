import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NotchHomePreview from './NotchHomePreview';
import NotchHome from '../../../../ally-study/notch-ui/home';
import CompactMarkdown from './CompactMarkdown';

vi.mock('./CompactMarkdown', () => ({ default: vi.fn(({ children }: { children: React.ReactNode }) => <div>{children}</div>) }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); delete (window as unknown as {__allySurfaceVisible?: boolean}).__allySurfaceVisible; });

describe('compact notch Home', () => {
  it('puts the latest exchange ahead of controls and opens the existing full chat', () => {
    const open = vi.fn(), refresh = vi.fn();
    const { container } = render(<NotchHomePreview title="MECH5720" question="Note this in formula sheet." answer="Added on page 34." working={false} onOpenChat={open} onRefresh={refresh}/>);
    expect(screen.getByText('Added on page 34.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Ready');
    expect(container.querySelector('details')?.open).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Continue in chat/ }));
    expect(open).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /Refresh preview/ }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('refreshes the selected stream, clears a changed chat and uses only read APIs', async () => {
    vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    let selected = 'one';
    const api = vi.fn(async (route: string) => {
      if (route === 'selection') return { selected: { chatId: selected }, ...(selected === 'one' ? { activeTurn: { id: 'turn', chatId: 'one' } } : {}) };
      if (route.startsWith('chats/')) return { chat: { id: selected, title: selected }, messages: [{ role: 'user', text: `Question ${selected}`, timestamp: 1 }], running: selected === 'one' };
      if (route === 'turns/turn') return { id: 'turn', chatId: 'one', status: 'thinking', liveText: '```js\nstep(1); say("Live answer");' };
      throw Error('Unexpected route');
    });
    render(<NotchHome api={api}/>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByText('Live answer')).toBeTruthy();
    selected = 'two';
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(screen.queryByText('Live answer')).toBeNull();
    expect(screen.getByText('Question two')).toBeTruthy();
    expect(api.mock.calls.every(call => call.length === 1)).toBe(true);
  });

  it('pauses hidden polling and resumes from visibility without changing drafts', async () => {
    vi.useFakeTimers(); const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const api = vi.fn(async () => ({ selected: null }));
    render(<NotchHome api={api}/>);
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(api).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(api).toHaveBeenCalledWith('selection');
  });

  it('keeps unchanged streamed Markdown mounted and makes no reads while the native pane is detached', async () => {
    vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const api = vi.fn(async (route: string) => route === 'selection'
      ? { selected: { chatId: 'one' }, activeTurn: { id: 'turn', chatId: 'one' } }
      : route.startsWith('chats/') ? { chat: { id: 'one', title: 'Study' }, messages: [], running: true }
      : { id: 'turn', chatId: 'one', status: 'thinking', liveText: '```js\nstep(1); say("Stable answer");' });
    render(<NotchHome api={api}/>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const rendered = vi.mocked(CompactMarkdown).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(vi.mocked(CompactMarkdown).mock.calls.length).toBe(rendered);
    const reads = api.mock.calls.length;
    (window as unknown as {__allySurfaceVisible?: boolean}).__allySurfaceVisible = false;
    await act(async () => { window.dispatchEvent(new Event('ally-surface-visibility')); await vi.advanceTimersByTimeAsync(20000); });
    expect(api.mock.calls.length).toBe(reads);
    (window as unknown as {__allySurfaceVisible?: boolean}).__allySurfaceVisible = true;
    await act(async () => { window.dispatchEvent(new Event('ally-surface-visibility')); });
    expect(api.mock.calls.length).toBeGreaterThan(reads);
    expect(screen.getByText('Stable answer')).toBeTruthy();
  });
});
