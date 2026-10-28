// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import type { AgentEvent } from '../agent/types';

const fake = vi.hoisted(() => ({ root: '', load: vi.fn(), start: vi.fn(), stop: vi.fn(), activity: vi.fn(), steer: vi.fn(), input: vi.fn(), access: vi.fn(), desktopAccess: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => fake.root }, webContents:{getAllWebContents:()=>[]} }));
vi.mock('../agent/runner.js', () => ({ startAgentRun: fake.start, stopAgentRun: fake.stop, steerAgentRun: fake.input, canStopAgentSession: () => false, stopAgentSession: () => false, changeAgentSessionAccess: fake.access }));
vi.mock('../agent/sessions.js', () => ({ listAgentSessions: vi.fn(), loadAgentSession: fake.load }));
vi.mock('../agent/codexHistory.js', () => ({ listCodexChats: vi.fn(), loadCodexChat: fake.load, repairCodexDeviceTitle: vi.fn(async () => {}) }));
vi.mock('../agent/codexDesktop.js', () => ({ readDesktopActivity: fake.activity, steerExternalDesktopChat: fake.steer, updateExternalDesktopAccess: fake.desktopAccess }));
vi.mock('../agent/runningSessions.js', () => ({ listRunningSessions: vi.fn(async () => []), listSessionActivity: vi.fn(async () => []), sessionActivityText: vi.fn(() => "Public progress") }));
vi.mock('../speech/runtime.js', () => ({ ensureSpeechRuntime: vi.fn(async () => ({})), getSpeechRuntimeStatus: vi.fn(async () => ({ ready: true, state: 'ready' })) }));
vi.mock('../speech/settings.js', () => ({ speechSettings: vi.fn(() => ({ cloud: false })) }));
vi.mock('./speechSocket.js', () => ({ attachSpeechSocket: () => () => {} }));
vi.mock('../devices/socket.js', () => ({ attachDeviceSocket: () => () => {} }));
vi.mock('../notifications.js', () => ({ notifyReply: vi.fn() }));
vi.mock('../agent/providerUsage.js', () => ({ readProviderUsage: vi.fn(async () => ({ codex: { windows: [] }, claude: { allowanceAvailable: false }, recorded: null })) }));
vi.mock('./transport.js', () => ({ startWatchTransport: vi.fn() }));
vi.mock('./cloudTunnel.js', () => ({ startCloudTunnel: vi.fn() }));
import { startWatchBridge } from './bridge';
import { messageQueue } from '../agent/messageQueue';
import { interruptedSessions, RESUME_PROMPT } from '../agent/interrupted';
import { chatSelection } from '../agent/selection';
import { liveStudyReplies } from './liveStudyReply';
import { interactions } from '../devices/interactions';

let stop: (() => void) | undefined;

it('serves authenticated current preview with public progress without scanning every running chat or sending a turn',async()=>{
  fake.root=fs.mkdtempSync(path.join(os.tmpdir(),'ally-preview-route-'));
  fs.writeFileSync(path.join(fake.root,'watch-bridge.json'),JSON.stringify({enabled:true,token:'synthetic-only',port:0,sessions:{}}));
  fs.writeFileSync(path.join(fake.root,'watch-chats.json'),JSON.stringify([{id:'preview-chat',provider:'claude',sessionId:'original',title:'Preview',cwd:fake.root,messages:[],updatedAt:1}]));
  fake.load.mockResolvedValue({running:true,messages:[{role:'user',content:'Do the work',timestamp:1},{role:'assistant',content:'Checking',timestamp:2,segments:[{type:'text',phase:'commentary',content:'Checking current files.'}]}]});
  const create=vi.spyOn(http,'createServer');stop=startWatchBridge(()=>({defaultCwd:fake.root,permission:'readonly'}));
  const server=create.mock.results[0].value as http.Server;if(!server.listening)await once(server,'listening');
  const endpoint=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1/chats/preview-chat/preview`;
  expect((await fetch(endpoint)).status).toBe(401);
  const response=await fetch(endpoint,{headers:{Authorization:'Bearer synthetic-only'}});
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({chat:{id:'preview-chat'},running:true,progress:[{text:'Checking current files.'}],messages:[{text:'Do the work'},{commentary:['Checking current files.']}]});
  expect(fake.start).not.toHaveBeenCalled();expect(fake.stop).not.toHaveBeenCalled();
});

it('authenticates shared output mute without starting or stopping an agent',async()=>{
  fake.root=fs.mkdtempSync(path.join(os.tmpdir(),'ally-bridge-mute-'));
  fs.writeFileSync(path.join(fake.root,'watch-bridge.json'),JSON.stringify({enabled:true,token:'synthetic-only',port:0,sessions:{}}));
  const create=vi.spyOn(http,'createServer');stop=startWatchBridge(()=>({defaultCwd:fake.root,permission:'readonly'}));
  const server=create.mock.results[0].value as http.Server;if(!server.listening)await once(server,'listening');
  const endpoint=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1/audio-mute`;
  expect((await fetch(endpoint)).status).toBe(401);
  const headers={Authorization:'Bearer synthetic-only','Content-Type':'application/json'};
  expect(await(await fetch(endpoint,{headers})).json()).toEqual({muted:false});
  expect(await(await fetch(endpoint,{headers,method:'POST',body:JSON.stringify({muted:true})})).json()).toEqual({muted:true});
  expect(JSON.parse(fs.readFileSync(path.join(fake.root,'output-mute.json'),'utf8'))).toEqual({muted:true});
  expect(fake.start).not.toHaveBeenCalled();expect(fake.stop).not.toHaveBeenCalled();
});

it('does not kill or replay a quiet long-running tool at the display timeout and still honors completion and Stop', async () => {
  fake.root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-long-tool-'));
  messageQueue.configure(path.join(fake.root, 'queue.json'));
  fs.writeFileSync(path.join(fake.root, 'watch-bridge.json'), JSON.stringify({ enabled: true, token: 'synthetic-only', port: 0, sessions: {} }));
  fs.writeFileSync(path.join(fake.root, 'watch-chats.json'), JSON.stringify([{ id: 'chat', provider: 'claude', sessionId: 'original', title: 'Synthetic', cwd: fake.root, messages: [], updatedAt: 1 }]));
  fake.load.mockResolvedValue({ cwd: fake.root, messages: [] });
  let emit!: (event: AgentEvent) => void;
  fake.start.mockImplementation(async (_options, send) => { emit = event => send('run', event); return 'run'; });
  const timers = vi.spyOn(globalThis, 'setTimeout');
  const create = vi.spyOn(http, 'createServer');
  stop = startWatchBridge(() => ({ defaultCwd: fake.root, permission: 'readonly' }));
  const server = create.mock.results[0].value as http.Server;
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = async (route: string, body?: object) => (await fetch(base + route, {
    headers: { Authorization: 'Bearer synthetic-only', 'Content-Type': 'application/json' },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  })).json();
  const accepted = await request('/v1/messages', { provider: 'claude', chatId: 'chat', requestId: 'quiet', permission: 'readonly', text: 'Synthetic long build' });
  await vi.waitFor(() => expect(fake.start).toHaveBeenCalledOnce());
  const watchdogs = () => timers.mock.calls.filter(call => call[1] === 300000);
  const beforeTool = watchdogs().length;
  emit({ kind: 'tool_start', id: 'build', name: 'shell', input: { cmd: 'synthetic-build' } });
  expect(watchdogs().length).toBeGreaterThan(beforeTool);
  // Fire the actual watchdog callback without advancing network timers.
  (watchdogs().at(-1)![0] as () => void)();
  expect(await request(`/v1/turns/${accepted.id}`)).toMatchObject({ status: 'thinking', activity: expect.stringContaining('Waiting for an agent update') });
  expect(fake.stop).not.toHaveBeenCalled();
  expect(fake.start).toHaveBeenCalledOnce();
  emit({ kind: 'tool_end', id: 'build', output: 'Finished' });
  emit({ kind: 'text', text: 'Build finished.' });
  emit({ kind: 'done' });
  expect(await request(`/v1/turns/${accepted.id}`)).toMatchObject({ status: 'done', reply: { text: 'Build finished.' } });
  const next = await request('/v1/messages', { provider: 'claude', chatId: 'chat', requestId: 'explicit-stop', permission: 'readonly', text: 'Another synthetic build' });
  await vi.waitFor(() => expect(fake.start).toHaveBeenCalledTimes(2));
  expect(await request(`/v1/turns/${next.id}/stop`, {})).toMatchObject({ stopped: true });
  expect(fake.stop).toHaveBeenCalledWith('run');
  expect(await request(`/v1/turns/${next.id}`)).toMatchObject({ status: 'error', error: 'Stopped by you' });
});

it('changes exact-chat access while working, authenticates and reports deferred or failed changes without a send', async () => {
  fake.root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-live-access-'));
  fs.writeFileSync(path.join(fake.root, 'watch-bridge.json'), JSON.stringify({ enabled: true, token: 'synthetic-only', port: 0, sessions: {} }));
  fs.writeFileSync(path.join(fake.root, 'watch-chats.json'), JSON.stringify([{ id: 'chat', provider: 'codex', sessionId: 'original', title: 'Same chat', cwd: fake.root, updatedAt: 1, messages: [] }]));
  fake.load.mockResolvedValue({ sessionId: 'original', revision: 'r', messages: [] });
  const create = vi.spyOn(http, 'createServer');
  stop = startWatchBridge(() => ({ defaultCwd: fake.root, permission: 'readonly', codexDesktop: true }));
  const server = create.mock.results[0].value as http.Server; await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${(server.address() as any).port}/v1/chats/chat/access`;
  const headers = { Authorization: 'Bearer synthetic-only', 'Content-Type': 'application/json' };
  const body = JSON.stringify({ permission: 'full' });
  expect((await fetch(endpoint, { method: 'POST', body })).status).toBe(401);
  expect((await fetch(endpoint, { method: 'POST', headers: { ...headers, Origin: 'https://example.com' }, body })).status).toBe(401);
  expect(fake.access).not.toHaveBeenCalled();
  const previousStarts = fake.start.mock.calls.length, previousStops = fake.stop.mock.calls.length;
  fake.access.mockResolvedValueOnce('current_reply');
  const changed = await (await fetch(endpoint, { method: 'POST', headers, body })).json();
  expect(changed).toMatchObject({ permission: 'full', scope: 'current_reply' });
  expect(fake.access).toHaveBeenLastCalledWith('codex:original', 'full');
  fake.access.mockResolvedValueOnce('next_message');
  expect(await (await fetch(endpoint, { method: 'POST', headers, body })).json()).toMatchObject({ scope: 'next_message' });
  fake.access.mockRejectedValueOnce(Error('Access update timed out; outcome unknown'));
  const uncertain = await fetch(endpoint, { method: 'POST', headers, body });
  expect(uncertain.status).toBe(409);
  expect(await uncertain.json()).not.toHaveProperty('permission');
  expect(fake.start.mock.calls).toHaveLength(previousStarts);
  expect(fake.stop.mock.calls).toHaveLength(previousStops);
  expect(fake.desktopAccess).not.toHaveBeenCalled();
});

it('rejects a forged phone execution destination before creating chats or starting an agent', async () => {
  fake.root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-execution-choice-'));
  fs.writeFileSync(path.join(fake.root, 'watch-bridge.json'), JSON.stringify({ enabled: true, token: 'synthetic-only', port: 0, sessions: {} }));
  fs.writeFileSync(path.join(fake.root, 'watch-chats.json'), '[]');
  const create = vi.spyOn(http, 'createServer');
  stop = startWatchBridge(() => ({ defaultCwd: fake.root, permission: 'readonly' }));
  const server = create.mock.results[0].value as http.Server;
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const headers = { Authorization: 'Bearer synthetic-only', 'Content-Type': 'application/json' };
  for (const executionLocation of ['phone', 'unknown', null]) {
    const response = await fetch(base + '/v1/messages', { method: 'POST', headers,
      body: JSON.stringify({ provider: 'codex', requestId: 'never-submit', text: 'Synthetic request', permission: 'readonly', executionLocation }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain(executionLocation === 'phone' ? 'unavailable' : 'explicitly');
  }
  expect(fake.start).not.toHaveBeenCalled();
  expect(JSON.parse(fs.readFileSync(path.join(fake.root, 'watch-chats.json'), 'utf8'))).toEqual([]);
});

it('lets Study display and answer the same pending decision exactly once with bridge authentication',async()=>{
  fake.root=fs.mkdtempSync(path.join(os.tmpdir(),'ally-study-decision-'));
  fs.writeFileSync(path.join(fake.root,'watch-bridge.json'),JSON.stringify({enabled:true,token:'synthetic-only',port:0,sessions:{}}));
  const create=vi.spyOn(http,'createServer');stop=startWatchBridge(()=>({defaultCwd:fake.root,permission:'readonly'}));
  const server=create.mock.results[0].value as http.Server;if(!server.listening)await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1/interactions`, headers={Authorization:'Bearer synthetic-only','Content-Type':'application/json'};
  const answer=vi.fn(),cancel=interactions.add({id:'study-test-decision',chatId:'codex:synthetic-session',kind:'approval',title:'Synthetic decision',detail:'Test only',fields:[],actions:[{label:'Allow',value:'accept'}],expiresAt:Date.now()+30000},answer,()=>{});
  try{
    expect((await fetch(base)).status).toBe(401);
    expect((await (await fetch(base,{headers})).json()).requests).toEqual(expect.arrayContaining([expect.objectContaining({id:'study-test-decision'})]));
    const url=base+'/study-test-decision/answer',options={method:'POST',headers,body:JSON.stringify({action:'accept'})};
    expect((await fetch(url,options)).status).toBe(200);expect(answer).toHaveBeenCalledOnce();
    expect((await (await fetch(base,{headers})).json()).requests).not.toEqual(expect.arrayContaining([expect.objectContaining({id:'study-test-decision'})]));
    expect((await fetch(url,options)).ok).toBe(false);expect(answer).toHaveBeenCalledOnce();
  }finally{cancel();}
});

it('exposes provider usage only after bridge authentication and rejects browser Origins', async () => {
  fake.root=fs.mkdtempSync(path.join(os.tmpdir(),'ally-usage-bridge-'));
  fs.writeFileSync(path.join(fake.root,'watch-bridge.json'),JSON.stringify({enabled:true,token:'synthetic-only',port:0,sessions:{}}));
  const create=vi.spyOn(http,'createServer');
  stop=startWatchBridge(()=>({defaultCwd:fake.root,permission:'readonly',codexPath:'synthetic-cli'}));
  const server=create.mock.results[0].value as http.Server;
  if(!server.listening)await once(server,'listening');
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1/usage`;
  const {readProviderUsage}=await import('../agent/providerUsage.js');
  expect((await fetch(url)).status).toBe(401);
  expect((await fetch(url,{headers:{Authorization:'Bearer synthetic-only',Origin:'http://other'}})).status).toBe(401);
  expect(readProviderUsage).not.toHaveBeenCalled();
  const response=await fetch(url,{headers:{Authorization:'Bearer synthetic-only'}});
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({claude:{allowanceAvailable:false}});
  expect(readProviderUsage).toHaveBeenCalledWith('synthetic-cli');expect(fake.start).not.toHaveBeenCalled();
});

it('shares guarded notch navigation and preserves a complete native drawing reply on the exact chat', async () => {
  fake.root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-native-selection-'));
  messageQueue.configure(path.join(fake.root, 'queue.json'));
  fs.writeFileSync(path.join(fake.root, 'watch-bridge.json'), JSON.stringify({ enabled: true, token: 'synthetic-only', port: 0, sessions: {} }));
  fs.writeFileSync(path.join(fake.root, 'watch-chats.json'), JSON.stringify([{ id: 'study', provider: 'codex', sessionId: 'original', title: 'Study', cwd: fake.root, messages: [], updatedAt: 1 }]));
  fake.load.mockResolvedValue({ cwd: fake.root, messages: [] });
  let emit!: (event: AgentEvent) => void;
  fake.start.mockImplementation(async (_options, send) => { emit = event => send('run', event); return 'run'; });
  const create = vi.spyOn(http, 'createServer');
  stop = startWatchBridge(() => ({ defaultCwd: fake.root, permission: 'readonly' }));
  const server = create.mock.results[0].value as http.Server;
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const auth = { Authorization: 'Bearer synthetic-only', 'Content-Type': 'application/json' };
  const initial = await (await fetch(base + '/v1/selection', { headers: auth })).json();
  expect((await fetch(base + '/v1/selection')).status).toBe(401);
  expect((await fetch(base + '/v1/selection', { headers: { ...auth, Origin: 'http://other' } })).status).toBe(401);
  const choose = { chatId: 'study', provider: 'codex', permission: 'readonly', version: initial.version };
  const chosen = await (await fetch(base + '/v1/selection', { method: 'POST', headers: auth, body: JSON.stringify(choose) })).json();
  expect(chosen).toMatchObject({ accepted: true, selected: { sessionId: 'original', chatId: 'study' } });
  expect(chatSelection.snapshot().selected?.sessionId).toBe('original');
  expect(fake.start).not.toHaveBeenCalled();
  const stale = await (await fetch(base + '/v1/selection', { method: 'POST', headers: auth, body: JSON.stringify(choose) })).json();
  expect(stale.accepted).toBe(false);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64');
  const asset=(await (await fetch(base+'/v1/attachments',{method:'POST',headers:{...auth,'Content-Type':'image/png','X-Ally-Filename':'screen.png'},body:png})).json()).attachment;
  const accepted = await (await fetch(base + '/v1/messages', { method: 'POST', headers: auth, body: JSON.stringify({ provider: 'codex', chatId: 'study', permission: 'readonly', requestId: 'native', text: 'Explain this image', attachments:[asset.id], presentation: 'native-study', context: '{"widthInPixels":1920}' }) })).json();
  await vi.waitFor(() => expect(fake.start).toHaveBeenCalledOnce());
  const options = fake.start.mock.calls[0][0];
  expect(options.sessionId).toBe('original'); expect(options.prompt).toContain('fenced javascript drawing program'); expect(options.prompt).toContain('1920');
  expect(options.permission).toBe('readonly');
  expect(options.prompt).toContain('Use available browser, computer and other tools');
  expect(options.prompt).toContain('do not ask the user to switch chat');
  expect(options.reasoningEffort).toBe('medium');
  expect(options.prompt).not.toContain('phone and watch');
  expect(options.prompt.match(/Explain this image/g)).toHaveLength(1);
  expect(options.images).toHaveLength(1);
  expect(fs.readFileSync(options.images[0])).toEqual(png);
  expect(options.prompt).not.toContain(options.images[0]);
  const program = '```javascript\nstep(0); say("' + 'A'.repeat(12500) + '"); circle(200,200,60,{tone:"blue"});\n```';
  expect((await fetch(base + `/v1/turns/${accepted.id}/events`)).status).toBe(401);
  expect((await fetch(base + `/v1/turns/${accepted.id}/events`, { headers: {...auth,Origin:'http://other'} })).status).toBe(401);
  const stream = await fetch(base + `/v1/turns/${accepted.id}/events`, { headers: auth });
  expect(stream.headers.get('content-type')).toBe('text/event-stream');
  const reader = stream.body!.getReader(), decoder = new TextDecoder();
  expect(decoder.decode((await reader.read()).value)).toContain('"type":"snapshot"');
  emit({ kind: 'thinking', text: 'Private deliberation' });
  emit({ kind: 'text', itemId: 'progress', phase: 'commentary', text: 'I’ll prepare the visual reference.' });
  const progress = decoder.decode((await reader.read()).value);
  expect(progress).toContain('visual reference'); expect(progress).not.toContain('Private deliberation');
  expect(liveStudyReplies.read('codex:original')).toMatchObject({text:'I’ll prepare the visual reference.',working:true,question:'Explain this image'});
  expect(liveStudyReplies.read('codex:original')?.text).not.toContain('Private deliberation');
  emit({ kind: 'text', itemId: 'progress', phase: 'commentary', text: '\n\n' });
  expect(decoder.decode((await reader.read()).value)).toContain('\\n\\n');
  expect((await (await fetch(base + `/v1/turns/${accepted.id}`, { headers: auth })).json()).status).toBe('thinking');
  emit({ kind: 'text', itemId: 'answer', phase: 'final_answer', text: program.slice(0,40) });
  const firstDelta=decoder.decode((await reader.read()).value);
  expect(firstDelta).toContain('"type":"text"');
  expect((await (await fetch(base + `/v1/turns/${accepted.id}`, { headers: auth })).json()).status).toBe('thinking');
  emit({ kind: 'text', itemId: 'answer', phase: 'final_answer', text: program.slice(40) }); emit({ kind: 'done' });
  let tail=''; while(true){const part=await reader.read();if(part.done)break;tail+=decoder.decode(part.value);}
  expect(tail).toContain('"type":"done"');
  expect(fake.start).toHaveBeenCalledOnce();
  const result = await (await fetch(base + `/v1/turns/${accepted.id}`, { headers: auth })).json();
  expect(result.reply.text).toBe('A'.repeat(12000));
  expect(tail).toContain('circle(200,200,60');
  expect(result.reply.text).not.toContain('visual reference');
});
it('continues the selected empty desktop chat and links its first native session without a standalone fork',async()=>{
  fake.root=fs.mkdtempSync(path.join(os.tmpdir(),'ally-empty-study-'));
  messageQueue.configure(path.join(fake.root,'queue.json'));
  fs.writeFileSync(path.join(fake.root,'watch-bridge.json'),JSON.stringify({enabled:true,token:'synthetic-only',port:0,sessions:{}}));
  const selected={chatId:'local-empty',provider:'codex' as const,codexAccountId:'11111111-1111-1111-1111-111111111111',title:'New local chat',cwd:fake.root,permission:'readonly' as const};
  chatSelection.set(selected,chatSelection.snapshot().version,'desktop');
  let emit!:(event:AgentEvent)=>void;
  fake.start.mockImplementation(async(_options,send)=>{emit=event=>send('run',event);return 'run';});
  const create=vi.spyOn(http,'createServer');stop=startWatchBridge(()=>({defaultCwd:fake.root,permission:'readonly'}));
  const server=create.mock.results[0].value as http.Server;if(!server.listening)await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`,headers={Authorization:'Bearer synthetic-only','Content-Type':'application/json'};
  const history=await fetch(base+'/v1/chats/local-empty',{headers});
  expect(history.status).toBe(200);expect(fake.start).not.toHaveBeenCalled();expect(fake.load).not.toHaveBeenCalled();
  const response=await fetch(base+'/v1/messages',{method:'POST',headers,body:JSON.stringify({provider:'codex',chatId:'local-empty',permission:'readonly',requestId:'first',text:'Teach this',presentation:'native-study',context:'{}'})});
  expect(response.status).toBe(202);await vi.waitFor(()=>expect(fake.start).toHaveBeenCalledOnce());
  expect(fake.start.mock.calls[0][0].sessionId).toBeUndefined();
  expect(fake.start.mock.calls[0][0].cwd).toBe(fake.root);
  expect(fake.start.mock.calls[0][0].codexAccountId).toBe(selected.codexAccountId);
  emit({kind:'session',sessionId:'real-session'});
  expect(chatSelection.snapshot().selected).toMatchObject({...selected,sessionId:'real-session'});
  emit({kind:'text',text:'```javascript\nstep(1);say("Hello");\n```'});emit({kind:'done'});
  await vi.waitFor(()=>expect(JSON.parse(fs.readFileSync(path.join(fake.root,'watch-chats.json'),'utf8'))[0].sessionId).toBe('real-session'));
});

afterEach(() => { stop?.(); vi.restoreAllMocks(); vi.clearAllMocks(); if (fake.root) fs.rmSync(fake.root, { recursive: true, force: true }); });

it('publishes authenticated exact-chat activity without resuming chats or acknowledging replies',async()=>{
  fake.root=fs.mkdtempSync(path.join(os.tmpdir(),'ally-assistant-activity-'));
  messageQueue.configure(path.join(fake.root,'queue.json'));
  fs.writeFileSync(path.join(fake.root,'watch-bridge.json'),JSON.stringify({enabled:true,token:'synthetic-only',port:0,sessions:{}}));
  fs.writeFileSync(path.join(fake.root,'watch-chats.json'),JSON.stringify([{id:'device-chat',provider:'codex',sessionId:'original',title:'Ally',cwd:fake.root,messages:[],updatedAt:1}]));
  vi.mocked((await import('../agent/runningSessions.js')).listSessionActivity).mockResolvedValue([
    {id:'original',provider:'codex',title:'Ally',updatedAt:Date.now(),status:'running'},
    {id:'ready',provider:'claude',title:'Portfolio',updatedAt:Date.now(),status:'completed'},
  ]);
  const create=vi.spyOn(http,'createServer');
  stop=startWatchBridge(()=>({defaultCwd:fake.root,permission:'readonly'}));
  const server=create.mock.results[0].value as http.Server;
  if(!server.listening) await once(server,'listening');
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/v1/assistant/activity`;
  expect((await fetch(url)).status).toBe(401);
  const response=await fetch(url,{headers:{Authorization:'Bearer synthetic-only'}});
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({running:1,ready:1,chats:[{id:'device-chat',status:'running'},{id:'claude:ready',status:'completed'}]});
  expect(fake.start).not.toHaveBeenCalled(); expect(fake.load).not.toHaveBeenCalled();
});

it('authenticates assistant routing and offers previous chats without creating or submitting anything', async () => {
  fake.root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-assistant-route-'));
  messageQueue.configure(path.join(fake.root, 'queue.json'));
  fs.writeFileSync(path.join(fake.root, 'watch-bridge.json'), JSON.stringify({ enabled: true, token: 'synthetic-only', port: 0, sessions: {} }));
  fs.writeFileSync(path.join(fake.root, 'watch-chats.json'), '[]');
  vi.mocked((await import('../agent/codexHistory.js')).listCodexChats).mockResolvedValue([{ id: 'voice', provider: 'codex', title: 'Ally voice button', cwd: fake.root, updatedAt: 1 }]);
  vi.mocked((await import('../agent/sessions.js')).listAgentSessions).mockResolvedValue([]);
  const create = vi.spyOn(http, 'createServer');
  stop = startWatchBridge(() => ({ defaultCwd: fake.root, permission: 'readonly' }));
  const server = create.mock.results[0].value as http.Server;
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (body: object, token = 'synthetic-only') => fetch(base + '/v1/assistant/route', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  expect((await post({ text: 'Ally voice' }, 'wrong')).status).toBe(401);
  expect((await post({ text: '' })).status).toBe(400);
  const result = await post({ text: 'Fix that Ally voice button' });
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ kind: 'choose', chats: [{ id: 'codex:voice', provider: 'codex' }], execution: {
    version: 1, suggested: 'pc', options: [{ location: 'pc', available: true }, { location: 'phone', available: false }],
  } });
  expect(fake.start).not.toHaveBeenCalled();
  expect(JSON.parse(fs.readFileSync(path.join(fake.root, 'watch-chats.json'), 'utf8'))).toEqual([]);
});

it('pauses automatic queue delivery after provider failure and permits an explicit recovery send', async () => {
  fake.root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-error-recovery-'));
  messageQueue.configure(path.join(fake.root, 'message-queue.json'));
  fs.writeFileSync(path.join(fake.root, 'watch-bridge.json'), JSON.stringify({ enabled: true, token: 'synthetic-only', port: 0, sessions: {} }));
  fs.writeFileSync(path.join(fake.root, 'watch-chats.json'), JSON.stringify([{ id: 'chat', provider: 'codex', sessionId: 'original', title: 'Synthetic', cwd: fake.root, messages: [], updatedAt: 1 }]));
  fake.load.mockResolvedValue({ cwd: fake.root, messages: [] });
  fake.activity.mockResolvedValue({ running: false, idle: false, canStart: true, error: 'The previous response failed because the API provider budget was exceeded.' });
  fake.start.mockResolvedValue('recovery-run');
  const create = vi.spyOn(http, 'createServer');
  stop = startWatchBridge(() => ({ defaultCwd: fake.root, permission: 'readonly', codexDesktop: true }));
  const server = create.mock.results[0].value as http.Server;
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (route: string, body: object) => fetch(base + route, { method: 'POST', headers: { Authorization: 'Bearer synthetic-only', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  messageQueue.enqueue('codex:original', { id: 'saved', text: 'user follow-up', permission: 'readonly' });
  await vi.waitFor(() => expect(messageQueue.snapshot('codex:original').items[0]).toMatchObject({ state: 'failed', error: expect.stringContaining('budget') }), { timeout: 3000 });
  expect(fake.start).not.toHaveBeenCalled(); expect(fake.steer).not.toHaveBeenCalled();
  // Pending decisions/unknown state must never turn into steering an idle chat.
  fake.activity.mockResolvedValueOnce({ running: false, idle: false, canStart: false });
  const blocked = await post('/v1/queue/chat', { action: 'send', id: 'saved', revision: messageQueue.snapshot('codex:original').revision });
  expect(blocked.ok).toBe(false);
  expect(fake.start).not.toHaveBeenCalled(); expect(fake.steer).not.toHaveBeenCalled();
  const sent = await post('/v1/queue/chat', { action: 'send', id: 'saved', revision: messageQueue.snapshot('codex:original').revision });
  expect(sent.ok).toBe(true);
  expect(fake.start).toHaveBeenCalledOnce(); expect(fake.steer).not.toHaveBeenCalled();
  expect(fake.start.mock.calls[0][0]).toMatchObject({ sessionId: 'original', codexDesktop: true, permission: 'readonly', prompt: expect.stringContaining('user follow-up') });
  expect(messageQueue.snapshot('codex:original').items).toEqual([]);
}, 8000);

it('publishes partial replies before completion and keeps exact-session routing, retries, continuation and Stop', async () => {
  fake.root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-live-bridge-'));
  messageQueue.configure(path.join(fake.root, 'message-queue.json'));
  fs.writeFileSync(path.join(fake.root, 'watch-bridge.json'), JSON.stringify({ enabled: true, token: 'synthetic-only', port: 0, sessions: {} }));
  fs.writeFileSync(path.join(fake.root, 'watch-chats.json'), JSON.stringify([{ id: 'chat', provider: 'claude', sessionId: 'original', title: 'Synthetic', cwd: path.join(fake.root, 'deleted'), messages: [], updatedAt: 1 }]));
  fake.load.mockResolvedValue({ cwd: fake.root, messages: [] });
  let emit!: (event: AgentEvent) => void;
  fake.start.mockImplementation(async (_options, send) => { emit = event => send('run', event); return 'run'; });
  const create = vi.spyOn(http, 'createServer');
  stop = startWatchBridge(() => ({ defaultCwd: fake.root, permission: 'readonly' }));
  const server = create.mock.results[0].value as http.Server;
  if (!server.listening) await once(server, 'listening');
  const address = server.address() as { port: number };
  const request = async (route: string, body?: object) => {
    const r = await fetch(`http://127.0.0.1:${address.port}${route}`, { headers: { Authorization: 'Bearer synthetic-only', 'Content-Type': 'application/json' }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    expect(r.ok).toBe(true); return r.json();
  };
  const message = { provider: 'claude', chatId: 'chat', requestId: 'one', permission: 'readonly', text: 'Synthetic test only' };
  const accepted = await request('/v1/messages', message);
  await vi.waitFor(() => expect(fake.start).toHaveBeenCalledTimes(1));
  expect(await request('/v1/chats/chat')).toMatchObject({ running: true, activeTurnId: accepted.id });
  expect(fake.start.mock.calls[0][0]).toMatchObject({ cwd: fake.root, sessionId: 'original', permission: 'readonly' });
  expect(fake.start.mock.calls[0][0].prompt).toContain('Plain text and Markdown replies are supported.');
  expect(fake.start.mock.calls[0][0].prompt).not.toMatch(/round smartwatch|concise and glanceable/);
  emit({ kind: 'tool_start', id: 'browser', name: 'cua_repl.js', input: { title: 'Check browser connection' } });
  expect(await request(`/v1/turns/${accepted.id}`)).toMatchObject({ activity: 'Using browser · Check browser connection' });
  emit({ kind: 'tool_update', id: 'browser', input: { title: 'Inspect Instagram' } });
  expect(await request(`/v1/turns/${accepted.id}`)).toMatchObject({ activity: 'Using browser · Inspect Instagram' });
  emit({ kind: 'tool_end', id: 'browser', isError: true, output: 'Connection timed out' });
  expect(await request(`/v1/turns/${accepted.id}`)).toMatchObject({ activity: 'Browser action failed · Inspect Instagram', steps: [expect.objectContaining({ status: 'error', name: 'cua_repl.js' })] });
  emit({ kind: 'text', text: 'Checking…\n{"text":"Hel' });
  expect(await request(`/v1/turns/${accepted.id}`)).toMatchObject({ status: 'thinking', liveText: 'Checking…\n\nHel' });
  expect((await request('/v1/messages', message)).id).toBe(accepted.id);
  expect(fake.start).toHaveBeenCalledTimes(1);
  emit({ kind: 'text', text: 'lo","components":[]}' });
  emit({ kind: 'continuation' });
  expect((await request(`/v1/turns/${accepted.id}`)).liveText).toBe('');
  const complete = '## Follow-up complete\n\nA detailed explanation.\n\n- **First point**\n- `Second point`';
  emit({ kind: 'text', text: complete });
  emit({ kind: 'done' });
  expect(await request(`/v1/turns/${accepted.id}`)).toMatchObject({ status: 'done', reply: { text: complete, components: [] } });
  expect(await request('/v1/chats/chat')).toMatchObject({ running: false });
  const progressTurn = await request('/v1/messages', { ...message, requestId: 'public-progress' });
  await vi.waitFor(() => expect(fake.start).toHaveBeenCalledTimes(2));
  emit({ kind: 'text', itemId: 'progress-one', phase: 'commentary', text: 'Checking the files.' });
  expect(await request(`/v1/turns/${progressTurn.id}`)).toMatchObject({liveText:'',progress:[{text:'Checking the files.',complete:false,kind:'commentary'}]});
  emit({ kind: 'tool_start', id: 'inspection', name: 'read', input: { path: 'synthetic' } });
  expect(await request(`/v1/turns/${progressTurn.id}`)).toMatchObject({progress:[{text:'Checking the files.',complete:true}]});
  emit({ kind: 'text', itemId: 'answer', phase: 'final_answer', text: 'The answer.' });
  emit({ kind: 'done' });
  expect(await request(`/v1/turns/${progressTurn.id}`)).toMatchObject({reply:{text:'The answer.'},progress:[{text:'Checking the files.',complete:true}]});
  const next = await request('/v1/messages', { ...message, requestId: 'two' });
  await vi.waitFor(() => expect(fake.start).toHaveBeenCalledTimes(3));
  emit({ kind: 'text', text: 'Partial work remains visible' });
  await request(`/v1/turns/${next.id}/stop`, {});
  expect(await request(`/v1/turns/${next.id}`)).toMatchObject({ status: 'error', liveText: 'Partial work remains visible', error: 'Stopped by you' });
  expect(fake.stop).toHaveBeenCalledWith('run');
});

it('authenticates media, keeps uploads inert, routes attachments to the original session and retains screenshots', async () => {
  fake.root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-attachment-bridge-'));
  messageQueue.configure(path.join(fake.root, 'message-queue.json'));
  fs.writeFileSync(path.join(fake.root, 'watch-bridge.json'), JSON.stringify({ enabled: true, token: 'synthetic-only', port: 0, sessions: {} }));
  fs.writeFileSync(path.join(fake.root, 'watch-chats.json'), JSON.stringify([{ id: 'chat', provider: 'codex', sessionId: 'original', title: 'Synthetic', cwd: fake.root, messages: [], updatedAt: 1 }]));
  fake.load.mockResolvedValue({ cwd: fake.root, messages: [] });
  let emit!: (event: AgentEvent) => void;
  fake.start.mockImplementation(async (_options, send) => { emit = event => send('run', event); return 'run'; });
  const create = vi.spyOn(http, 'createServer');
  stop = startWatchBridge(() => ({ defaultCwd: fake.root, permission: 'readonly' }));
  const server = create.mock.results[0].value as http.Server;
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const auth = { Authorization: 'Bearer synthetic-only' };
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=', 'base64');
  expect((await fetch(`${base}/v1/attachments`, { method: 'POST', body: png })).status).toBe(401);
  expect((await fetch(`${base}/v1/attachments`, { method: 'POST', headers: { ...auth, Origin: 'https://example.com' }, body: png })).status).toBe(401);
  const upload = await fetch(`${base}/v1/attachments`, { method: 'POST', headers: { ...auth, 'Content-Type': 'image/png', 'X-Ally-Filename': 'screen.png' }, body: png });
  expect(upload.status).toBe(201);
  const asset = (await upload.json()).attachment;
  expect(fake.start).not.toHaveBeenCalled();
  expect((await fetch(base + asset.url)).status).toBe(401);
  expect((await fetch(`${base}/v1/attachments/${'f'.repeat(64)}`, { headers: auth })).status).toBe(404);
  const download = await fetch(base + asset.url, { headers: auth });
  expect(download.headers.get('x-content-type-options')).toBe('nosniff');
  expect(Buffer.from(await download.arrayBuffer())).toEqual(png);
  const send = (body: object) => fetch(`${base}/v1/messages`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const message = { provider: 'codex', chatId: 'chat', permission: 'readonly', requestId: 'media', text: '', attachments: [asset.id] };
  const receipt = await send(message); expect(receipt.status).toBe(202); const turn = await receipt.json();
  await vi.waitFor(() => expect(fake.start).toHaveBeenCalledTimes(1));
  const options = fake.start.mock.calls[0][0];
  expect(options).toMatchObject({ sessionId: 'original', permission: 'readonly' });
  expect(options.images).toHaveLength(1);
  expect(fs.readFileSync(options.images[0])).toEqual(png);
  expect((await (await send(message)).json()).id).toBe(turn.id);
  expect((await send({ ...message, text: 'Changed' })).status).toBe(409);
  const approvalController = new AbortController();
  const approvalResult = fake.start.mock.calls[0][3]('mcpServer/elicitation/request', { mode: 'form', message: 'Synthetic confirmation', requestedSchema: { type: 'object', properties: {} }, content: [{ type: 'image', mimeType: 'image/png', data: png.toString('base64') }] }, approvalController.signal);
  const waiting = await (await fetch(`${base}/v1/turns/${turn.id}`, { headers: auth })).json();
  expect(waiting.approvals[0].attachments).toHaveLength(1);
  approvalController.abort(); await approvalResult;
  emit({ kind: 'tool_start', id: 'browser', name: 'browser' });
  emit({ kind: 'tool_end', id: 'browser', output: 'Synthetic screenshot', images: [`data:image/png;base64,${png.toString('base64')}`] });
  emit({ kind: 'text', text: '{"text":"Done","components":[]}' }); emit({ kind: 'done' });
  const result = await (await fetch(`${base}/v1/turns/${turn.id}`, { headers: auth })).json();
  expect(result.attachments).toHaveLength(1);
  await vi.waitFor(() => {
    const saved = JSON.parse(fs.readFileSync(path.join(fake.root, 'watch-chats.json'), 'utf8'));
    expect(saved[0].messages[0].attachments[0].id).toBe(asset.id);
    expect(saved[0].messages[1].attachments).toHaveLength(1);
  });
  expect(fake.start).toHaveBeenCalledTimes(1);
});


it('queues behind a native turn, preserves receipts and cancels queued work without stopping the owner', async () => {
  fake.root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-native-queue-'));
  messageQueue.configure(path.join(fake.root, 'message-queue.json'));
  fs.writeFileSync(path.join(fake.root, 'watch-bridge.json'), JSON.stringify({ enabled: true, token: 'synthetic-only', port: 0, sessions: {} }));
  fs.writeFileSync(path.join(fake.root, 'watch-chats.json'), JSON.stringify([{ id: 'chat', provider: 'codex', sessionId: 'original', title: 'Synthetic', cwd: fake.root, messages: [], updatedAt: 1 }]));
  fake.load.mockResolvedValue({ cwd: fake.root, messages: [] });
  fake.activity.mockResolvedValue({ running: true, idle: false }); fake.steer.mockResolvedValue(true);
  fake.start.mockResolvedValue('queued-run');
  const create = vi.spyOn(http, 'createServer');
  stop = startWatchBridge(() => ({ defaultCwd: fake.root, permission: 'readonly', codexDesktop: true }));
  const server = create.mock.results[0].value as http.Server;
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (route: string, body: object) => fetch(base + route, { method: 'POST', headers: { Authorization: 'Bearer synthetic-only', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const message = { provider: 'codex', chatId: 'chat', requestId: 'queue-one', text: 'later', queueAfterCurrent: true };
  const accepted = await (await post('/v1/messages', message)).json();
  await vi.waitFor(() => expect(fake.activity).toHaveBeenCalledWith('original'), { timeout: 2500 });
  expect(fake.start).not.toHaveBeenCalled();
  expect((await (await post('/v1/messages', message)).json()).id).toBe(accepted.id);
  expect((await post('/v1/messages', { ...message, queueAfterCurrent: false })).status).toBe(409);
  expect(accepted.queued).toBe(true);
  await post('/v1/queue/chat', { action: 'cancel', id: accepted.id, revision: accepted.queue.revision });
  fake.activity.mockResolvedValue({ running: false, idle: true });
  await new Promise(resolve => setTimeout(resolve, 3100));
  expect(fake.start).not.toHaveBeenCalled(); expect(fake.stop).not.toHaveBeenCalled();
  const steer = { requestId: 'steer-one', text: 'guidance', mode: 'steer' };
  expect((await post('/v1/chats/chat/input', steer)).status).toBe(200);
  expect((await post('/v1/chats/chat/input', steer)).status).toBe(200);
  expect(fake.steer).toHaveBeenCalledExactlyOnceWith('original', 'guidance', 'steer-one', undefined);
  expect((await post('/v1/chats/chat/input', { ...steer, text: 'changed' })).status).toBe(409);
  fake.activity.mockResolvedValue(undefined);
  await post('/v1/messages', { ...message, requestId: 'queue-two' });
  expect(fake.start).not.toHaveBeenCalled();
  fake.activity.mockResolvedValue({ running: false, idle: true });
  await vi.waitFor(() => expect(fake.start).toHaveBeenCalledOnce(), { timeout: 4500 });
  expect(fake.start.mock.calls[0][0]).toMatchObject({ sessionId: 'original', codexDesktop: true });
}, 15000);


it('accepts attachment-only queue and steer inputs, preserving upload and request identity', async () => {
  fake.root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-input-media-'));
  messageQueue.configure(path.join(fake.root, 'message-queue.json'));
  fs.writeFileSync(path.join(fake.root, 'watch-bridge.json'), JSON.stringify({ enabled: true, token: 'synthetic-only', port: 0, sessions: {} }));
  fs.writeFileSync(path.join(fake.root, 'watch-chats.json'), JSON.stringify([{ id: 'chat', provider: 'codex', sessionId: 'original', title: 'Synthetic', cwd: fake.root, messages: [], updatedAt: 1 }]));
  fake.load.mockResolvedValue({ cwd: fake.root, messages: [] });
  fake.start.mockResolvedValue('run'); fake.input.mockResolvedValue('queued'); fake.steer.mockResolvedValue(true);
  const create = vi.spyOn(http, 'createServer'); stop = startWatchBridge(() => ({ defaultCwd: fake.root, permission: 'readonly', codexDesktop: true }));
  const server = create.mock.results[0].value as http.Server;
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const auth = { Authorization: 'Bearer synthetic-only' };
  const post = (route: string, body: object) => fetch(base + route, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  expect(await (await fetch(base + '/v1/status', { headers: auth })).json()).toMatchObject({ inputAttachments: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=', 'base64');
  const asset = (await (await fetch(base + '/v1/attachments', { method: 'POST', headers: { ...auth, 'Content-Type': 'image/png', 'X-Ally-Filename': 'screen.png' }, body: png })).json()).attachment;
  const turn = await (await post('/v1/messages', { provider: 'codex', chatId: 'chat', permission: 'readonly', requestId: 'first', text: 'ongoing task' })).json();
  await vi.waitFor(() => expect(fake.start).toHaveBeenCalledOnce());
  const input = { text: '', attachments: [asset.id], requestId: 'shared', mode: 'queue' };
  expect((await post(`/v1/turns/${turn.id}/input`, input)).status).toBe(200);
  expect((await post(`/v1/turns/${turn.id}/input`, input)).status).toBe(200);
  expect(fake.input).not.toHaveBeenCalled();
  const queue = await (await fetch(base+'/v1/queue/chat', { headers: auth })).json();
  expect(queue.queue.items).toMatchObject([{ id: 'shared', text: '', attachments: [{ name: 'screen.png' }] }]);
  const queued = messageQueue.claim('codex:original');
  expect(queued?.images?.[0]).toContain(asset.id);
  messageQueue.fail('codex:original', 'shared', 'Synthetic paused input');
  expect((await post(`/v1/turns/${turn.id}/input`, { ...input, attachments: [] })).status).toBe(400);
  expect((await post(`/v1/turns/${turn.id}/input`, { ...input, text: 'changed' })).status).toBe(409);
  const steer = { ...input, requestId: 'steer-image', mode: 'steer' };
  expect((await post('/v1/chats/chat/input', steer)).status).toBe(200);
  expect((await post('/v1/chats/chat/input', steer)).status).toBe(200);
  expect(fake.steer).toHaveBeenCalledExactlyOnceWith('original', expect.stringContaining('screen.png'), 'steer-image', [expect.stringContaining(asset.id)]);
  expect((await post('/v1/chats/chat/input', { ...steer, attachments: ['f'.repeat(64)] })).status).toBe(400);
});

it('shares unread receipts across clients, never marks history reads, and rejects stale revisions', async () => {
  const { configureUnread, completeUnread } = await import('../agent/unread.js');
  fake.root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-read-bridge-'));
  configureUnread(path.join(fake.root, 'read-state.json'));
  messageQueue.configure(path.join(fake.root, 'message-queue.json'));
  fs.writeFileSync(path.join(fake.root, 'watch-bridge.json'), JSON.stringify({ enabled: true, token: 'synthetic-only', port: 0, sessions: {} }));
  fs.writeFileSync(path.join(fake.root, 'watch-chats.json'), JSON.stringify([{ id: 'chat', provider: 'claude', sessionId: 'original', title: 'Synthetic', cwd: fake.root, messages: [], updatedAt: 1 }]));
  fake.load.mockResolvedValue({ cwd: fake.root, messages: [{ role: 'assistant', content: 'Reply', timestamp: 1 }] });
  const create = vi.spyOn(http, 'createServer'); stop = startWatchBridge(() => ({ defaultCwd: fake.root, permission: 'readonly' }));
  const server = create.mock.results[0].value as http.Server;
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const auth = { Authorization: 'Bearer synthetic-only', 'Content-Type': 'application/json' };
  const read = async () => (await fetch(base + '/v1/read-states', { headers: auth })).json();
  const receipt = completeUnread('claude', 'original', 'one');
  const history = await (await fetch(base + '/v1/chats/chat', { headers: auth })).json();
  expect(history.readState).toEqual(receipt); expect((await read()).states[0].unread).toBe(true);
  expect((await fetch(base + '/v1/read-states')).status).toBe(401);
  const acknowledge = async (body: unknown) => (await fetch(base + '/v1/read-state', { method: 'POST', headers: auth, body: JSON.stringify(body) })).json();
  const newer = completeUnread('claude', 'original', 'two');
  expect(await acknowledge(receipt)).toEqual({ accepted: false });
  expect((await read()).states[0].unread).toBe(true);
  expect(await acknowledge(newer)).toEqual({ accepted: true });
  expect((await read()).states[0].unread).toBe(false);
});


it('exposes a shared stopped receipt and accepts one explicit same-chat Resume from any device', async () => {
  fake.root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-resume-bridge-'));
  interruptedSessions.configure(path.join(fake.root, 'interrupted.json'));
  messageQueue.configure(path.join(fake.root, 'queue.json'));
  fs.writeFileSync(path.join(fake.root, 'watch-bridge.json'), JSON.stringify({ enabled: true, token: 'synthetic-only', port: 0, sessions: {} }));
  fs.writeFileSync(path.join(fake.root, 'watch-chats.json'), JSON.stringify([{ id: 'chat', provider: 'claude', sessionId: 'original', title: 'Synthetic', cwd: fake.root, messages: [], updatedAt: 1 }]));
  fake.load.mockResolvedValue({ cwd: fake.root, messages: [] });
  fake.stop.mockImplementation(() => { interruptedSessions.stopped('claude:original'); return true; });
  fake.start.mockImplementation(async (options) => { interruptedSessions.starting('claude:original', options.resumeToken); return 'run'; });
  const create = vi.spyOn(http, 'createServer');
  stop = startWatchBridge(() => ({ defaultCwd: fake.root, permission: 'readonly' }));
  const server = create.mock.results[0].value as http.Server;
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = (route: string, body?: object) => fetch(base + route, { headers: { Authorization: 'Bearer synthetic-only', 'Content-Type': 'application/json' }, ...(body ? { method:'POST', body:JSON.stringify(body) } : {}) });
  const send = { provider:'claude', chatId:'chat', permission:'readonly', text:'Original request', requestId:'first' };
  expect((await request('/v1/messages',send)).status).toBe(202);
  await vi.waitFor(()=>expect(fake.start).toHaveBeenCalledOnce());
  expect((await request('/v1/chats/chat/stop',{})).status).toBe(200);
  const history = await (await request('/v1/chats/chat')).json();
  expect(history).toMatchObject({canStop:false, running:false, interrupted:{token:expect.any(String)}});
  const resume = {...send, text:'Continue', requestId:'resume-once', resumeToken:history.interrupted.token};
  const first = await (await request('/v1/messages',resume)).json();
  await vi.waitFor(()=>expect(fake.start).toHaveBeenCalledTimes(2));
  const second = await (await request('/v1/messages',resume)).json();
  expect(second.id).toBe(first.id);
  expect(fake.start.mock.calls[1][0]).toMatchObject({ sessionId:'original', provider:'claude', permission:'readonly', resumeToken:history.interrupted.token, prompt:expect.stringContaining(RESUME_PROMPT) });
  expect((await request('/v1/messages',{...resume,requestId:'other-device'})).status).toBe(409);
  expect(fake.start).toHaveBeenCalledTimes(2);
  expect((await (await request('/v1/chats/chat')).json()).interrupted).toBeUndefined();
});

it('answers native playback commands without starting an agent or stopping another run',async()=>{
 const {registerStudyControl}=await import('../visualTutor/studySession');
 fake.root=fs.mkdtempSync(path.join(os.tmpdir(),'ally-study-controls-'));
 messageQueue.configure(path.join(fake.root,'queue.json'));
 fs.writeFileSync(path.join(fake.root,'watch-bridge.json'),JSON.stringify({enabled:true,token:'synthetic-only',port:0,sessions:{}}));
 fs.writeFileSync(path.join(fake.root,'watch-chats.json'),JSON.stringify([{id:'study-control',provider:'codex',sessionId:'original',title:'Fixture',cwd:fake.root,messages:[],updatedAt:1}]));
 fake.load.mockResolvedValue({cwd:fake.root,messages:[]});
 const control=vi.fn(async()=> '```javascript\nstep(1); say("Paused.");\n```'),release=registerStudyControl(control);
 try{
  const create=vi.spyOn(http,'createServer');stop=startWatchBridge(()=>({defaultCwd:fake.root,permission:'readonly'}));
  const server=create.mock.results[0].value as http.Server;if(!server.listening)await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`,headers={Authorization:'Bearer synthetic-only','Content-Type':'application/json'};
  const response=await fetch(base+'/v1/messages',{method:'POST',headers,body:JSON.stringify({chatId:'study-control',provider:'codex',requestId:'pause-one',permission:'readonly',presentation:'native-study',context:'{}',text:'Pause there.'})});
  expect(response.status).toBe(202);const accepted=await response.json();
  await vi.waitFor(()=>expect(control).toHaveBeenCalledWith({sessionKey:'codex:original',words:'Pause there.'}));
  const result=await (await fetch(base+`/v1/turns/${accepted.id}`,{headers})).json();expect(result.status).toBe('done');
  expect(fake.start).not.toHaveBeenCalled();expect(fake.stop).not.toHaveBeenCalled();
  const duplicate=await (await fetch(base+'/v1/messages',{method:'POST',headers,body:JSON.stringify({chatId:'study-control',provider:'codex',requestId:'pause-one',permission:'readonly',presentation:'native-study',context:'{}',text:'Pause there.'})})).json();
  expect(duplicate.id).toBe(accepted.id);expect(control).toHaveBeenCalledOnce();
 }finally{release();}
});
