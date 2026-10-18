// @vitest-environment node
import { expect, it } from 'vitest';
import { assistantActivity, type AssistantActivityRow } from './assistantActivity';

const now=Date.now();
const row=(overrides: Partial<AssistantActivityRow> = {}): AssistantActivityRow => ({ id:'device-chat',provider:'codex',sessionId:'original',title:'Ally',status:'running',detail:'Reading files',unread:false,updatedAt:now,...overrides });
it('merges exact-session aliases and prioritizes active chats over recent replies',()=>{
  const result=assistantActivity([row({id:'codex:original',status:'completed',updatedAt:now-5}),row(),row({id:'claude:other',provider:'claude',sessionId:'other',status:'completed'})],[],now);
  expect(result.chats).toHaveLength(2); expect(result.chats[0]).toMatchObject({id:'device-chat',status:'running'});
  expect(result).toMatchObject({running:1,ready:1});
});
it('surfaces real questions without approving them or treating unread as completion',()=>{
  const result=assistantActivity([row({unread:true})],['codex:original','claude:waiting'],now);
  expect(result.chats.every(r=>r.status==='needs_input')).toBe(true); expect(result.ready).toBe(0);
  expect(result.chats.find(r=>r.provider==='claude')?.id).toBe('claude:waiting');
});
it('expires terminal rows but preserves every active chat and keeps stopped/error distinct',()=>{
  const rows=Array.from({length:12},(_,i)=>row({id:`active-${i}`,sessionId:`active-${i}`}));
  rows.push(row({id:'old',sessionId:'old',status:'completed',updatedAt:now-31*60_000}),row({id:'stopped',sessionId:'stopped',status:'stopped'}),row({id:'error',sessionId:'error',status:'error'}));
  const result=assistantActivity(rows,[],now);
  expect(result.running).toBe(12); expect(result.chats).toHaveLength(14); expect(result.ready).toBe(0);
  expect(result.chats.find(r=>r.id==='old')).toBeUndefined();
});
it('keeps every unread conversation even when older than recent history and beyond a three-chat sample',()=>{
  const rows=Array.from({length:20},(_,i)=>row({id:`unread-${i}`,sessionId:`unread-${i}`,status:'unread',unread:true,updatedAt:now-60*60_000}));
  expect(assistantActivity(rows,[],now).chats).toHaveLength(20);
});
