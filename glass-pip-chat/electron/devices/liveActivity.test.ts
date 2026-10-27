// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {startLiveActivity} from './liveActivity';
it('shares a bounded change-only feed and never reads without connected devices',async()=>{
 vi.useFakeTimers();let connected=false;const read=vi.fn(async()=>({chats:[{id:'chat',provider:'codex',title:'Chat',status:'running',detail:'Reading',updatedAt:1,text:'hello'}]})),send=vi.fn();
 const stop=startLiveActivity(read,()=>connected,send);
 try{await vi.advanceTimersByTimeAsync(1500);expect(read).not.toHaveBeenCalled();connected=true;await vi.advanceTimersByTimeAsync(1500);expect(send).toHaveBeenCalledOnce();expect(send.mock.calls[0][0]).toMatchObject({type:'agent_activity',activity:{chats:[{text:'hello'}]}});await vi.advanceTimersByTimeAsync(1500);expect(send).toHaveBeenCalledOnce();}finally{stop();vi.useRealTimers();}
});
