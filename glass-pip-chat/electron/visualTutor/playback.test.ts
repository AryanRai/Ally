import {afterEach,expect,it,vi} from 'vitest';
import {StudyPlayback,type PlaybackCommand} from './playback';
const command:PlaybackCommand={requestId:'r1',boardId:'board',stepId:'clip',action:'replay'};
const state={paused:false,ended:false,currentTime:0,duration:6};
afterEach(()=>vi.useRealTimers());
it('waits for a matching actual-player receipt and makes retries idempotent',async()=>{
 const controls=new StudyPlayback(),send=vi.fn(),first=controls.request(command,send);
 expect(controls.request({...command},send)).toBe(first);expect(send).toHaveBeenCalledOnce();
 expect(controls.acknowledge({...command,boardId:'wrong'},state)).toBe(false);
 expect(controls.acknowledge(command,state)).toBe(true);await expect(first).resolves.toEqual(state);
 await expect(controls.request(command,send)).resolves.toEqual(state);expect(send).toHaveBeenCalledOnce();
 expect(()=>controls.request({...command,action:'pause'},send)).toThrow('different data');
});
it('times out unconfirmed commands without replaying them on retry',async()=>{
 vi.useFakeTimers();const controls=new StudyPlayback(),send=vi.fn(),pending=controls.request(command,send);
 const rejected=expect(pending).rejects.toThrow('not confirmed');await vi.advanceTimersByTimeAsync(8001);await rejected;
 await expect(controls.request(command,send)).rejects.toThrow('not confirmed');expect(send).toHaveBeenCalledOnce();
});
it('rejects bad receipts and releases pending work on board close',async()=>{
 const controls=new StudyPlayback(),pending=controls.request(command,()=>{});
 expect(controls.acknowledge(command,{...state,currentTime:NaN})).toBe(false);
 expect(()=>controls.request({...command,requestId:'busy'},()=>{})).toThrow('Wait');
 const rejected=expect(pending).rejects.toThrow('board closed');controls.reset();await rejected;
});
