import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tutorRequest, useVisualTutor } from './useVisualTutor';
import type { TutorBoard } from '../../electron/visualTutor/types';
import { CIRCLE_ACTIONS, buildCirclePrompt } from '../circle/actions';
const board: TutorBoard = { id: 'session', chatId: 'chat-a', displayId: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, capturedAt: 1000, steps: [], sketches: [], selected: 0, following: true, sketching: false, frozen: false, revision: 0 };
const capture = { board, imagePath: '/temporary/snapshot.png', thumbnail: 'data:image/jpeg;base64,test' };
function api() {
  const tutor = { start: vi.fn().mockResolvedValue(capture), state: vi.fn().mockResolvedValue(null), end: vi.fn().mockResolvedValue(undefined), onChanged: vi.fn(() => () => {}) };
  Object.defineProperty(window, 'pip', { value: { tutor }, configurable: true });
  return tutor;
}
afterEach(cleanup);
describe('visual tutor chat integration', () => {
  it('attaches without sending, holds the exact crop while busy and claims it once with a real query', async () => {
    api(); const send = vi.fn();
    const { result, rerender } = renderHook(({ chatId }) => useVisualTutor(chatId, send), { initialProps: { chatId: 'chat-a' } });
    await act(async () => { await result.current.attach('token', 'chat-a'); });
    expect(send).not.toHaveBeenCalled(); expect(result.current.pendingSelection).toBe(true);
    act(() => { expect(result.current.claimAttachment(true)).toEqual({ blocked: true }); });
    expect(result.current.pendingSelection).toBe(true);
    act(() => { expect(result.current.claimAttachment()).toMatchObject({ image: { path: capture.imagePath } }); });
    expect(result.current.claimAttachment()).toEqual({ blocked: false });
    expect(result.current.decorate('follow up')).toContain('session');
    await act(async () => { await result.current.attach('token-2', 'chat-a'); });
    rerender({ chatId: 'chat-b' });
    expect(result.current.claimAttachment()).toEqual({ blocked: false });
    expect(result.current.pendingSelection).toBe(false);
  });
  it('does not capture or send on mount; an explicit request attaches exactly one screenshot', async () => {
    const tutor = api(); const send = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useVisualTutor('chat-a', send));
    await act(async () => {});
    expect(tutor.start).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
    await act(async () => { await result.current.start('Explain the triangle'); });
    expect(tutor.start).toHaveBeenCalledWith('chat-a', undefined);
    expect(send).toHaveBeenCalledWith(expect.stringContaining('Explain the triangle'), 'circle', { image: { path: capture.imagePath, thumbnail: capture.thumbnail } });
    expect(result.current.decorate('What does area mean?')).toContain('session');
    expect(tutor.start).toHaveBeenCalledTimes(1);
  });
  it('never sends the captured screen to a chat selected midway through capture', async () => {
    const tutor = api(); let finish: (value: typeof capture) => void = () => {};
    tutor.start.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const send = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ id }) => useVisualTutor(id, send), { initialProps: { id: 'chat-a' } });
    let pending: Promise<void>;
    act(() => { pending = result.current.start('Explain this'); });
    rerender({ id: 'chat-b' });
    await act(async () => { finish(capture); await pending!; });
    expect(send).not.toHaveBeenCalled(); expect(tutor.end).toHaveBeenCalledWith('session');
  });
  it('closes the drawing capability when switching chats and leaves unrelated prompts unchanged', async () => {
    const tutor = api(); const send = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ id }) => useVisualTutor(id, send), { initialProps: { id: 'chat-a' } });
    await act(async () => { await result.current.start('Explain'); });
    rerender({ id: 'chat-b' });
    await waitFor(() => expect(tutor.end).toHaveBeenCalledWith('session'));
    expect(result.current.decorate('Hello')).toBe('Hello');
    expect(tutorRequest('Hello', board, 'chat-b')).toBe('Hello');
  });
  it('surfaces capture and agent failures while retaining an explicitly shared board after uncertain delivery', async () => {
    const tutor = api(); const send = vi.fn().mockResolvedValue({ error: 'MCP is disconnected' });
    const { result } = renderHook(() => useVisualTutor('chat-a', send));
    await act(async () => { await result.current.start('Explain'); });
    expect(result.current.error).toBe('MCP is disconnected'); expect(tutor.end).not.toHaveBeenCalled();
    expect(result.current.board?.id).toBe('session');
    expect(result.current.decorate('Draw a follow-up')).toContain('session');
    tutor.start.mockRejectedValue(new Error('Capture permission denied'));
    await act(async () => { await result.current.start('Explain'); });
    expect(result.current.error).toBe('Capture permission denied');
  });
  it.each(CIRCLE_ACTIONS)('grants the same drawing and diagram context for $label and its follow-up', async action => {
    const tutor = api(), send = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useVisualTutor('chat-a', send));
    await act(async () => { await result.current.start(buildCirclePrompt(action, 'My question'), undefined, 'circle-token', 'chat-a'); });
    expect(tutor.start).toHaveBeenCalledWith('chat-a', undefined, 'circle-token');
    expect(send.mock.calls[0][0]).toContain('Drawing is available for every Circle question');
    expect(result.current.decorate('Show a complex diagram')).toContain('step.diagram');
    expect(tutor.start).toHaveBeenCalledTimes(1);
  });
  it('uses the original Circle capture and includes crop-to-display mapping', async () => {
    const tutor=api(); tutor.start.mockResolvedValue({...capture,board:{...board,focus:{x:100,y:200,width:300,height:400}}});
    const send=vi.fn().mockResolvedValue(undefined); const {result}=renderHook(()=>useVisualTutor('chat-a',send));
    await act(async()=>{await result.current.start('Draw the selection',undefined,'capture-token','chat-a');});
    expect(tutor.start).toHaveBeenCalledWith('chat-a',undefined,'capture-token');
    expect(send.mock.calls[0][0]).toContain('only the selected crop');
    expect(send.mock.calls[0][0]).toContain('"x":100');
  });
  it('refuses a Circle result when its originating chat is no longer selected', async () => {
    const tutor=api(); const send=vi.fn(); const {result}=renderHook(()=>useVisualTutor('chat-b',send));
    await act(async()=>{await result.current.start('Explain',undefined,'capture-token','chat-a');});
    expect(tutor.start).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
    expect(result.current.error).toContain('chat changed');
  });
});
