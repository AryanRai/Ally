import { afterEach, describe, expect, it, vi } from 'vitest';
import { WatchApprovals, approvalSpec, watchPermission } from './approvals';
afterEach(() => vi.useRealTimers());
const upload = { mode: 'form', message: 'Upload report.pdf to this Gmail draft?', requestedSchema: { type: 'object', properties: { allow: { type: 'boolean', title: 'Allow upload?' } }, required: ['allow'] } };
describe('watch approvals', () => {
  it('waits for an explicit answer and maps false to a real boolean', async () => {
    const changed = vi.fn(); const queue = new WatchApprovals(changed);
    const result = queue.request('turn', 'mcpServer/elicitation/request', upload, new AbortController().signal);
    const request = queue.list('turn')[0];
    expect(request.fields[0].options.map(o => o.value)).toEqual(['true', 'false']);
    expect(() => queue.answer('turn', request.id, { action: 'submit' })).toThrow('Choose an answer');
    queue.answer('turn', request.id, { action: 'submit', values: { allow: 'false' } });
    expect(await result).toEqual({ action: 'accept', content: { allow: false }, _meta: null });
    expect(queue.list('turn')).toEqual([]);
  });
  it('rejects foreign turns and injected decisions, and handles retransmission exactly once', async () => {
    const queue = new WatchApprovals(vi.fn());
    const result = queue.request('turn', 'item/commandExecution/requestApproval', { command: 'run test', cwd: '/work' }, new AbortController().signal);
    const request = queue.list('turn')[0];
    expect(() => queue.answer('other', request.id, { action: 'accept' })).toThrow('expired');
    expect(() => queue.answer('turn', request.id, { action: 'acceptForSession' })).toThrow('Invalid');
    queue.answer('turn', request.id, { action: 'accept' });
    queue.answer('turn', request.id, { action: 'accept' });
    expect(() => queue.answer('turn', request.id, { action: 'decline' })).toThrow('expired');
    expect(await result).toEqual({ decision: 'accept' });
  });
  it('cancels after ten minutes without approving and rejects a late tap', async () => {
    vi.useFakeTimers(); const queue = new WatchApprovals(vi.fn());
    const result = queue.request('turn', 'mcpServer/elicitation/request', upload, new AbortController().signal);
    const id = queue.list('turn')[0].id;
    await vi.advanceTimersByTimeAsync(600000);
    expect(await result).toMatchObject({ action: 'cancel', content: null });
    expect(() => queue.answer('turn', id, { action: 'submit', values: { allow: 'true' } })).toThrow('expired');
  });
  it('cancels unresolved requests on interruption without affecting another turn', async () => {
    const queue = new WatchApprovals(vi.fn()); const controller = new AbortController();
    const first = queue.request('one', 'mcpServer/elicitation/request', upload, controller.signal);
    const second = queue.request('two', 'mcpServer/elicitation/request', upload, new AbortController().signal);
    controller.abort(); expect(await first).toMatchObject({ action: 'cancel' });
    expect(queue.list('two')).toHaveLength(1);
    queue.cancel('two'); expect(await second).toMatchObject({ action: 'cancel' });
  });
  it('maps connector questions and grants only requested turn-scoped permissions', () => {
    const spec = approvalSpec('item/tool/requestUserInput', { questions: [{ id: 'upload', question: 'Upload?', options: [{ label: 'Accept', description: 'Send this file' }] }] });
    expect(spec.answer({ action: 'submit', values: { upload: 'Accept' } })).toEqual({ answers: { upload: { answers: ['Accept'] } } });
    const permissions = { network: { enabled: true } };
    expect(approvalSpec('item/permissions/requestApproval', { permissions }).answer({ action: 'accept' })).toEqual({ permissions, scope: 'turn' });
  });
  it('does not pretend to approve unsupported forms or browser authentication flows', () => {
    const spec = approvalSpec('mcpServer/elicitation/request', { mode: 'url', message: 'Sign in', url: 'https://example.com' });
    expect(spec.actions).toEqual([{ value: 'cancel', label: 'Cancel' }]);
    expect(spec.detail).toContain('https://example.com');
  });
  it('keeps permission defaults restricted and validates explicit changes', () => {
    expect(watchPermission(undefined)).toBe('readonly');
    expect(watchPermission('full')).toBe('full');
    expect(() => watchPermission('bypass-everything')).toThrow();
  });
});
