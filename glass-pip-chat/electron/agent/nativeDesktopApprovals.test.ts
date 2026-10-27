// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { NativeDesktopApprovals, answerNativeRequest } from './nativeDesktopApprovals';
import { desktopInteraction } from './desktopApprovals';
import { InteractionBroker } from '../devices/interactions';
import type { CodexDesktopClient } from './codexDesktop';

const id = 'external-session-1234';
const request = { id: 42, method: 'item/commandExecution/requestApproval', params: { threadId: id, turnId: 'turn-1', reason: 'Inspect timing', command: 'local diagnostic', availableDecisions: ['accept','decline','cancel'] } };
const state = (requests: any[] = [request]) => ({ id, requests, turns: [] });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
let mirror: NativeDesktopApprovals, broker: InteractionBroker;
afterEach(() => { mirror?.close(); broker?.closeAll(); });
function fixture() {
  broker = new InteractionBroker(vi.fn());
  mirror = new NativeDesktopApprovals(chat => desktopInteraction(() => chat, broker));
  const answer = vi.fn(async (_request: any, _response: unknown, _signal: AbortSignal) => {});
  return answer;
}
it('mirrors external genuine requests into shared attention once and waits for the human', async () => {
  const answer = fixture();
  mirror.observe(id, 'owner', state(), answer); mirror.observe(id, 'owner', state(), answer);
  expect(broker.list()).toHaveLength(1); expect(answer).not.toHaveBeenCalled();
  const pending = broker.list()[0];
  expect(pending).toMatchObject({ chatId: 'codex:' + id, detail: expect.stringContaining('Inspect timing') });
  broker.answer(pending.id, { action: 'accept' }, 'phone'); await flush();
  expect(answer).toHaveBeenCalledOnce(); expect(answer.mock.calls[0][1]).toEqual({ decision: 'accept' });
  mirror.observe(id, 'owner', state(), answer); expect(broker.list()).toHaveLength(0);
});
it('withdraws cards answered in Codex, on lost ownership and on changed command without submitting cancellation', async () => {
  const answer = fixture();
  mirror.observe(id, 'owner', state(), answer);
  mirror.observe(id, 'owner', state([]), answer); await flush();
  expect(broker.list()).toHaveLength(0); expect(answer).not.toHaveBeenCalled();
  mirror.clear(id); mirror.observe(id, 'owner', state(), answer);
  const changed = { ...request, params: { ...request.params, command: 'changed diagnostic' } };
  mirror.observe(id, 'owner', state([changed]), answer); await flush();
  expect(broker.list()).toHaveLength(1); expect(broker.list()[0].detail).toContain('changed diagnostic');
  mirror.retain([]); await flush(); expect(broker.list()).toHaveLength(0); expect(answer).not.toHaveBeenCalled();
});
it('ignores other threads and unsupported request methods', () => {
  const answer = fixture();
  mirror.observe(id, 'owner', state([{ ...request, params: { ...request.params, threadId: 'other' } }, { ...request, method: 'unknown' }]), answer);
  expect(broker.list()).toHaveLength(0);
});
it('replaces a former owner card and cancels its callback without granting anything', async () => {
  const answer = fixture();
  mirror.observe(id, 'old-owner', state(), answer);
  const oldId = broker.list()[0].id;
  mirror.observe(id, 'new-owner', state(), answer); await flush();
  expect(broker.list()).toHaveLength(1); expect(broker.list()[0].id).not.toBe(oldId);
  expect(answer).not.toHaveBeenCalled();
});
it('rechecks exact owner, request and action before forwarding a human decision; never retries', async () => {
  const client = { owner: vi.fn(async () => 'owner'), snapshot: vi.fn(async () => state()), request: vi.fn(async () => ({})) };
  const forward = () => answerNativeRequest(client as unknown as CodexDesktopClient, id, 'owner', request, { decision: 'accept' }, new AbortController().signal);
  await forward(); expect(client.request).toHaveBeenCalledWith('thread-follower-command-approval-decision', { conversationId: id, requestId: 42, decision: 'accept' }, 'owner');
  client.request.mockClear(); client.snapshot.mockResolvedValueOnce(state([])); await forward(); expect(client.request).not.toHaveBeenCalled();
  client.owner.mockResolvedValueOnce('other-owner'); await forward(); expect(client.request).not.toHaveBeenCalled();
  client.snapshot.mockResolvedValueOnce(state([{ ...request, params: { ...request.params, command: 'different' } }])); await forward(); expect(client.request).not.toHaveBeenCalled();
  client.request.mockRejectedValueOnce(Error('timeout')); await expect(forward()).rejects.toThrow('timeout'); expect(client.request).toHaveBeenCalledOnce();
});
it('withdraws completed requests retained in the native snapshot without forwarding a cancellation', async () => {
  const answer=fixture();
  mirror.observe(id,'owner',state(),answer);
  mirror.observe(id,'owner',state([{...request,completed:true}]),answer);
  await flush(); expect(broker.list()).toHaveLength(0); expect(answer).not.toHaveBeenCalled();
  const client={owner:vi.fn(async()=>'owner'),snapshot:vi.fn(async()=>state([{...request,completed:true}])),request:vi.fn()};
  await answerNativeRequest(client as unknown as CodexDesktopClient,id,'owner',request,{decision:'accept'},new AbortController().signal);
  expect(client.request).not.toHaveBeenCalled();
});
it('bridges a native Chrome app request into the shared inbox and maps the explicit phone answer exactly once', async () => {
  const answer=fixture();
  const chrome={id:'native-chrome-consent',method:'mcpServer/elicitation/request',params:{threadId:id,mode:'form',serverName:'cua_repl',message:'Allow access to Chrome?',requestedSchema:{type:'object',properties:{}},_meta:{codex_approval_kind:'mcp_tool_call',connector_id:'computer-use',tool_params:{app:'Google Chrome'},persist:['session'],riskLevel:'high'}}};
  mirror.observe(id,'owner',state([chrome]),answer);
  const card=broker.list()[0];
  expect(card).toMatchObject({chatId:'codex:'+id,title:'Allow ChatGPT to use Google Chrome?',detail:expect.stringContaining('Elevated Risk')});
  expect(answer).not.toHaveBeenCalled();
  broker.answer(card.id,{action:'submit'},'phone'); await flush();
  expect(answer).toHaveBeenCalledOnce(); expect(answer.mock.calls[0][1]).toEqual({action:'accept',content:{},_meta:{persist:'session'}});
});
