import { afterEach, describe, expect, it, vi } from 'vitest';
import { answerNativeJobApproval, nativeJobChat } from './approvals';
import { desktopInteraction } from '../agent/desktopApprovals';
import { InteractionBroker } from '../devices/interactions';

const chat = 'codex:session-1234';
const brokers: InteractionBroker[] = [];
const broker = () => { const b = new InteractionBroker(vi.fn()); brokers.push(b); return b; };
afterEach(() => brokers.splice(0).forEach(b => b.closeAll()));
const deps = (b: InteractionBroker) => ({ chat: () => chat, interact: (id: () => string) => desktopInteraction(id, b) });
const command = { method: 'item/commandExecution/requestApproval', params: { threadId: 'job-1', command: 'echo hi > output\\a.txt', reason: 'Write the file' }, job: 'write a one-line file to output' };

describe('native background job approvals', () => {
  it('shows a normal approval card in the selected chat and returns only the user answer', async () => {
    const b = broker();
    const waiting = answerNativeJobApproval(command, new AbortController().signal, deps(b));
    const [card] = b.list(chat);
    expect(card.kind).toBe('approval');
    expect(card.detail).toContain('Background job: write a one-line file to output');
    expect(card.detail).toContain('echo hi');
    expect(card.actions.map(a => a.value)).toEqual(['accept', 'decline', 'cancel']);
    b.answer(card.id, { action: 'accept' }, 'watch');
    expect(await waiting).toEqual({ decision: 'accept' });
  });

  it('denial and an abandoned request never approve', async () => {
    const b = broker();
    const denied = answerNativeJobApproval(command, new AbortController().signal, deps(b));
    b.answer(b.list(chat)[0].id, { action: 'decline' }, 'phone');
    expect(await denied).toEqual({ decision: 'decline' });
    const c = new AbortController();
    const dropped = answerNativeJobApproval({ ...command, method: 'item/fileChange/requestApproval' }, c.signal, deps(b));
    c.abort();
    expect(await dropped).toEqual({ decision: 'cancel' });
    expect(b.list(chat)).toEqual([]);
  });

  it('rejects unsupported methods and malformed params before asking', async () => {
    const b = broker();
    await expect(answerNativeJobApproval({ method: 'item/tool/call', params: {} }, new AbortController().signal, deps(b))).rejects.toThrow(/Unsupported/);
    await expect(answerNativeJobApproval({ method: command.method, params: [] }, new AbortController().signal, deps(b))).rejects.toThrow(/Invalid/);
    expect(b.list(chat)).toEqual([]);
  });

  it('uses the notch-selected chat and needs a real session', () => {
    expect(nativeJobChat({ version: 'v', origin: 'notch', selected: { chatId: 'c1', provider: 'codex', sessionId: 'abc-12345', title: 't', permission: 'readonly' } })).toBe('codex:abc-12345');
    expect(() => nativeJobChat({ version: 'v', origin: 'notch', selected: null })).toThrow(/Select a chat/);
  });
});
