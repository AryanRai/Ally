import { afterEach, describe, expect, it, vi } from 'vitest';
import { startUserQuestions } from './userQuestions';
import { WatchApprovals } from '../watch/approvals';

let channel: Awaited<ReturnType<typeof startUserQuestions>> | undefined;
afterEach(() => { channel?.close(); channel = undefined; });
const payload = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ask_user', arguments: { questions: [{ id: 'decision', question: 'Continue this test?', options: ['Continue', 'Cancel test'] }] } } };
const request = (body: unknown, headers = channel!.config.http_headers) => fetch(channel!.config.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('watch question MCP channel', () => {
  it('exposes a real question tool and waits for the scoped UI answer', async () => {
    let visible!: () => void; const shown = new Promise<void>(resolve => { visible = resolve; });
    const queue = new WatchApprovals(() => visible());
    channel = await startUserQuestions((method, params, signal) => queue.request('watch-turn', method, params, signal));
    const list = await (await request({ id: 2, method: 'tools/list' })).json();
    expect(list.result.tools[0].name).toBe('ask_user');
    let completed = false;
    const waiting = request(payload).then(r => { completed = true; return r.json(); });
    await shown;
    expect(completed).toBe(false);
    const approval = queue.list('watch-turn')[0];
    expect(approval.fields[0].label).toBe('Continue this test?');
    queue.answer('watch-turn', approval.id, { action: 'submit', values: { decision: 'Cancel test' } });
    const result = JSON.parse((await waiting).result.content[0].text);
    expect(result).toEqual({ status: 'answered', answers: { decision: { answers: ['Cancel test'] } } });
  });
  it('rejects unauthorized callers and malformed questions before displaying anything', async () => {
    const interact = vi.fn(); channel = await startUserQuestions(interact);
    expect((await request(payload, { Authorization: 'Bearer incorrect' })).status).toBe(401);
    for (const questions of [[], [{ id: 'a', question: 'Choose', options: [7] }], [payload.params.arguments.questions[0], payload.params.arguments.questions[0]]]) {
      const result = await (await request({ ...payload, params: { ...payload.params, arguments: { questions } } })).json();
      expect(result.result.isError).toBe(true);
    }
    expect(interact).not.toHaveBeenCalled();
  });
  it('reports cancel as no decision and clears outstanding input on shutdown', async () => {
    let visible!: () => void; const shown = new Promise<void>(resolve => { visible = resolve; });
    let aborted = false;
    channel = await startUserQuestions((_method, _params, signal) => new Promise(resolve => {
      signal.addEventListener('abort', () => { aborted = true; resolve({ answers: {} }); }); visible();
    }));
    const waiting = request(payload).catch(() => undefined);
    await shown; channel.close(); await waiting;
    expect(aborted).toBe(true);
  });
  it('does not interpret cancellation as consent', async () => {
    channel = await startUserQuestions(async () => ({ answers: {} }));
    const response = await (await request(payload)).json();
    expect(JSON.parse(response.result.content[0].text)).toEqual({ status: 'cancelled', answers: {} });
  });
});
