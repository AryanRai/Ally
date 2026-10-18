import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktopInteraction } from './desktopApprovals';
import { InteractionBroker } from '../devices/interactions';
const chat = 'codex:session-1234';
const upload = { mode: 'form', message: 'Allow upload to https://example.test?', requestedSchema: { type: 'object', properties: {} } };
const brokers: InteractionBroker[] = [];
const broker = () => { const b = new InteractionBroker(vi.fn()); brokers.push(b); return b; };
afterEach(() => brokers.splice(0).forEach(b => b.closeAll()));
describe('desktop in-chat decisions', () => {
  it('waits for a genuine decision and retains its result in the original chat', async () => {
    const b = broker(); const waiting = desktopInteraction(() => chat, b)('mcpServer/elicitation/request', upload, new AbortController().signal);
    const request = b.list(chat)[0]; expect(request.detail).toBe(upload.message);
    expect(b.history('codex:other-1234')).toEqual([]);
    b.answer(request.id, { action: 'submit' }, 'desktop');
    expect(await waiting).toEqual({ action: 'accept', content: {}, _meta: null });
    expect(b.history(chat)[0]).toMatchObject({ state: 'answered', decision: 'submit', answeredOn: 'desktop' });
  });
  it('maps denial and abort without approving', async () => {
    const b = broker(); const c = new AbortController();
    const first = desktopInteraction(() => chat, b)('mcpServer/elicitation/request', upload, c.signal);
    b.answer(b.list()[0].id, { action: 'decline' }, 'phone'); expect(await first).toMatchObject({ action: 'decline' });
    const second = desktopInteraction(() => chat, b)('mcpServer/elicitation/request', upload, c.signal);
    c.abort(); expect(await second).toMatchObject({ action: 'cancel' }); expect(b.list()).toEqual([]);
    expect(b.history(chat)[1].state).toBe('cancelled');
  });
  it('shows private text questions only on desktop and never persists their answer', async () => {
    const b = broker(); const waiting = desktopInteraction(() => chat, b)('item/tool/requestUserInput', { questions: [{ id: 'text', question: 'Enter a value', isSecret: true }] }, new AbortController().signal);
    const request = b.list()[0]; expect(request.desktopOnly).toBe(true);
    expect(() => b.answer(request.id, { action: 'submit', values: { text: 'private' } }, 'phone')).toThrow('desktop');
    b.answer(request.id, { action: 'submit', values: { text: 'private' } }, 'desktop');
    expect(await waiting).toEqual({ answers: { text: { answers: ['private'] } } });
    expect(b.history(chat)[0].values).toEqual({});
  });
  it('requires the originating session and rejects unknown RPCs', async () => {
    const b = broker(); const signal = new AbortController().signal;
    await expect(desktopInteraction(() => undefined, b)('mcpServer/elicitation/request', upload, signal)).rejects.toThrow('original chat');
    await expect(desktopInteraction(() => chat, b)('unknown/request', {}, signal)).rejects.toThrow('needs the desktop');
  });
});
