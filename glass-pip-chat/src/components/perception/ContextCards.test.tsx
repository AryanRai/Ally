import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ContextCards from './ContextCards';
import type { PerceptionState } from '@/hooks/usePerception';
import type { Chat } from '@/types/chat';
vi.mock('@/components/ai-elements/message', () => ({ MessageResponse: ({ children }: any) => <div>{children}</div> }));
vi.mock('./CardUi', () => ({ default: () => null }));
afterEach(cleanup);
it('shows current meeting cards only inside their exact owning provider/session', () => {
  const chat = { agent: { provider: 'codex', sessionId: 'same-id' } } as Chat;
  const perception = { status: { session: { provider: 'codex', sessionId: 'same-id', startedAt: '2026-10-18T00:00:00Z' } }, cards: [
    { id: 'current', sessionId: 'same-id', at: '2026-10-18T00:01:00Z', priority: 'desktop', title: 'Current note', body: 'Meeting answer' },
    { id: 'old', sessionId: 'same-id', at: '2026-10-17T00:01:00Z', priority: 'desktop', title: 'Old note' },
    { id: 'foreign', sessionId: 'other-id', at: '2026-10-18T00:01:00Z', priority: 'desktop', title: 'Other note' },
  ], dismiss: vi.fn() } as unknown as PerceptionState;
  const { rerender } = render(<ContextCards perception={perception} chat={chat} />);
  expect(screen.getByText('Current note')).toBeInTheDocument(); expect(screen.queryByText('Old note')).not.toBeInTheDocument(); expect(screen.queryByText('Other note')).not.toBeInTheDocument();
  rerender(<ContextCards perception={perception} chat={{ ...chat, agent: { provider: 'claude', sessionId: 'same-id' } }} />);
  expect(screen.queryByText('Current note')).not.toBeInTheDocument();
  rerender(<ContextCards perception={perception} chat={{ ...chat, agent: { provider: 'codex', sessionId: 'other-id' } }} />);
  expect(screen.queryByText('Current note')).not.toBeInTheDocument();
});
