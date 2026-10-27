import {it,expect,vi,afterEach} from 'vitest';
import {PhoneStream} from './phoneStream';
const streams:PhoneStream[]=[];afterEach(()=>{streams.splice(0).forEach(s=>s.close());vi.useRealTimers();});
function fixture(approved=true){
 const connection=new AbortController(),parent=new AbortController(),frame=vi.fn(),close=vi.fn(),send=vi.fn();
 const deps={now:Date.now,connection:()=>connection.signal,send,approve:vi.fn(async()=>approved),view:vi.fn(()=>({frame,close}))};
 const stream=new PhoneStream(deps);streams.push(stream);return{stream,deps,connection,parent,frame,close,send};
}
it('never opens or offers capture without separate explicit raw-view approval',async()=>{
 const f=fixture(false);expect((await f.stream.start('viewer-123','phone-one','codex:session-123',f.parent.signal))?.state).toBe('declined');
 expect(f.deps.view).not.toHaveBeenCalled();expect(f.send).not.toHaveBeenCalled();
});
it('routes only bound frames to local viewer; public status has no frame or token; duplicate starts do not reapprove',async()=>{
 const f=fixture();await f.stream.start('viewer-123','phone-one','codex:session-123',f.parent.signal);
 const offer=f.send.mock.calls[0][1];const jpeg=Buffer.from([255,216,1,2,255,217]).toString('base64');
 f.stream.message('other-phone',{...offer,type:'viewer_frame',jpeg});f.stream.message('phone-one',{...offer,type:'viewer_frame',token:'wrong',jpeg});expect(f.frame).not.toHaveBeenCalled();
 f.stream.message('phone-one',{...offer,type:'viewer_frame',jpeg});expect(f.frame).toHaveBeenCalledOnce();
 const status=f.stream.status('viewer-123','codex:session-123');expect(status?.framesReceived).toBe(1);expect(JSON.stringify(status)).not.toContain(offer.token);expect(JSON.stringify(status)).not.toContain(jpeg);
 await f.stream.start('viewer-123','phone-one','codex:session-123',f.parent.signal);expect(f.deps.approve).toHaveBeenCalledOnce();
 expect(f.stream.status('viewer-123','codex:other')).toBeUndefined();expect(f.stream.stop('viewer-123','codex:other')).toBe(false);
 f.connection.abort();expect(f.close).toHaveBeenCalledOnce();expect(f.send).toHaveBeenLastCalledWith('phone-one',expect.objectContaining({type:'viewer_stop'}));
});
it('drops oversize/malformed frames and terminates on native Stop and expiration',async()=>{
 vi.useFakeTimers();const f=fixture();await f.stream.start('viewer-123','phone-one','codex:session-123',f.parent.signal);const offer=f.send.mock.calls[0][1];
 f.stream.message('phone-one',{...offer,type:'viewer_frame',jpeg:'a'.repeat(240001)});f.stream.message('phone-one',{...offer,type:'viewer_frame',jpeg:'not-jpeg'});expect(f.frame).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(900001);expect(f.stream.status('viewer-123','codex:session-123')?.state).toBe('stopped');expect(f.close).toHaveBeenCalledOnce();
});
