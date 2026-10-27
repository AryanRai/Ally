import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WatchReplyContent from './WatchReplyContent';

vi.mock('@/components/ai-elements/message', () => ({ MessageResponse: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./CompactMarkdown', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

describe('readable Study replies', () => {
  it.each([false, true])('shows speech with closed drawing details (compact=%s)', compact => {
    const raw = '```javascript\nstep(1); say("Added on page 34.");\nstep(2); say("Every symbol is defined.");\n```';
    const { container } = render(<WatchReplyContent content={raw} compact={compact} />);
    expect(screen.getByText('Added on page 34. Every symbol is defined.')).toBeTruthy();
    expect(screen.getByText('Drawing details')).toBeTruthy();
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(details.querySelector('pre')?.textContent).toBe(raw);
  });

  it('updates spoken paragraphs progressively while keeping details collapsed', () => {
    const first = '```js\nstep(1); say("First beat");\nstep(2); say("Sec';
    const { container, rerender } = render(<WatchReplyContent content={first} streaming />);
    expect(screen.getByText('First beat')).toBeTruthy();
    rerender(<WatchReplyContent content={first + 'ond beat");\n```'} />);
    expect(screen.getByText('First beat Second beat')).toBeTruthy();
    expect(container.querySelector('details')?.open).toBe(false);
  });
});
