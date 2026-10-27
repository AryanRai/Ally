import {afterEach,it,expect,vi} from 'vitest';
import {HandoffSessions,type HandoffSessionDependencies} from './handoffSessions';
const active:HandoffSessions[]=[];
afterEach(()=>{for(const s of active.splice(0))s.close();});
function fixture(){
 const connection=new AbortController();
 const deps={connection:vi.fn(()=>connection.signal),control:vi.fn(async()=>({})),serial:vi.fn(async():Promise<string|undefined>=>'paired-adb'),viewer:vi.fn<HandoffSessionDependencies['viewer']>(async()=>({})),status:vi.fn()};
 const sessions=new HandoffSessions(deps);active.push(sessions);return{sessions,deps,connection};
}
it('requests distinct control and raw-view approvals once; never inspects or sends',async()=>{
 const f=fixture();await f.sessions.start('phone','codex:session-1234',{control:true,viewer:true},'handoff-123');
 expect(f.deps.control).toHaveBeenCalledOnce();expect(f.deps.viewer).toHaveBeenCalledWith(expect.objectContaining({deviceId:'phone',serial:'paired-adb',chatId:'codex:session-1234'}),expect.any(AbortSignal));
 await f.sessions.start('phone','codex:session-1234',{control:true,viewer:true},'handoff-123');expect(f.deps.viewer).toHaveBeenCalledOnce();
 f.connection.abort();expect(f.deps.viewer.mock.calls[0][1].aborted).toBe(true);
});
it('fails honestly without ADB and does not treat control refusal as raw-view consent',async()=>{
 const f=fixture();f.deps.control.mockRejectedValue(Error('Control declined'));f.deps.serial.mockResolvedValue(undefined);
 await f.sessions.start('phone','claude:session-1234',{control:true,viewer:true},'handoff-456');
 expect(f.deps.status).toHaveBeenCalledWith('phone','Control declined');expect(f.deps.status).toHaveBeenLastCalledWith('phone',expect.stringContaining('No authorized ADB'));expect(f.deps.viewer).not.toHaveBeenCalled();
});
it('does nothing for disconnected phones, invalid chat identity or disabled options',async()=>{
 const f=fixture();await f.sessions.start('phone','local:unsent',{control:true,viewer:true},'handoff-789');
 await f.sessions.start('phone','codex:session-1234',{control:false,viewer:false},'handoff-790');
 f.connection.abort();await f.sessions.start('phone','codex:session-1234',{control:true,viewer:true},'handoff-791');
 expect(f.deps.control).not.toHaveBeenCalled();expect(f.deps.serial).not.toHaveBeenCalled();expect(f.deps.viewer).not.toHaveBeenCalled();
});
it('selects an advertised native viewer before approval when ADB is absent, without retrying another route',async()=>{
 const connection=new AbortController(),viewer=vi.fn(async()=>({state:'awaiting_native_capture'}));
 const s=new HandoffSessions({connection:()=>connection.signal,control:vi.fn(async()=>({})),serial:async()=>undefined,nativeAvailable:()=>true,viewer,status:vi.fn()});
 active.push(s);await s.start('phone','codex:session-1234',{control:false,viewer:true},'handoff-native-123');
 expect(viewer).toHaveBeenCalledWith(expect.objectContaining({deviceId:'phone',serial:undefined}),expect.any(AbortSignal));expect(viewer).toHaveBeenCalledOnce();
});
