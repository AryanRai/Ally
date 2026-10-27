import {it,expect,vi} from 'vitest';
import {DeviceHub} from './hub';
import {controlTransport,matchingAdb} from './phoneTransport';
it('prefers any-network on-device control without probing ADB; preserves an explicit transport',async()=>{
 const hub=new DeviceHub(vi.fn());hub.connect('phone-one','phone',vi.fn(),['on-device-control']);
 const adb={list:vi.fn(async()=>[]),identity:vi.fn(async()=> 'phone-one')};
 expect(await controlTransport(hub,adb,{deviceId:'phone-one'})).toEqual({deviceId:'phone-one'});expect(adb.list).not.toHaveBeenCalled();
 expect(await controlTransport(hub,adb,{deviceId:'phone-one',serial:'chosen-serial'})).toEqual({deviceId:'phone-one',serial:'chosen-serial'});hub.close();
});
it('chooses only the matching authenticated phone identity and skips unsafe/stale aliases',async()=>{
 const hub=new DeviceHub(vi.fn());hub.connect('phone-one','phone',vi.fn());
 const adb={list:vi.fn(async()=>[{serial:'bad (2)'},{serial:'other-phone'},{serial:'192.168.1.3:33333'}]),identity:vi.fn(async(s:string)=>s==='other-phone'?'phone-other':'phone-one')};
 expect(await controlTransport(hub,adb,{deviceId:'phone-one'})).toMatchObject({serial:'192.168.1.3:33333'});
 expect(adb.identity).not.toHaveBeenCalledWith('bad (2)',expect.anything());hub.close();
});
it('does not invent a transport or probe after cancellation',async()=>{
 const abort=new AbortController();abort.abort();const adb={list:vi.fn(async()=>[{serial:'phone-serial'}]),identity:vi.fn(async()=> 'other-phone')};
 await expect(matchingAdb(adb,'phone-one',abort.signal)).rejects.toThrow('cancelled');expect(adb.identity).not.toHaveBeenCalled();
 expect(await matchingAdb(adb,'phone-one')).toBeUndefined();
});
