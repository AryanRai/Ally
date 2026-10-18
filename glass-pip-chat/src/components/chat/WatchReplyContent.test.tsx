import type { ComponentType } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as presentation from '@/lib/watchPresentation';
import WatchReplyContent from './WatchReplyContent';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const envelope = JSON.stringify({ text: '## Answer\n\n**Full** reply with [link](https://example.com)', components: [
  { type: 'card', title: 'Details', body: 'All content retained' },
  { type: 'checklist', title: 'Steps', items: ['One', 'Two'] },
  { type: 'progress', title: 'Progress', progress: .5 },
  { type: 'timer', title: 'Timer', seconds: 30 },
  { type: 'actions', title: 'Actions', actions: [{ label: 'Continue', prompt: 'Go ahead' }] },
] });

describe('reply render isolation', () => {
  it.each([false, true])('retains exactly the unmemoized DOM (compact=%s)', (compact) => {
    const Original = (WatchReplyContent as unknown as { type: ComponentType<{ content: string; compact: boolean }> }).type;
    const before = render(<Original content={envelope} compact={compact} />);
    const html = before.container.innerHTML;
    before.unmount();
    const after = render(<WatchReplyContent content={envelope} compact={compact} />);
    expect(after.container.innerHTML).toBe(html);
    if (compact) expect(screen.getByRole('link', { name: 'link' })).toHaveAttribute('href', 'https://example.com');
    else expect(screen.getByRole('button', { name: 'link' })).toBeInTheDocument();
    expect(screen.getByText('All content retained')).toBeInTheDocument();
    expect(screen.getByText('Go ahead')).toBeInTheDocument();
  });

  it('skips parsing on parent updates and retains expanded native details', () => {
    const parse = vi.spyOn(presentation, 'watchReplyView');
    const { rerender } = render(<WatchReplyContent content={envelope} compact />);
    const calls = parse.mock.calls.length;
    const details = screen.getByText('Watch message details').closest('details')!;
    fireEvent.click(screen.getByText('Watch message details'));
    details.open = true;
    rerender(<WatchReplyContent content={envelope} compact />);
    expect(parse).toHaveBeenCalledTimes(calls);
    expect(screen.getByText('Watch message details').closest('details')).toBe(details);
    expect(details.open).toBe(true);
  });

  it('renders every content, streaming and compact mode change', () => {
    const { rerender, container } = render(<WatchReplyContent content={'{"text":'} streaming compact />);
    expect(screen.getByText('Receiving reply…')).toBeInTheDocument();
    rerender(<WatchReplyContent content={envelope} streaming compact />);
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.queryByText('Watch message details')).not.toBeInTheDocument();
    rerender(<WatchReplyContent content={envelope} compact />);
    expect(screen.getByText('Watch message details')).toBeInTheDocument();
    const compactMarkup = container.innerHTML;
    rerender(<WatchReplyContent content={envelope} />);
    expect(container.innerHTML).not.toBe(compactMarkup);
    rerender(<WatchReplyContent content="Replacement answer" />);
    expect(screen.getByText('Replacement answer')).toBeInTheDocument();
    expect(screen.queryByText('All content retained')).not.toBeInTheDocument();
  });

  it('allows asynchronous image state to settle under the memo boundary', async () => {
    const previous = window.pip;
    const localImage = vi.fn().mockResolvedValue('data:image/jpeg;base64,aGVsbG8=');
    window.pip = { agent: { localImage } } as any;
    try {
      render(<WatchReplyContent content="![Preview](C:/synthetic/preview.jpg)" compact />);
      await waitFor(() => expect(screen.getByAltText('Preview')).toHaveAttribute('src', 'data:image/jpeg;base64,aGVsbG8='));
    } finally { window.pip = previous; }
  });
});
