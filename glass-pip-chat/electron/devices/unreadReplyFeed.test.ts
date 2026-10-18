import { expect, it, vi } from 'vitest';
import { UnreadReplyFeed } from './unreadReplyFeed';
import type { ChatReadState } from '../agent/unread';
import type { AgentSessionSnapshot } from '../agent/types';

const receipt: ChatReadState={key:'codex:session-one',revision:'reply-one',unread:true};
const snapshot: AgentSessionSnapshot={revision:'history-one',title:'Original chat',cwd:'/project',messages:[{role:'assistant',content:'{"text":"Finished","components":[]}',timestamp:1000}]};
it('creates an exact-chat reply for a confirmed external completion once per revision',async()=>{
  let states=[receipt]; const send=vi.fn(),load=vi.fn(async()=>snapshot);
  const feed=new UnreadReplyFeed({states:()=>states,load,busy:()=>false,send});
  await feed.poll();await feed.poll();
  expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({readRevision:'reply-one',text:'Finished',session:{id:'session-one',provider:'codex',title:'Original chat',cwd:'/project'}}));
  states=[{...receipt,revision:'reply-two'}];await feed.poll();expect(send).toHaveBeenCalledTimes(2);
});
it('does not turn a running task, a user tail, an old read receipt or unavailable history into an alert',async()=>{
  let state={...receipt};let history: AgentSessionSnapshot={...snapshot,running:true};const send=vi.fn();
  const feed=new UnreadReplyFeed({states:()=>[state],load:async()=>history,busy:()=>false,send});
  await feed.poll();expect(send).not.toHaveBeenCalled();
  history={...snapshot,messages:[{role:'user',content:'Still working',timestamp:1000}]};await feed.poll();expect(send).not.toHaveBeenCalled();
  history=snapshot;state={...receipt,unread:false};await feed.poll();expect(send).not.toHaveBeenCalled();
  state={...receipt};const failed=new UnreadReplyFeed({states:()=>[state],load:async()=>{throw Error('Offline')},busy:()=>false,send});await failed.poll();expect(send).not.toHaveBeenCalled();
});
it('rechecks receipt and shutdown after an asynchronous history load',async()=>{
  let state={...receipt};const send=vi.fn();
  const feed=new UnreadReplyFeed({states:()=>[state],load:async()=>{state={...receipt,unread:false};return snapshot;},busy:()=>false,send});
  await feed.poll();expect(send).not.toHaveBeenCalled();
  state={...receipt};const stopped=new UnreadReplyFeed({states:()=>[state],load:async()=>{stopped.stop();return snapshot;},busy:()=>false,send});
  await stopped.poll();expect(send).not.toHaveBeenCalled();
});
