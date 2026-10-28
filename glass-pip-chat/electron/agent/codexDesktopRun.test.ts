import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexChatUnownedError, CodexDesktopUnavailableError, CodexDesktopClient, assertDesktopIdle, assertDesktopCanStart, desktopFailureMessage, readDesktopActivity, desktopTurns, steerDesktopTurn } from './codexDesktop';
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

const failed = () => ({ ...idle(), threadRuntimeStatus: { type: 'systemError' }, turns: [{ turnId: 'previous', status: 'failed', error: { message: 'unexpected status 402 Payment Required: API key budget exceeded.' } }] });

describe('terminal native error recovery', () => {
  it('allows one explicit fresh send after failure without marking the chat idle or replaying', async () => {
    const { client, setState, broadcast } = desktop();
    const state = failed(); setState(state);
    expect(() => assertDesktopIdle(state, 'same-chat')).toThrow();
    expect(() => assertDesktopCanStart(state, 'same-chat')).not.toThrow();
    expect(state.threadRuntimeStatus.type).toBe('systemError');
    expect(await readDesktopActivity('same-chat')).toMatchObject({ idle: false, canStart: true, running: false, error: expect.stringContaining('budget') });
    client.request.mockClear();
    const events: AgentEvent[] = [];
    runCodexDesktopTurn({ ...opts, prompt: 'new user request' }, event => events.push(event)); await flush();
    expect(client.request).toHaveBeenCalledExactlyOnceWith('thread-follower-start-turn', expect.objectContaining({ conversationId: 'same-chat', turnStart: expect.objectContaining({ request: expect.objectContaining({ input: [{ type: 'text', text: 'new user request', text_elements: [] }] }) }) }), 'desktop-owner', 20000);
    broadcast(active('Recovered', 'completed'));
    expect(events.filter(event => event.kind === 'done')).toHaveLength(1);
  });
  it.each([
    { id: 'another-chat' }, { resumeState: 'needs_resume' }, { requests: [{ id: 'approval' }] },
    { externalRequests: [{ completedAtMs: null }] }, { unconfirmedTurnSubmissions: [{}] },
    { threadGoal: { status: 'active' } }, { turns: [{ status: 'inProgress' }, { status: 'failed' }] },
    { turns: [] }, { turns: [{ status: 'completed' }] }, { threadRuntimeStatus: { type: 'unknown' } },
  ])('keeps uncertainty and active-work guards after failure: %j', async patch => {
    const { client, setState } = desktop(); setState({ ...failed(), ...patch });
    runCodexDesktopTurn(opts, () => {}); await flush();
    expect(client.request).not.toHaveBeenCalled();
  });
  it('explains provider failures and leaves ordinary active state alone', () => {
    expect(desktopFailureMessage(failed())).toContain('After fixing the budget');
    expect(desktopFailureMessage(active('working'))).toBeUndefined();
    expect(desktopFailureMessage({ ...failed(), turns: [{ status: 'failed', error: { message: 'Connection lost' } }] })).toBe('The previous response failed: Connection lost');
  });
});

describe('Codex desktop coordination', () => {
  it('registers commentary and final phase before streamed text without duplicates', async () => {
    const { broadcast } = desktop(); const events: AgentEvent[] = [];
    runCodexDesktopTurn(opts, event => events.push(event)); await flush();
    const state:any=active('Checking', 'inProgress'); state.turns[0].items[0].phase='commentary';
    broadcast(state);
    state.turns[0].items.push({id:'final',type:'agentMessage',phase:'final_answer',text:'Finished'});
    broadcast(state);
    expect(events.filter(e=>e.kind==='text' && e.text.trim()).map(e=>e.kind==='text' && [e.text,e.phase])).toEqual([['Checking','commentary'],['Finished','final_answer']]);
    broadcast({...state,turns:[{...state.turns[0],status:'completed'}]});
    expect(events.filter(e=>e.kind==='text' && e.text==='Finished')).toHaveLength(1);
  });
  it.each(['low','medium','high'] as const)('scopes %s Study effort and conditionally restores the previous desktop setting', async effort => {
    const { client, setState, broadcast } = desktop(); const events: AgentEvent[] = [];
    setState({ ...idle(), latestReasoningEffort: 'medium', latestModel: 'gpt-6.1-sol' });
    runCodexDesktopTurn({ ...opts, reasoningEffort: effort }, event => events.push(event)); await flush();
    expect(client.request).toHaveBeenCalledWith('thread-follower-start-turn', expect.objectContaining({
      turnStart: expect.objectContaining({ request: expect.objectContaining({ effort }) }),
    }), 'desktop-owner', 20000);
    broadcast(active('Done', 'completed')); await flush();
    expect(client.request).toHaveBeenCalledWith('thread-follower-update-thread-settings', {
      conversationId: 'same-chat', threadSettings: { effort: 'medium' },
      condition: { ifEffortEquals: effort, ifModelEquals: 'gpt-6.1-sol' },
    }, 'desktop-owner', 3000);
    expect(events.filter(event => event.kind === 'done')).toHaveLength(1);
  });
  it('resynchronizes malformed patches read-only after acceptance without failing or resending', async () => {
    const { client, broadcast, setState } = desktop(), events: AgentEvent[] = [];
    runCodexDesktopTurn(opts, event => events.push(event)); await flush();
    broadcast(active('first'));
    setState(active('first, recovered', 'completed'));
    const priorSnapshots = client.snapshot.mock.calls.length;
    for (const listener of [...client.listeners]) listener({ method: 'thread-stream-state-changed', sourceClientId: 'desktop-owner', version: 11,
      params: { hostId: 'local', conversationId: 'same-chat', change: { type: 'patches', baseRevision: 2, revision: 3, patches: [{ op: 'replace', path: ['turns', 99], value: {} }] } } });
    await flush();
    expect(client.snapshot.mock.calls.length).toBeGreaterThan(priorSnapshots);
    expect(client.request).toHaveBeenCalledOnce();
    expect(events.some(event => event.kind === 'accepted')).toBe(true);
    expect(events.filter(event => event.kind === 'done')).toEqual([expect.objectContaining({ kind: 'done', isError: false })]);
  });
  it('handles canonical string array indexes without mutating retained snapshots or accepting unsafe paths', () => {
    const original = { turns: [{ items: ['old'] }] };
    expect(applyDesktopPatches(original, [{ op: 'replace', path: ['turns', '0', 'items', '0'], value: 'new' }])).toEqual({ turns: [{ items: ['new'] }] });
    expect(original.turns[0].items).toEqual(['old']);
    expect(() => applyDesktopPatches(original, [{ op: 'replace', path: ['turns', '01'], value: {} }])).toThrow();
    expect(() => applyDesktopPatches(original, [{ op: 'add', path: ['__proto__', 'polluted'], value: true }])).toThrow();
  });
  it('uses the exact chat, streams once, and finishes once without replay', async () => {
    const { client, broadcast } = desktop(), events: AgentEvent[] = [];
    runCodexDesktopTurn(opts, event => events.push(event)); await flush();
    expect(client.request).toHaveBeenCalledWith('thread-follower-start-turn', expect.objectContaining({ conversationId: 'same-chat' }), 'desktop-owner', 20000);
    broadcast(active('hello')); broadcast(active('hello world')); broadcast(active('hello world', 'completed'));
    expect(events.filter(e => e.kind === 'text').map(e => (e as any).text).join('')).toBe('hello world\n\n');
    expect(events.filter(e => e.kind === 'done')).toHaveLength(1);
    // Account cycling relies on a completed turn reporting that it was accepted.
    expect(events.find(e => e.kind === 'done')).toMatchObject({ delivery: 'accepted' });
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
  it('rediscovers an account-switched owner only after confirmed non-delivery, retaining chat and message identity', async () => {
    const { client, broadcast } = desktop(), events: AgentEvent[] = [];
    client.owner.mockResolvedValueOnce('old-owner').mockResolvedValueOnce('desktop-owner');
    client.request.mockRejectedValueOnce(new Error('no-client-found'));
    runCodexDesktopTurn(opts, e => events.push(e)); await flush();
    expect(client.owner.mock.calls).toEqual([['same-chat'],['same-chat']]);
    expect(client.request).toHaveBeenCalledTimes(2);
    const first=client.request.mock.calls[0], retry=client.request.mock.calls[1];
    expect(first[2]).toBe('old-owner');expect(retry[2]).toBe('desktop-owner');
    expect(retry[1]).toEqual(first[1]);expect(retry[1].conversationId).toBe('same-chat');
    broadcast(active('Recovered after account change','completed'));await flush();
    expect(events.at(-1)).toMatchObject({kind:'done',sessionId:'same-chat'});
    expect(events.filter(e=>e.kind==='accepted')).toHaveLength(1);
  });
  it('stops after a second explicit routing rejection and says the message was not sent', async () => {
    const { client }=desktop(), events:AgentEvent[]=[];
    client.request.mockRejectedValue(new Error('no-client-found'));
    runCodexDesktopTurn(opts,e=>events.push(e));await flush();
    expect(client.request).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toMatchObject({isError:true,error:expect.stringContaining('Your message was not sent')});
    expect(events.at(-1)).toMatchObject({error:expect.stringContaining('account connection is still changing')});
  });
  it('does not resend if the replacement owner shows active work', async () => {
    const { client }=desktop(), events:AgentEvent[]=[];
    client.request.mockRejectedValueOnce(new Error('no-client-found'));
    client.snapshot.mockResolvedValueOnce(idle()).mockResolvedValueOnce(active('Another input'));
    runCodexDesktopTurn(opts,e=>events.push(e));await flush();
    expect(client.request).toHaveBeenCalledOnce();expect(events.at(-1)).toMatchObject({isError:true});
  });
  it('honors Stop while rediscovering after a rejected submission', async () => {
    const { client }=desktop(), events:AgentEvent[]=[];let release!:(owner:string)=>void;
    client.request.mockRejectedValueOnce(new Error('no-client-found'));
    client.owner.mockResolvedValueOnce('old-owner').mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    const run=runCodexDesktopTurn(opts,e=>events.push(e));await flush();run.stop();release('desktop-owner');await flush();
    expect(client.request).toHaveBeenCalledOnce();expect(events.filter(e=>e.kind==='done')).toHaveLength(1);
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
    expect(desktopTurnRequest({ ...opts, permission: 'full' }, 'message').turnStart.request).toMatchObject({ approvalPolicy: 'on-request', approvalsReviewer: 'user', sandboxPolicy: { type: 'dangerFullAccess' } });
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

it('falls back only for a confirmed unowned chat before submitting and preserves Stop', async () => {
  const { client } = desktop();
  client.owner.mockRejectedValueOnce(new CodexChatUnownedError());
  const events: AgentEvent[] = [];
  const stop = vi.fn();
  const fallback = vi.fn((emit: (event: AgentEvent) => void) => { emit({ kind: 'session', sessionId: 'same-chat' }); return { stop }; });
  const run = runCodexDesktopTurn(opts, event => events.push(event), undefined, fallback);
  await flush();
  expect(fallback).toHaveBeenCalledOnce();
  expect(client.request).not.toHaveBeenCalled();
  expect(events).toContainEqual({ kind: 'session', sessionId: 'same-chat' });
  run.stop(); expect(stop).toHaveBeenCalledOnce();
});
it('never falls back on a discovery timeout or an uncertain submitted turn', async () => {
  const { client } = desktop();
  const fallback = vi.fn();
  client.owner.mockRejectedValueOnce(new Error('Desktop discovery timed out'));
  runCodexDesktopTurn(opts, () => {}, undefined, fallback); await flush();
  expect(fallback).not.toHaveBeenCalled();
  client.request.mockRejectedValueOnce(new CodexChatUnownedError());
  runCodexDesktopTurn(opts, () => {}, undefined, fallback); await flush();
  expect(fallback).not.toHaveBeenCalled();
});
it('does not start fallback if Stop arrives during owner discovery', async () => {
  const { client } = desktop();
  let reject!: (error: Error) => void;
  client.owner.mockImplementationOnce(() => new Promise((_, no) => { reject = no; }));
  const fallback = vi.fn();
  const run = runCodexDesktopTurn(opts, () => {}, undefined, fallback); await flush();
  run.stop(); reject(new CodexChatUnownedError()); await flush();
  expect(fallback).not.toHaveBeenCalled();
});

it('uses the previous connection if the desktop pipe is definitively absent', async () => {
  desktop();
  vi.mocked(CodexDesktopClient.connect).mockRejectedValueOnce(new CodexDesktopUnavailableError());
  const fallback = vi.fn(() => ({ stop: vi.fn() }));
  runCodexDesktopTurn(opts, () => {}, undefined, fallback); await flush();
  expect(fallback).toHaveBeenCalledOnce();
});


it('steers the exact native chat with a stable receipt and validates the canonical turn', async () => {
  const { client, setState } = desktop();
  const state = active('ongoing'); state.turns[0].turnId = 'our-turn-berry-display-2'; setState(state);
  client.request.mockResolvedValueOnce({ result: { result: { turnId: 'our-turn' } } });
  await expect(steerDesktopTurn(client as unknown as CodexDesktopClient, 'desktop-owner', 'same-chat', 'new guidance', 'receipt')).resolves.toBe(true);
  expect(client.request).toHaveBeenCalledWith('thread-follower-steer-turn', expect.objectContaining({ conversationId: 'same-chat', clientUserMessageId: 'receipt', input: [{ type: 'text', text: 'new guidance', text_elements: [] }] }), 'desktop-owner', 20000);
  client.request.mockResolvedValueOnce({ result: { result: { turnId: 'our-turn' } } });
  await expect(steerDesktopTurn(client as unknown as CodexDesktopClient, 'desktop-owner', 'same-chat', 'see attached', 'image-receipt', ['screen.png'])).resolves.toBe(true);
  expect(client.request).toHaveBeenLastCalledWith('thread-follower-steer-turn', expect.objectContaining({ clientUserMessageId: 'image-receipt', input: [{ type: 'text', text: 'see attached', text_elements: [] }, { type: 'localImage', path: 'screen.png' }] }), 'desktop-owner', 20000);
  client.request.mockResolvedValueOnce({ result: { result: { turnId: 'different-turn' } } });
  await expect(steerDesktopTurn(client as unknown as CodexDesktopClient, 'desktop-owner', 'same-chat', 'new guidance', 'receipt')).rejects.toThrow('expected turn');
  setState(idle()); client.request.mockClear();
  await expect(steerDesktopTurn(client as unknown as CodexDesktopClient, 'desktop-owner', 'same-chat', 'late input', 'receipt')).rejects.toThrow('finished');
  expect(client.request).not.toHaveBeenCalled();
});

