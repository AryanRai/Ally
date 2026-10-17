import { describe, expect, it, vi } from 'vitest';
import { desktopInteraction } from './desktopApprovals';

const upload = { mode: 'form', message: 'Allow upload to https://example.test?', requestedSchema: { type: 'object', properties: {} } };
describe('desktop approval decisions', () => {
  it('waits for the real upload decision and maps Allow once without changing policy', async () => {
    let answer!: (n: number) => void;
    const show = vi.fn(() => new Promise<number>(resolve => { answer = resolve; }));
    const waiting = desktopInteraction(show)('mcpServer/elicitation/request', upload, new AbortController().signal);
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ detail: upload.message, defaultId: 0, cancelId: 0, buttons: ['Cancel request', 'Allow once', 'Deny'] }));
    answer(1);
    expect(await waiting).toEqual({ action: 'accept', content: {}, _meta: null });
  });
  it('returns denial and cancellation exactly', async () => {
    const signal = new AbortController().signal;
    expect(await desktopInteraction(async () => 2)('mcpServer/elicitation/request', upload, signal)).toMatchObject({ action: 'decline' });
    expect(await desktopInteraction(async () => 0)('mcpServer/elicitation/request', upload, signal)).toMatchObject({ action: 'cancel' });
  });
  it('cancels stale decisions when the turn stops', async () => {
    const controller = new AbortController();
    const show = vi.fn(async () => { controller.abort(); return 1; });
    expect(await desktopInteraction(show)('mcpServer/elicitation/request', upload, controller.signal)).toMatchObject({ action: 'cancel' });
    expect((show.mock.calls[0] as any)[0].signal.aborted).toBe(true);
  });
  it('does not silently answer text questions or unsupported browser-auth flows', async () => {
    const show = vi.fn(async () => 0);
    const result = await desktopInteraction(show)('item/tool/requestUserInput', { questions: [{ id: 'text', question: 'Enter a value' }] }, new AbortController().signal);
    expect(result).toEqual({ answers: {} });
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ buttons: ['Cancel request'] }));
    await expect(desktopInteraction(show)('unknown/request', {}, new AbortController().signal)).rejects.toThrow('needs the desktop');
  });
});
