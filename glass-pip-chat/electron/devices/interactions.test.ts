import { afterEach, describe, expect, it, vi } from 'vitest';
import { InteractionBroker, originatingChat, type ChatInteraction } from './interactions';
import { DeviceHub } from './hub';
import { UnreadStore } from '../agent/unread';
import { WatchApprovals } from '../watch/approvals';
import { interactions } from './interactions';
const chatId = 'codex:session-1234';
const spec = (extra: Partial<ChatInteraction> = {}): ChatInteraction => ({ id: 'request-1234', chatId, kind: 'approval', title: 'Test request', detail: 'Exact action', fields: [], actions: [{ value: 'accept', label: 'Allow once' }, { value: 'decline', label: 'Decline' }], expiresAt: Date.now() + 120000, ...extra });
afterEach(() => { interactions.closeAll(); vi.useRealTimers(); });
describe('real shared chat interactions', () => {
  it('binds the originating chat and rejects caller impersonation', () => {
    expect(originatingChat({},chatId)).toBe(chatId);
    expect(() => originatingChat({chatId:'claude:other-1234'},chatId)).toThrow('does not match');
    expect(() => originatingChat({})).toThrow('originating chatId');
  });
  it('requires a real decision, mirrors one answer, and rejects contradictory replay', async () => {
    const attention=vi.fn(); const b=new InteractionBroker(attention); const events=vi.fn(); b.subscribe(events);
    const result=b.request(spec(),new AbortController().signal);
    expect(b.list(chatId)).toHaveLength(1); expect(attention).toHaveBeenCalledWith(chatId,'request-1234',true);
    b.answer('request-1234',{action:'accept'},'watch'); expect(await result).toEqual({action:'accept'});
    expect(b.list()).toHaveLength(0); expect(events).toHaveBeenLastCalledWith({type:'interaction_closed',id:'request-1234',chatId,state:'answered',answeredOn:'watch',decision:'accept'});
    expect(() => b.answer('request-1234',{action:'accept'},'phone')).not.toThrow();
    expect(() => b.answer('request-1234',{action:'decline'},'phone')).toThrow('already answered');
  });
  it('validates structured answers and never preselects a question option', async () => {
    const b=new InteractionBroker(vi.fn()); const request=spec({kind:'question',fields:[{id:'pick',label:'Pick one',secret:false,required:true,freeText:false,options:[{value:'A',label:'A'}]}],actions:[{value:'submit',label:'Send answer'},{value:'cancel',label:'Cancel'}]});
    const result=b.request(request,new AbortController().signal);
    expect(() => b.answer(request.id,{action:'submit',values:{}},'watch')).toThrow('required');
    expect(() => b.answer(request.id,{action:'submit',values:{pick:'B'}},'phone')).toThrow('required');
    b.answer(request.id,{action:'submit',values:{pick:'A'}},'phone'); expect((await result).values).toEqual({pick:'A'});
  });
  it('expires/cancels without approval and does not expose another chat in a filtered read', async () => {
    vi.useFakeTimers(); const b=new InteractionBroker(vi.fn()); const first=b.request(spec(),new AbortController().signal);
    expect(b.list('claude:session-1234')).toHaveLength(0); await vi.advanceTimersByTimeAsync(120001); expect(await first).toEqual({action:'cancel'});
    const c=new AbortController(); const second=b.request(spec({id:'request-5678'}),c.signal); c.abort(); expect(await second).toEqual({action:'cancel'}); expect(b.list()).toHaveLength(0);
  });
  it('keeps attention unread until answered while preserving independently unread replies', () => {
    const store=new UnreadStore(); const b=new InteractionBroker((key,id,pending)=>store.needsAttention(key,id,pending));
    const reply=store.complete(chatId,'reply-1'); const dispose=b.add(spec(),vi.fn(),vi.fn());
    store.read(chatId,reply.revision); expect(store.get(chatId).unread).toBe(true); dispose(); expect(store.get(chatId).unread).toBe(false);
    const next=store.complete(chatId,'reply-2'); b.add(spec({id:'request-5678'}),vi.fn(),vi.fn()); b.answer('request-5678',{action:'decline'},'watch');
    expect(store.get(chatId)).toEqual(next);
  });
  it('does not execute a phone command on delivery; watch consent authorizes only its exact plan', async () => {
    const b=new InteractionBroker(vi.fn()); const hub=new DeviceHub(vi.fn(),Date.now,b); const phone=vi.fn(); const watch=vi.fn(); hub.connect('phone-one','phone',phone); hub.connect('watch-one','watch',watch);
    const result=hub.command('phone','phone_control_approve',{chatId,deviceId:'phone-one',title:'Inspect only',body:'No taps'});
    expect(phone).not.toHaveBeenCalled(); const request=b.list()[0]; expect(request).toMatchObject({chatId,targetDeviceId:'phone-one',deviceAction:'phone_control_approve',detail:'No taps'});
    b.answer(request.id,{action:'accept'},'watch'); expect((await result).ok).toBe(true); expect(phone).not.toHaveBeenCalled(); hub.close();
  });
  it('publishes an explicit cleared unread state when questions precede the first reply', () => {
    const store=new UnreadStore(); const b=new InteractionBroker((key,id,pending)=>store.needsAttention(key,id,pending));
    b.add(spec(),vi.fn(),vi.fn()); b.add(spec({id:'request-5678'}),vi.fn(),vi.fn());
    expect(store.list()).toEqual([{key:chatId,revision:'',unread:true}]);
    b.answer('request-1234',{action:'decline'},'phone'); expect(store.get(chatId).unread).toBe(true);
    b.answer('request-5678',{action:'accept'},'watch');
    expect(store.list()).toEqual([{key:chatId,revision:'',unread:false}]);
  });
  it('cancels mirrored requests when the target disconnects and ignores a later answer', async () => {
    const b=new InteractionBroker(vi.fn()); const hub=new DeviceHub(vi.fn(),Date.now,b); const disconnect=hub.connect('phone-one','phone',vi.fn());
    const result=hub.command('phone','phone_control_approve',{chatId,deviceId:'phone-one'}); const request=b.list()[0]; disconnect();
    expect((await result).ok).toBe(false); expect(() => b.answer(request.id,{action:'accept'},'watch')).toThrow(); hub.close();
  });
  it('sends a native command to only the target after approval and still requires its completion receipt', async () => {
    const b=new InteractionBroker(vi.fn()); const hub=new DeviceHub(vi.fn(),Date.now,b); const phone=vi.fn(); hub.connect('phone-one','phone',phone);
    const result=hub.command('phone','phone_open_app',{chatId,deviceId:'phone-one',packageName:'com.example.notes'}); const request=b.list()[0]; b.answer(request.id,{action:'accept'},'watch'); await Promise.resolve();
    expect(phone).toHaveBeenCalledOnce(); expect(phone.mock.calls[0][0]).toMatchObject({type:'authorized_command',command:{id:request.id,packageName:'com.example.notes'}});
    hub.receipt('phone-one',{id:request.id,status:'handed_off'}); expect((await result).message).toContain('not verified'); hub.close();
  });
  it('mirrors native Codex questions and answers the original waiting request from another device', async () => {
    const native=new WatchApprovals(vi.fn()); const controller=new AbortController();
    const result=native.request('turn-1234','item/tool/requestUserInput',{questions:[{id:'choice',question:'Which one?',options:[{label:'A'},{label:'B'}]}]},controller.signal,[],chatId);
    const request=interactions.list(chatId)[0]; expect(request.kind).toBe('question'); expect(request.fields[0].options).toHaveLength(2);
    interactions.answer(request.id,{action:'submit',values:{choice:'B'}},'phone');
    expect(await result).toEqual({answers:{choice:{answers:['B']}}}); expect(native.list('turn-1234')).toHaveLength(0); expect(interactions.list(chatId)).toHaveLength(0);
  });
  it('withdraws mirrored native questions when their owning run is aborted', async () => {
    const native=new WatchApprovals(vi.fn()); const controller=new AbortController(); const result=native.request('turn-1234','item/tool/requestUserInput',{questions:[{id:'choice',question:'Choose',options:[]}]},controller.signal,[],chatId);
    expect(interactions.list(chatId)).toHaveLength(1); controller.abort(); expect(await result).toEqual({answers:{}}); expect(interactions.list(chatId)).toHaveLength(0);
  });
});
