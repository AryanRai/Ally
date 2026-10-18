import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CompactUserMessage from './CompactUserMessage';
import CollapsedResponsePreview from './CollapsedResponsePreview';

describe('compact readable messages', () => {
  it('renders Markdown with an explicit expansion path for a long request', () => {
    render(<CompactUserMessage content={'# Request\n\nUse **Circle** and `drawing`.\n\n- Preserve [links](https://example.com)\n- Keep the entire request\n\n' + 'More detail. '.repeat(30)} />);
    expect(screen.getByRole('heading', { name: 'Request' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'links' })).toHaveAttribute('href', 'https://example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Read full request' }));
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('drawing').tagName).toBe('CODE');
  });
  it('transitions live progress to a final reply with earlier activity reachable and clean copying', () => {
    const copy = vi.fn();
    const progress = { type: 'text' as const, content: 'Checking files.', itemId: 'a', phase: 'commentary' as const };
    const { rerender, container } = render(<CollapsedResponsePreview response="Checking files." responseId="u" segments={[progress]} isTyping onCopy={copy} />);
    expect(screen.getByRole('region', { name: 'Live update' })).toHaveTextContent('Checking files.');
    const answer = '## Implemented\n\n- Readable **paragraphs**\n- `code` and [links](https://example.com)\n\n::created-thread{threadId="01a14c73-31e1-7310-9342-7131de45d662"}';
    rerender(<CollapsedResponsePreview response={'Checking files.\n\n' + answer} responseId="u" segments={[progress, { type: 'text', content: answer, phase: 'final_answer', itemId: 'b' }]} isTyping={false} onCopy={copy} />);
    const reader = screen.getByRole('region', { name: 'Latest reply' });
    expect(reader).not.toHaveTextContent('Checking files.');
    expect(within(reader).getByRole('heading', { name: 'Implemented' })).toBeInTheDocument();
    expect(within(reader).getAllByRole('listitem')).toHaveLength(2);
    expect(within(reader).getByRole('link', { name: 'Open created chat' })).toHaveAttribute('href', 'codex://threads/01a14c73-31e1-7310-9342-7131de45d662');
    const details = screen.getByText('Progress and activity · 1').closest('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent('Checking files.');
    fireEvent.click(screen.getByRole('button', { name: 'Copy reply' }));
    expect(copy).toHaveBeenCalledOnce();
    expect(copy.mock.calls[0][0]).toContain('[Open created chat]');
    expect(copy.mock.calls[0][0]).not.toMatch(/Checking files|::created-thread|svg/);
    for (const icon of container.querySelectorAll('svg')) expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(container.textContent).not.toContain('svgsvg');
  });
  it('clears the previous reply on a new empty streaming turn', () => {
    const { rerender } = render(<CollapsedResponsePreview response="Old final" responseId="a" isTyping={false} />);
    rerender(<CollapsedResponsePreview response="" responseId="b" isTyping />);
    expect(screen.queryByText('Old final')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Thinking');
  });
});
