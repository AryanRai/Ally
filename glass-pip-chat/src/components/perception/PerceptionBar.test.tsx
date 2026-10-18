import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PerceptionBar from './PerceptionBar';
import type { PerceptionState } from '@/hooks/usePerception';
import type { Chat } from '@/types/chat';
const chat: Chat = { id: 'local-a', title: 'Design review', messages: [], createdAt: 0, updatedAt: 0, agent: { provider: 'codex', sessionId: 'exact-a', cwd: '/project' } };
function fixture() { return { api: { start: vi.fn().mockResolvedValue({}), pause: vi.fn().mockResolvedValue(undefined), resume: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined), setCapture: vi.fn().mockResolvedValue(undefined) }, status: { session: null, audio: { system_audio: 'off', microphone: 'off' }, screen: 'off' }, observations: [], turns: [] } as unknown as PerceptionState; }
afterEach(cleanup);
describe('Meeting in the selected Ally chat', () => {
  it('starts only explicitly, in the current native chat with visible source choices', async () => {
    const p = fixture(); render(<PerceptionBar perception={p} chat={chat} onOpenSession={vi.fn()} />);
    expect(p.api!.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Meeting' }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/Lecture|Realtime/)).not.toBeInTheDocument();
    expect(screen.getByText('Design review')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Screen' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start meeting' })));
    expect(p.api!.start).toHaveBeenCalledExactlyOnceWith({ provider: 'codex', sessionId: 'exact-a', title: 'Design review', cwd: '/project', mode: 'meeting', capture: { systemAudio: true, microphone: false, screen: false } });
  });
  it('requires an established chat and at least one selected source', () => {
    const p = fixture(); const { rerender } = render(<PerceptionBar perception={p} chat={{ ...chat, agent: { provider: 'claude' } }} onOpenSession={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Meeting' }));
    expect(screen.getByRole('button', { name: 'Start meeting' })).toBeDisabled();
    rerender(<PerceptionBar perception={p} chat={chat} onOpenSession={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Computer audio' })); fireEvent.click(screen.getByRole('button', { name: 'Screen' }));
    expect(screen.getByRole('button', { name: 'Start meeting' })).toBeDisabled();
  });
  it('keeps a pending start bound to its original chat across navigation and duplicate clicks', async () => {
    const p = fixture(); let finish!: (value: any) => void; vi.mocked(p.api!.start).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { rerender } = render(<PerceptionBar perception={p} chat={chat} onOpenSession={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Meeting' })); fireEvent.click(screen.getByRole('button', { name: 'Start meeting' }));
    rerender(<PerceptionBar perception={p} chat={{ ...chat, agent: { provider: 'claude', sessionId: 'other' } }} onOpenSession={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Starting meeting…' }));
    expect(p.api!.start).toHaveBeenCalledTimes(1); expect(vi.mocked(p.api!.start).mock.calls[0][0].sessionId).toBe('exact-a');
    await act(async () => finish({}));
  });
  it('keeps active capture controls and an explicit return link when navigating elsewhere', async () => {
    const p = fixture(), open = vi.fn(); p.status!.session = { provider: 'codex', sessionId: 'exact-a', title: 'Design review', state: 'running', mode: 'meeting', scope: '', startedAt: new Date().toISOString(), capture: { microphone: false, systemAudio: false, screen: false } };
    render(<PerceptionBar perception={p} chat={{ ...chat, agent: { provider: 'claude', sessionId: 'exact-a' } }} onOpenSession={open} />);
    expect(screen.getByText(/Meeting stays in/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Start meeting' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Design review' })[0]); expect(open).toHaveBeenCalledOnce();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pause capture' })));
    expect(p.api!.pause).toHaveBeenCalledOnce(); expect(p.api!.start).not.toHaveBeenCalled();
  });
  it('keeps failed setup reviewable without starting another chat', async () => {
    const p = fixture(); vi.mocked(p.api!.start).mockRejectedValue(new Error('End the current meeting first'));
    render(<PerceptionBar perception={p} chat={chat} onOpenSession={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Meeting' })); await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start meeting' })));
    expect(screen.getByRole('alert')).toHaveTextContent('End the current meeting first'); expect(screen.getByRole('button', { name: 'Start meeting' })).toBeEnabled();
  });
});
