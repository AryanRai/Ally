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
  it('returns the server-supported session scope only after the user chooses it',async()=>{
    const queue=new WatchApprovals(vi.fn());
    const params={...upload,_meta:{codex_approval_kind:'mcp_tool_call',connector_id:'outlook',persist:['session','always']}};
    const result=queue.request('turn','mcpServer/elicitation/request',params,new AbortController().signal);
    const request=queue.list('turn')[0];
    expect(request.actions).toContainEqual({value:'submitForSession',label:'Allow for this session'});
    expect(()=>queue.answer('turn',request.id,{action:'submitForSession'})).toThrow('Choose an answer');
    queue.answer('turn',request.id,{action:'submitForSession',values:{allow:'true'}});
    expect(await result).toEqual({action:'accept',content:{allow:true},_meta:{persist:'session'}});
    const ordinary=approvalSpec('mcpServer/elicitation/request',upload);
    expect(ordinary.actions.map(a=>a.value)).not.toContain('submitForSession');
    expect(()=>ordinary.answer({action:'submitForSession'})).toThrow('does not allow');
    expect(approvalSpec('mcpServer/elicitation/request',{...params,_meta:{...params._meta,execution_bound:true}}).actions.map(a=>a.value)).not.toContain('submitForSession');
  });
  it('offers command session approval only when advertised by Codex',()=>{
    const spec=approvalSpec('item/commandExecution/requestApproval',{availableDecisions:['accept','acceptForSession','decline','cancel']});
    expect(spec.actions[0]).toEqual({value:'acceptForSession',label:'Allow for this session'});
    expect(spec.answer({action:'acceptForSession'})).toEqual({decision:'acceptForSession'});
  });
  it('preserves the native Computer Use disclosure, app identity and explicit conversation decision', () => {
    const params = {mode: 'form', serverName: 'cua_repl', message: 'App access requested',
      requestedSchema: {type:'object', properties:{}},
      _meta: {codex_approval_kind:'mcp_tool_call',connector_id:'computer-use',tool_params:{app:'Google Chrome'},persist:['session','always'],riskLevel:'high',subtitle:'Browser contents may be sensitive.'}};
    const spec = approvalSpec('mcpServer/elicitation/request', params);
    expect(spec.title).toBe('Allow ChatGPT to use Google Chrome?');
    expect(spec.detail).toContain('Elevated Risk'); expect(spec.detail).toContain('screenshots');
    expect(spec.detail).toContain('Browser contents may be sensitive.');
    expect(spec.actions).toContainEqual({value:'submit',label:'Allow this conversation'});
    expect(spec.answer({action:'submit'})).toEqual({action:'accept',content:{},_meta:{persist:'session'}});
    expect(spec.answer({action:'decline'})).toEqual({action:'decline',content:null,_meta:null});
    const once = approvalSpec('mcpServer/elicitation/request',{...params,_meta:{...params._meta,persist:['always']}});
    expect(once.answer({action:'submit'})).toEqual({action:'accept',content:{},_meta:null});
    expect(spec.answer({action:'submitAlways'})).toEqual({action:'accept',content:{},_meta:{persist:'always'}});
    expect(()=>once.answer({action:'acceptForSession'})).toThrow('Invalid Computer Use');
  });
  it('never drops fields or execution restrictions when presenting Computer Use requests', () => {
    const params={...upload,_meta:{codex_approval_kind:'mcp_tool_call',connector_id:'computer-use',tool_params:{app:'Google Chrome'},persist:['session']}};
    const spec=approvalSpec('mcpServer/elicitation/request',params);
    expect(spec.fields).toHaveLength(1);
    const restricted=approvalSpec('mcpServer/elicitation/request',{...params,requestedSchema:{type:'object',properties:{}},_meta:{...params._meta,execution_bound:true}});
    expect(restricted.actions.map(a=>a.value)).not.toContain('submitForSession');
    expect(restricted.answer({action:'submit'})).toEqual({action:'accept',content:{},_meta:null});
  });
});
