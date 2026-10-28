import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexRpc } from './codexRpc';
import { runCodexTurn, codexThreadConfig, codexResumeConfig } from './codexRun';
import type { AgentEvent } from './types';
import { startUserQuestions } from './userQuestions';
import { ALLY_BROWSER_INSTRUCTIONS } from './browserContext';
vi.mock('./codexMigration.js', () => ({ interactiveCodexSession: async (_rpc: unknown, id: string) => id }));
// Per-turn MCP savings read the real ~/.codex config; mcpSavings.test covers them.
vi.mock('./mcpSavings.js', () => ({ codexMcpOverrides: () => ({}) }));
vi.mock('./userQuestions.js', () => ({ startUserQuestions: vi.fn(async () => ({ config: { url: 'http://localhost:1234/mcp' }, close: vi.fn() })), WATCH_QUESTION_INSTRUCTIONS: 'Ask on the watch.' }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const opts = { provider: 'codex' as const, cwd: '/work', prompt: 'hello' };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const lastError = (events: AgentEvent[]) => {
  const event = events.at(-1);
  return event?.kind === 'done' ? event.error : undefined;
};

function server() {
  const rpc = {
    onNotification: undefined as CodexRpc['onNotification'],
    onClose: undefined as CodexRpc['onClose'],
    onRequest: undefined as CodexRpc['onRequest'],
    request: vi.fn(async (method: string) => method === 'turn/start' ? { turn: { id: 'turn' } } : { thread: { id: 'thread' } }),
    close: vi.fn(),
  };
  vi.spyOn(CodexRpc, 'connect').mockResolvedValue(rpc as unknown as CodexRpc);
  return rpc;
}
describe('Codex turn lifecycle', () => {
  it('changes access on the existing run without sending input or interrupting', async () => {
    const rpc = server();
    const run = runCodexTurn(opts, () => {}); await flush();
    await expect(run.setPermission!('full')).resolves.toBe('current_reply');
    expect(rpc.request).toHaveBeenLastCalledWith('thread/settings/update', expect.objectContaining({ threadId: 'thread', sandboxPolicy: { type: 'dangerFullAccess' } }));
    expect(rpc.request.mock.calls.filter(([method]) => method === 'turn/start')).toHaveLength(1);
    expect(rpc.request.mock.calls.some(([method]) => method === 'turn/interrupt' || method === 'turn/steer')).toBe(false);
    rpc.onNotification?.('turn/completed', { threadId: 'thread', turn: { status: 'completed' } });
  });
  it('distinguishes unsupported live settings from uncertain delivery', async () => {
    const rpc = server();
    const run = runCodexTurn(opts, () => {}); await flush();
    rpc.request.mockRejectedValueOnce(Error('Method not found'));
    await expect(run.setPermission!('edit')).resolves.toBe('next_message');
    rpc.request.mockRejectedValueOnce(Error('Request timed out'));
    await expect(run.setPermission!('full')).rejects.toThrow('timed out');
    rpc.onNotification?.('turn/completed', { threadId: 'thread', turn: { status: 'completed' } });
    await expect(run.setPermission!('full')).rejects.toThrow('finished');
  });
  it.each(['low','medium','high'] as const)('uses %s effort for Study and restores medium before releasing the writer', async effort => {
    const rpc = server(), events: AgentEvent[] = [];
    rpc.request.mockImplementation(async (method: string) => method === 'turn/start'
      ? { turn: { id: 'turn' } }
      : { thread: { id: 'thread' }, reasoningEffort: 'medium' } as any);
    runCodexTurn({ ...opts, reasoningEffort: effort }, event => events.push(event)); await flush();
    expect(rpc.request).toHaveBeenCalledWith('turn/start', expect.objectContaining({ effort }));
    rpc.onNotification?.('turn/completed', { threadId: 'thread', turn: { status: 'completed' } });
    await flush();
    expect(rpc.request).toHaveBeenCalledWith('thread/settings/update', { threadId: 'thread', effort: 'medium' }, 3000);
    expect(rpc.request.mock.invocationCallOrder.at(-1)).toBeLessThan(rpc.close.mock.invocationCallOrder[0]);
    expect(events.filter(event => event.kind === 'done')).toHaveLength(1);
  });
  it('restores Study effort after a failed turn too', async () => {
    const rpc = server();
    rpc.request.mockImplementation(async (method: string) => method === 'turn/start'
      ? { turn: { id: 'turn' } }
      : { thread: { id: 'thread' }, reasoningEffort: 'high' } as any);
    runCodexTurn({ ...opts, reasoningEffort: 'low' }, () => {}); await flush();
    rpc.onNotification?.('turn/completed', { threadId: 'thread', turn: { status: 'failed', error: { message: 'provider failed' } } });
    await flush();
    expect(rpc.request).toHaveBeenCalledWith('thread/settings/update', { threadId: 'thread', effort: 'high' }, 3000);
    expect(rpc.close).toHaveBeenCalledOnce();
  });
  it('resumes the exact chat with the gateway default model and provider paired', async () => {
    const rpc = server();
    rpc.request.mockResolvedValueOnce({ config: { model: 'gateway-model', model_provider: 'vercel' } } as any);
    runCodexTurn({ ...opts, sessionId: 'old' }, () => {}); await flush();
    expect(rpc.request).toHaveBeenCalledWith('thread/resume', expect.objectContaining({ threadId: 'old', model: 'gateway-model', modelProvider: 'vercel' }));
    expect(rpc.request.mock.calls.some(([method]) => method === 'thread/start' || method === 'thread/fork')).toBe(false);
    rpc.onNotification?.('turn/completed', { threadId: 'old', turn: { status: 'completed' } });
  });
  it('keeps an explicit model while using the configured provider', async () => {
    const rpc = server();
    rpc.request.mockResolvedValueOnce({ config: { model: 'gateway-default', model_provider: 'vercel' } } as any);
    expect(await codexResumeConfig(rpc as unknown as CodexRpc, { model: 'chosen-model' })).toEqual({ model: 'chosen-model', modelProvider: 'vercel' });
  });
  it('does not submit when effective provider settings cannot be read', async () => {
    const rpc = server(); const events: AgentEvent[] = [];
    rpc.request.mockRejectedValueOnce(new Error('configuration unavailable'));
    runCodexTurn({ ...opts, sessionId: 'old' }, e => events.push(e)); await flush();
    expect(rpc.request.mock.calls.map(([method]) => method)).toEqual(['config/read']);
    expect(lastError(events)).toContain('configuration unavailable');
  });
  it.each(['desktop', 'watch'] as const)('keeps required forms interactive in Full access on %s', async surface => {
    const rpc = server();
    const interact = vi.fn(async () => ({ action: 'decline', content: null, _meta: null }));
    runCodexTurn({ ...opts, permission: 'full' }, () => {}, undefined, interact, surface); await flush();
    expect(rpc.request).toHaveBeenCalledWith('thread/start', expect.objectContaining({ approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: 'danger-full-access' }));
    const request = { threadId: 'thread', turnId: 'turn', mode: 'form', message: 'Allow this upload?' };
    expect(await rpc.onRequest?.('mcpServer/elicitation/request', request, 1)).toMatchObject({ action: 'decline' });
    expect(interact).toHaveBeenCalledOnce();
    rpc.onNotification?.('turn/completed', { threadId: 'thread', turn: { status: 'completed' } });
  });
  it('restores human review when switching away from Full access', () => {
    for (const permission of ['readonly', 'edit'] as const) {
      expect(codexThreadConfig({ ...opts, permission }, true)).toMatchObject({
        approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: permission === 'readonly' ? 'read-only' : 'workspace-write',
      });
    }
  });
  it('enables desktop approvals without attaching the watch question channel', async () => {
    const rpc = server();
    vi.mocked(startUserQuestions).mockClear();
    const interact = vi.fn(async () => ({ action: 'accept', content: {}, _meta: null }));
    runCodexTurn(opts, () => {}, undefined, interact, 'desktop'); await flush();
    expect(rpc.request).toHaveBeenCalledWith('thread/start', expect.objectContaining({ approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: 'workspace-write' }));
    expect(startUserQuestions).not.toHaveBeenCalled();
    expect(await rpc.onRequest?.('mcpServer/elicitation/request', { threadId: 'thread', turnId: 'turn', mode: 'form' }, 1)).toMatchObject({ action: 'accept' });
    rpc.onNotification?.('turn/completed', { threadId: 'thread', turn: { status: 'completed' } });
  });
  it('supplies Chrome context on resume while preserving robot configuration', async () => {
    const rpc = server();
    runCodexTurn({ ...opts, sessionId: 'existing', robot: { instructions: 'Robot context', mcpUrl: 'http://localhost:9000/mcp' } }, () => {});
    await flush();
    expect(rpc.request).toHaveBeenCalledWith('thread/resume', expect.objectContaining({
      threadId: 'existing', developerInstructions: ALLY_BROWSER_INSTRUCTIONS + '\n\nRobot context',
      config: { mcp_servers: { howyouseeme: { url: 'http://localhost:9000/mcp' } } },
    }));
    rpc.onNotification?.('turn/completed', { threadId: 'existing', turn: { status: 'completed' } });
  });
  it('reports a writer conflict without submitting or retrying the message', async () => {
    const rpc = server(); const events: AgentEvent[] = [];
    rpc.request.mockResolvedValueOnce({ config: {} } as any).mockRejectedValueOnce(new Error('thread old already has an active writer'));
    runCodexTurn({ ...opts, sessionId: 'old' }, event => events.push(event)); await flush();
    expect(events.at(-1)).toMatchObject({ kind: 'done', isError: true, error: expect.stringContaining('Your message was not sent') });
    expect(lastError(events)).toContain('Enable Codex desktop connection in Ally Settings');
    expect(rpc.request.mock.calls.some(([method]) => method === 'turn/start')).toBe(false);
    expect(rpc.request.mock.calls.map(([method]) => method)).toEqual(['config/read', 'thread/resume']);
    expect(events.some(event => event.kind === 'tool_start')).toBe(false);
    expect(rpc.close).toHaveBeenCalledOnce();
  });
  it('never replays when turn/start fails after resume', async () => {
    const rpc = server(); const events: AgentEvent[] = [];
    rpc.request.mockImplementation(async method => {
      if (method === 'turn/start') throw new Error('already has an active writer');
      return { thread: { id: 'old' } } as any;
    });
    runCodexTurn({ ...opts, sessionId: 'old' }, event => events.push(event)); await flush();
    expect(rpc.request.mock.calls.map(([method]) => method)).toEqual(['config/read', 'thread/resume', 'turn/start']);
    expect(rpc.request.mock.calls.filter(([m]) => m === 'turn/start')).toHaveLength(1);
    expect(lastError(events)).toContain('may already have been accepted');
    expect(lastError(events)).not.toContain('Your message was not sent');
  });
  it('explains an unavailable desktop owner without asking to enable an enabled setting', async () => {
    const rpc = server(); const events: AgentEvent[] = [];
    rpc.request.mockResolvedValueOnce({ config: {} } as any).mockRejectedValueOnce(new Error('Already has an ACTIVE WRITER'));
    runCodexTurn({ ...opts, sessionId: 'old', codexDesktop: true }, event => events.push(event)); await flush();
    expect(lastError(events)).toContain('Open the same chat in Codex');
    expect(lastError(events)).toContain('Your message was not sent');
    expect(lastError(events)).not.toContain('Enable');
    expect(rpc.request.mock.calls.map(([method]) => method)).toEqual(['config/read', 'thread/resume']);
  });
  it('never submits if the connection closes while resume is pending', async () => {
    const rpc = server(); const events: AgentEvent[] = [];
    let resumed!: (value: any) => void;
    rpc.request.mockResolvedValueOnce({ config: {} } as any).mockReturnValueOnce(new Promise(resolve => { resumed = resolve; }));
    runCodexTurn({ ...opts, sessionId: 'old' }, event => events.push(event)); await flush();
    rpc.onClose?.(new Error('connection lost'));
    resumed({ thread: { id: 'old' } }); await flush();
    expect(rpc.request.mock.calls.map(([method]) => method)).toEqual(['config/read', 'thread/resume']);
    expect(events.filter(event => event.kind === 'done')).toHaveLength(1);
  });
  it('routes watch approvals to the user while preserving the selected sandbox', async () => {
    const rpc = server(); const interact = vi.fn(async () => ({ decision: 'decline' }));
    runCodexTurn({ ...opts, permission: 'readonly' }, () => {}, undefined, interact); await flush();
    expect(rpc.request).toHaveBeenCalledWith('thread/start', expect.objectContaining({ approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: 'read-only' }));
    expect(rpc.request).toHaveBeenCalledWith('thread/start', expect.objectContaining({ config: { mcp_servers: { ally_watch: { url: 'http://localhost:1234/mcp' } } }, developerInstructions: ALLY_BROWSER_INSTRUCTIONS + '\n\nAsk on the watch.' }));
    expect(await rpc.onRequest?.('item/commandExecution/requestApproval', { threadId: 'thread', turnId: 'turn', command: 'test' }, 1)).toEqual({ decision: 'decline' });
    await expect(rpc.onRequest?.('item/commandExecution/requestApproval', { threadId: 'other' }, 2)).rejects.toThrow('no longer active');
    expect(interact).toHaveBeenCalledTimes(1);
    rpc.onNotification?.('turn/completed', { threadId: 'thread', turn: { status: 'completed' } });
    expect((await vi.mocked(startUserQuestions).mock.results.at(-1)!.value).close).toHaveBeenCalled();
  });
  it('aborts an approval when the server resolves or cancels it', async () => {
    const rpc = server(); let signal: AbortSignal | undefined;
    const interact = vi.fn((_method, _params, s: AbortSignal) => { signal = s; return new Promise(resolve => s.addEventListener('abort', () => resolve({ decision: 'cancel' }))); });
    runCodexTurn(opts, () => {}, undefined, interact); await flush();
    const waiting = rpc.onRequest?.('item/commandExecution/requestApproval', { threadId: 'thread', turnId: 'turn' }, 3);
    rpc.onNotification?.('serverRequest/resolved', { threadId: 'thread', requestId: 3 });
    expect(signal?.aborted).toBe(true); expect(await waiting).toEqual({ decision: 'cancel' });
    rpc.onNotification?.('turn/completed', { threadId: 'thread', turn: { status: 'completed' } });
  });
  it('uses structured text/images, releases ownership and completes once', async () => {
    const rpc = server(); const events: AgentEvent[] = [];
    runCodexTurn({ ...opts, images: ['/tmp/image.png'] }, e => events.push(e));
    await flush();
    expect(rpc.request).toHaveBeenCalledWith('turn/start', { threadId: 'thread', input: [{ type: 'text', text: 'hello' }, { type: 'localImage', path: '/tmp/image.png' }] });
    rpc.onNotification?.('turn/completed', { threadId: 'thread', turn: { status: 'completed' } });
    rpc.onClose?.(new Error('closed'));
    expect(rpc.close).toHaveBeenCalledTimes(1);
    expect(events.filter(e => e.kind === 'done')).toHaveLength(1);
  });
  it('steers only its active turn without changing permission or interrupting', async () => {
    const rpc = server(); const run = runCodexTurn(opts, () => {}); await flush();
    rpc.request.mockResolvedValueOnce({ turnId: 'turn' } as any);
    expect(await run.steer('also check reconnect')).toBe(true);
    expect(rpc.request).toHaveBeenLastCalledWith('turn/steer', { threadId: 'thread', expectedTurnId: 'turn', input: [{ type: 'text', text: 'also check reconnect' }] });
    expect(rpc.request.mock.calls.some(([method]) => method === 'turn/interrupt')).toBe(false);
    rpc.onNotification?.('turn/completed', { threadId: 'thread', turn: { status: 'completed' } });
    await expect(run.steer('too late')).rejects.toThrow('finished');
  });
  it('interrupts the actual turn, then force-closes a stalled cancellation', async () => {
    vi.useFakeTimers(); const rpc = server(); const events: AgentEvent[] = [];
    const run = runCodexTurn(opts, e => events.push(e));
    await flush(); run.stop();
    expect(rpc.request).toHaveBeenCalledWith('turn/interrupt', { threadId: 'thread', turnId: 'turn' }, 3000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(rpc.close).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ kind: 'done', sessionId: 'thread' });
  });
  it('keeps greetings ephemeral and never resumes their supplied session', async () => {
    const rpc = server(); const events: AgentEvent[] = [];
    runCodexTurn({ ...opts, ephemeral: true, sessionId: 'old' }, e => events.push(e));
    await flush();
    expect(rpc.request).toHaveBeenCalledWith('thread/start', expect.objectContaining({ ephemeral: true }));
    expect(rpc.request.mock.calls.some(([m]) => m === 'thread/resume')).toBe(false);
    expect(events.some(e => e.kind === 'session')).toBe(false);
    rpc.onNotification?.('turn/completed', { threadId: 'thread', turn: { status: 'completed' } });
  });
  it('does not submit a prompt when canceled while initializing', async () => {
    let connected!: (rpc: CodexRpc) => void;
    const rpc = server();
    vi.mocked(CodexRpc.connect).mockReturnValue(new Promise(resolve => { connected = resolve; }));
    const events: AgentEvent[] = [];
    const run = runCodexTurn(opts, e => events.push(e)); run.stop();
    connected(rpc as unknown as CodexRpc); await flush();
    expect(rpc.request).not.toHaveBeenCalled();
    expect(rpc.close).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
  });
});
it('recovers exact owner only after rejected resume before submission', async () => {
 const rpc=server(); const events: AgentEvent[]=[];
 rpc.request.mockImplementation(async(method:string)=> { if(method==='config/read') return {config:{}} as any; if(method==='thread/resume') throw new Error('thread has an active writer'); return {} as any; });
 const recovered={stop:vi.fn(),steer:vi.fn(async()=>true)};
 const recovery=vi.fn((emit:(event:AgentEvent)=>void)=>{emit({kind:'accepted',sessionId:'same-chat',turnId:'single-turn'});return recovered});
 const run=runCodexTurn({...opts,sessionId:'same-chat',codexDesktop:true,images:['attachment.png']},e=>events.push(e),undefined,undefined,'desktop',recovery);
 await flush();
 expect(recovery).toHaveBeenCalledTimes(1);
 expect(rpc.request.mock.calls.some(([method])=>method==='turn/start'||method==='thread/start'||method==='thread/fork')).toBe(false);
 expect(events.some(e=>e.kind==='accepted'&&e.sessionId==='same-chat')).toBe(true);
 expect(await run.steer('extra')).toBe(true);run.stop();expect(recovered.stop).toHaveBeenCalledOnce();
});
it('never recovers after turn submission is uncertain', async()=>{
 const rpc=server();const recovery=vi.fn();
 rpc.request.mockImplementation(async(method:string)=>{if(method==='config/read')return {config:{}} as any;if(method==='thread/resume')return {thread:{id:'same-chat'}} as any;if(method==='turn/start')throw new Error('active writer');return {} as any;});
 const events:AgentEvent[]=[];runCodexTurn({...opts,sessionId:'same-chat',codexDesktop:true},e=>events.push(e),undefined,undefined,'desktop',recovery);await flush();
 expect(recovery).not.toHaveBeenCalled();expect(events.at(-1)).toMatchObject({kind:'done',isError:true,error:expect.stringContaining('may already have been accepted')});
});

