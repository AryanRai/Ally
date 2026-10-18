import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CollapsedMeetingControls, { meetingReply } from './CollapsedMeetingControls';
import type { PerceptionState } from '@/hooks/usePerception';
import type { Chat } from '@/types/chat';

afterEach(cleanup);
function fixture() {
  return {
    api: { start: vi.fn(), pause: vi.fn().mockResolvedValue(undefined), resume: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined), setCapture: vi.fn().mockResolvedValue(undefined) },
    status: { session: { sessionId: 'exact-session', provider: 'codex', title: 'Project meeting', state: 'running', startedAt: '2026-10-18T00:00:00Z', capture: { systemAudio: true, microphone: false, screen: true } }, audio: { system_audio: 'listening', microphone: 'off' }, screen: 'watching' },
    observations: [
      { kind: 'transcript.final', at: '2026-10-17T00:00:00Z', source: 'system_audio', text: 'Old meeting' },
      { kind: 'transcript.partial', at: '2026-10-18T00:00:10Z', source: 'system_audio', text: 'Assign an owner to the next step' },
      { kind: 'transcript.partial', at: '2026-10-18T00:00:11Z', source: 'microphone', text: 'Disabled microphone' },
    ], turns: [],
  } as unknown as PerceptionState;
}
const chat: Chat = { id: 'local', title: 'Project', messages: [], createdAt: 0, updatedAt: 0, agent: { provider: 'codex', sessionId: 'exact-session' } };

describe('compact meeting controls', () => {
  it('shows actual enabled sources and current transcript without starting capture', async () => {
    const perception = fixture();
    render(<CollapsedMeetingControls perception={perception} onOpenSetup={vi.fn()} onOpenSession={vi.fn()} />);
    expect(perception.api!.start).not.toHaveBeenCalled();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Microphone' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/Computer · Assign an owner/)).toBeInTheDocument();
    expect(screen.queryByText(/Old meeting|Disabled microphone/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause capture' }));
    await waitFor(() => expect(perception.api!.pause).toHaveBeenCalledOnce());
  });

  it('toggles independent sources and reports failed operations', async () => {
    const perception = fixture();
    vi.mocked(perception.api!.setCapture).mockRejectedValueOnce(new Error('Device disconnected'));
    render(<CollapsedMeetingControls perception={perception} onOpenSetup={vi.fn()} onOpenSession={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Microphone' }));
    expect(perception.api!.setCapture).toHaveBeenCalledWith({ microphone: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('Device disconnected');
    fireEvent.click(screen.getByRole('button', { name: 'End meeting session' }));
    await waitFor(() => expect(perception.api!.stop).toHaveBeenCalledOnce());
  });

  it('keeps pause visible and opens setup explicitly when no session exists', () => {
    const perception = fixture();
    perception.status!.session!.state = 'paused';
    const setup = vi.fn();
    const { rerender } = render(<CollapsedMeetingControls perception={perception} onOpenSetup={setup} onOpenSession={vi.fn()} />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume capture' })).toBeInTheDocument();
    perception.status!.session = null;
    rerender(<CollapsedMeetingControls perception={perception} onOpenSetup={setup} onOpenSession={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Meeting controls' }));
    expect(setup).toHaveBeenCalledOnce();
    expect(perception.api!.start).not.toHaveBeenCalled();
  });

  it('never places another session or provider’s live note into the selected chat', () => {
    const perception = fixture();
    const turn = { id: 'turn', state: 'running' as const, origin: 'proactive' as const, text: 'Live note', tools: [], startedAt: '2026-10-18T00:00:10Z' };
    perception.status!.activeTurn = turn;
    expect(meetingReply(perception, chat)).toBe(turn);
    expect(meetingReply(perception, { ...chat, agent: { provider: 'codex', sessionId: 'other' } })).toBeUndefined();
    expect(meetingReply(perception, { ...chat, agent: { provider: 'claude', sessionId: 'exact-session' } })).toBeUndefined();
  });

  it('retains a completed streamed note until native history catches up, without reviving an older session', () => {
    const perception = fixture();
    const turn = { id: 'turn', state: 'done' as const, origin: 'proactive' as const, text: 'Final note', tools: [], startedAt: '2026-10-18T00:00:10Z' };
    perception.turns = [turn];
    expect(meetingReply(perception, chat)).toBe(turn);
    expect(meetingReply(perception, { ...chat, messages: [{ id: 'reply', role: 'assistant', content: 'Final note', timestamp: Date.parse('2026-10-18T00:00:12Z') }] })).toBeUndefined();
    perception.status!.session!.startedAt = '2026-10-18T01:00:00Z';
    expect(meetingReply(perception, chat)).toBeUndefined();
  });
});
