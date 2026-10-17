import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexDesktopClient, assertDesktopIdle, desktopTurns } from './codexDesktop';
import { runCodexDesktopTurn, applyDesktopPatches, desktopTurnRequest } from './codexDesktopRun';
import type { AgentEvent } from './types';

const opts = { provider: 'codex' as const, cwd: 'C:/work', sessionId: 'same-chat', prompt: 'hello', permission: 'readonly' as const };
const idle = () => ({ id: 'same-chat', resumeState: 'resumed', threadRuntimeStatus: { type: 'idle' }, requests: [], turns: [] as any[] });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
function desktop() {
  let state: any = idle(), revision = 1;
  const client = {
    listeners: new Set<(message: any) => void>(),
    owner: vi.fn(async () => 'desktop-owner'),
    snapshot: vi.fn(async () => { broadcast(state); return state; }),
    request: vi.fn(async (_method: string, _params: any, _owner?: string, _timeout?: number): Promise<any> => ({ result: { result: { turn: { id: 'our-turn' } } } })),
    close: vi.fn(),
  };
  const broadcast = (next: any, source = 'desktop-owner', version = 11) => {
    state = next;
    for (const listener of client.listeners) listener({ method: 'thread-stream-state-changed', sourceClientId: source, version, params: { hostId: 'local', conversationId: 'same-chat', change: { type: 'snapshot', conversationState: state, revision: revision++ } } });
  };
  vi.spyOn(CodexDesktopClient, 'connect').mockResolvedValue(client as unknown as CodexDesktopClient);
  return { client, broadcast, setState: (next: any) => { state = next; } };
}
const active = (text: string, status = 'inProgress', requests: any[] = []) => ({ ...idle(), requests,
  threadRuntimeStatus: { type: status === 'inProgress' ? 'active' : 'idle' },
  turns: [{ turnId: 'our-turn', status, params: {}, items: [{ id: 'reply', type: 'agentMessage', text }], completedItemIds: {} }],
});

describe('Codex desktop coordination', () => {
  it('uses the exact chat, streams once, and finishes once without replay', async () => {
    const { client, broadcast } = desktop(), events: AgentEvent[] = [];
    runCodexDesktopTurn(opts, event => events.push(event)); await flush();
    expect(client.request).toHaveBeenCalledWith('thread-follower-start-turn', expect.objectContaining({ conversationId: 'same-chat' }), 'desktop-owner', 20000);
    broadcast(active('hello')); broadcast(active('hello world')); broadcast(active('hello world', 'completed'));
    expect(events.filter(e => e.kind === 'text').map(e => (e as any).text).join('')).toBe('hello world\n\n');
    expect(events.filter(e => e.kind === 'done')).toHaveLength(1);
    expect(client.request).toHaveBeenCalledOnce(); expect(client.close).toHaveBeenCalledOnce();
  });
  it.each([
    { threadRuntimeStatus: { type: 'active' } }, { requests: [{ id: 'approval' }] },
    { externalRequests: [{ completedAtMs: null }] }, { unconfirmedTurnSubmissions: [{}] },
    { threadGoal: { status: 'active' } }, { resumeState: 'needs_resume' },
  ])('refuses a busy or uncertain owner: %j', async patch => {
    const { client, setState } = desktop(), events: AgentEvent[] = [];
    setState({ ...idle(), ...patch }); runCodexDesktopTurn(opts, e => events.push(e)); await flush();
    expect(client.request).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ kind: 'done', isError: true, error: expect.stringContaining('not sent') });
  });
  it('cancels before connection without submitting anything', async () => {
    const { client } = desktop(); let resolve!: (client: CodexDesktopClient) => void;
    vi.mocked(CodexDesktopClient.connect).mockReturnValue(new Promise(r => { resolve = r; }));
    const run = runCodexDesktopTurn(opts, () => {}); run.stop(); resolve(client as unknown as CodexDesktopClient); await flush();
    expect(client.request).not.toHaveBeenCalled();
  });
  it('waits for an in-flight start and interrupts only its returned ID', async () => {
    const { client } = desktop(); let accept!: (response: any) => void;
    client.request.mockImplementationOnce(() => new Promise(resolve => { accept = resolve; }));
    const run = runCodexDesktopTurn(opts, () => {}); await flush(); run.stop();
    expect(client.request).toHaveBeenCalledOnce();
    accept({ result: { result: { turn: { id: 'our-turn' } } } }); await flush();
    expect(client.request).toHaveBeenLastCalledWith('thread-follower-interrupt-turn', { conversationId: 'same-chat', expectedTurnId: 'our-turn', mode: 'user-stop' }, 'desktop-owner');
    expect(client.request).toHaveBeenCalledTimes(2);
  });
  it('does not retry a start with an unknown outcome', async () => {
    const { client } = desktop(), events: AgentEvent[] = [];
    client.request.mockRejectedValueOnce(new Error('timeout'));
    runCodexDesktopTurn(opts, e => events.push(e)); await flush();
    expect(client.request).toHaveBeenCalledOnce();
    expect(events.at(-1)).toMatchObject({ isError: true, error: expect.stringContaining('may already have been accepted') });
  });
  it('forwards only an actual user decision for the current real request', async () => {
    const { client, broadcast } = desktop(); let answer!: (response: unknown) => void;
    const interact = vi.fn(() => new Promise(resolve => { answer = resolve; }));
    const run = runCodexDesktopTurn(opts, () => {}, interact); await flush();
    const request = { id: 7, method: 'mcpServer/elicitation/request', params: { threadId: 'same-chat', turnId: 'our-turn', mode: 'form', message: 'Allow upload?' } };
    broadcast(active('', 'inProgress', [request])); await flush();
    expect(interact).toHaveBeenCalledOnce(); expect(client.request).toHaveBeenCalledOnce();
    answer({ action: 'decline', content: null }); await flush();
    expect(client.request).toHaveBeenLastCalledWith('thread-follower-submit-mcp-server-elicitation-response', { conversationId: 'same-chat', requestId: 7, response: { action: 'decline', content: null } }, 'desktop-owner');
    run.stop(); await flush();
  });
  it('drops an answer after the desktop has resolved its approval', async () => {
    const { client, broadcast } = desktop(); let answer!: (response: unknown) => void;
    const interact = vi.fn(() => new Promise(resolve => { answer = resolve; }));
    const run = runCodexDesktopTurn(opts, () => {}, interact); await flush();
    broadcast(active('', 'inProgress', [{ id: 9, method: 'item/commandExecution/requestApproval', params: { threadId: 'same-chat', turnId: 'our-turn' } }])); await flush();
    broadcast(active('')); answer({ decision: 'accept' }); await flush();
    expect(client.request).toHaveBeenCalledOnce(); run.stop(); await flush();
  });
  it('ignores other clients and fails closed on a changed stream version', async () => {
    const { broadcast, client } = desktop(), events: AgentEvent[] = [];
    runCodexDesktopTurn(opts, e => events.push(e)); await flush();
    broadcast(active('wrong', 'completed'), 'another-owner');
    expect(events.some(e => e.kind === 'text')).toBe(false);
    broadcast(active('wrong'), 'desktop-owner', 99);
    expect(events.at(-1)).toMatchObject({ kind: 'done', isError: true }); expect(client.close).toHaveBeenCalledOnce();
  });
  it('keeps required approval routing and selected permission restrictions', () => {
    expect(desktopTurnRequest(opts, 'message').turnStart.request).toMatchObject({ approvalPolicy: 'on-request', approvalsReviewer: 'user', sandboxPolicy: { type: 'readOnly' } });
    expect(desktopTurnRequest({ ...opts, permission: 'full' }, 'message').turnStart.request).toMatchObject({ approvalPolicy: 'on-request', approvalsReviewer: 'auto_review', sandboxPolicy: { type: 'dangerFullAccess' } });
  });
});

describe('desktop state decoding', () => {
  it('applies nested array patches without changing the previous snapshot', () => {
    const state = { turns: [{ text: 'a' }, { text: 'b' }] };
    const next = applyDesktopPatches(state, [{ op: 'replace', path: ['turns', 0, 'text'], value: 'aa' }, { op: 'remove', path: ['turns', 1] }, { op: 'add', path: ['turns', 1], value: { text: 'c' } }]);
    expect(state.turns[0].text).toBe('a'); expect(next.turns).toEqual([{ text: 'aa' }, { text: 'c' }]);
  });
  it('rejects invalid or prototype-modifying patches', () => {
    expect(() => applyDesktopPatches({}, [{ op: 'add', path: ['__proto__', 'polluted'], value: true }])).toThrow();
    expect(() => applyDesktopPatches({ a: [] }, [{ op: 'replace', path: ['a', 4], value: 1 }])).toThrow();
  });
  it('checks active turns in canonical desktop history as well', () => {
    const state = { ...idle(), turnHistory: { kind: 'canonical', history: { islands: [{ entries: [{ value: 'turn' }] }], entitiesByKey: { turn: { status: 'inProgress' } } } } };
    expect(desktopTurns(state)).toHaveLength(1); expect(() => assertDesktopIdle(state, 'same-chat')).toThrow();
  });
});
