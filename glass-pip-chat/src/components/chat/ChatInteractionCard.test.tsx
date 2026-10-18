import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatInteractionCard from './ChatInteractionCard';
import CollapsedChatPreview from './CollapsedChatPreview';
import type { InteractionHistory } from '../../../electron/devices/interactions';
const request: InteractionHistory = { id: 'test', chatId: 'codex:session-1234', kind: 'approval', title: 'Allow upload?', detail: 'Upload one file', fields: [], actions: [{ value: 'submit', label: 'Allow once' }, { value: 'decline', label: 'Deny' }], state: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 60000 };
describe('chat decision cards', () => {
  it('keeps completed decisions accessible in compact chat history without ordinary messages', () => {
    render(<CollapsedChatPreview messages={[]} decisions={[{ ...request, state: 'answered', decision: 'decline', answeredOn: 'watch' }]} onAnswer={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Recent messages · 1' }));
    expect(screen.getByText(/Denied on watch/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow once' })).toBeNull();
  });
  it('requires a click and retains the answered outcome without action buttons', async () => {
    const answer = vi.fn().mockResolvedValue({ accepted: true });
    const view = render(<ChatInteractionCard request={request} onAnswer={answer} />);
    expect(answer).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Allow once' }));
    await waitFor(() => expect(answer).toHaveBeenCalledWith('test', { action: 'submit', values: {} }));
    view.rerender(<ChatInteractionCard request={{ ...request, state: 'answered', decision: 'submit', answeredOn: 'phone' }} onAnswer={answer} />);
    expect(screen.getByText(/Allowed once on phone/)).toBeInTheDocument(); expect(screen.queryByRole('button')).toBeNull();
  });
  it('keeps rejected answers actionable and displays the error', async () => {
    const answer = vi.fn().mockRejectedValue(Error('Already answered on watch'));
    render(<ChatInteractionCard request={request} onAnswer={answer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Already answered on watch');
  });
});
