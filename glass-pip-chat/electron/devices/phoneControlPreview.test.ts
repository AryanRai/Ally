// @vitest-environment node
import {afterEach,describe,it,expect,vi} from 'vitest';
vi.mock('../chatsMcp/index.js',()=>({registerDeviceTool:vi.fn()}));
import {registerPhoneControl} from './phoneControlTools.js';
import type {DeviceToolSpec} from '../chatsMcp/index.js';
import {DeviceHub} from './hub.js';
import {PhoneControl} from './phoneControl.js';
const stops:(()=>void)[]=[];
afterEach(()=>stops.splice(0).forEach(stop=>stop()));
function fixture(state='completed'){
 const hub=new DeviceHub(vi.fn());hub.connect('phone-one','phone',vi.fn(),['on-device-control']);
 const control=new PhoneControl(hub),lifetime=new AbortController(),caller=new AbortController();
 vi.spyOn(control,'execute').mockResolvedValue({content:[{type:'text',text:'control result'}]});
 vi.spyOn(control,'history').mockReturnValue([{state}] as ReturnType<PhoneControl['history']>);
 vi.spyOn(control,'sessionSignal').mockReturnValue(lifetime.signal);
 const preview=vi.fn<DeviceToolSpec['handler']>(async()=>({content:[{type:'text' as const,text:'viewer result'}]}));
 const tools=new Map<string,DeviceToolSpec>();
 const stop=registerPhoneControl(hub,control,{preview,register:tool=>{tools.set(tool.name,tool);return()=>{};}});
 stops.push(()=>{stop();hub.close();});
 const call=(extra:Record<string,unknown>={})=>tools.get('phone_control')!.handler({deviceId:'phone-one',requestId:'preview-control-01',operations:[],...extra},{caller:'codex:session-1234',signal:caller.signal});
 return{call,preview,lifetime,caller};
}
describe('explicit desktop preview',()=>{
 it('never opens a viewer by default or after failed/refused control',async()=>{
  const f=fixture();await f.call();expect(f.preview).not.toHaveBeenCalled();
  const denied=fixture('failed');await denied.call({desktopPreview:true});expect(denied.preview).not.toHaveBeenCalled();
 });
 it('binds a separately requested viewer to the control lifetime, not completed MCP request',async()=>{
  const f=fixture();await f.call({desktopPreview:true});expect(f.preview).toHaveBeenCalledOnce();
  const signal=f.preview.mock.calls[0][1].signal!;f.caller.abort();expect(signal.aborted).toBe(false);
  f.lifetime.abort();expect(signal.aborted).toBe(true);
 });
 it('preserves control when viewing is unavailable and never tries a second viewer',async()=>{
  const f=fixture();f.preview.mockRejectedValueOnce(Error('unavailable'));
  const result=await f.call({desktopPreview:true});expect(result.content[0]).toEqual({type:'text',text:'control result'});expect(f.preview).toHaveBeenCalledOnce();
 });
});
