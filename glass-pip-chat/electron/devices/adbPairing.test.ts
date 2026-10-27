import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {AdbQrPairing,pairingEndpoint,privateAdbEndpoint,type PairingDependencies} from './adbPairing';
const active:AdbQrPairing[]=[];
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(10000);});
afterEach(()=>{for(const p of active.splice(0))p.close();vi.useRealTimers();});
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(identity='phone-one'){
 let payload='',paired=false,discover=true;
 const send=vi.fn();
 const deps:PairingDependencies={now:Date.now,qr:vi.fn(async value=>{payload=value;return 'data:image/png;base64,synthetic';}),
  services:vi.fn(async()=>!discover?'studio-other _adb-tls-pairing._tcp 192.168.1.2:33333':paired?'adb-phone _adb-tls-connect._tcp 192.168.1.2:44444':`${/S:([^;]+)/.exec(payload)?.[1]} _adb-tls-pairing._tcp 192.168.1.2:33333`),
  pair:vi.fn(async()=>{paired=true;}),connect:vi.fn(async()=>{}),identity:vi.fn(async()=>identity),
  wait:signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}))};
 const pairing=new AdbQrPairing(deps,send);active.push(pairing);return{pairing,deps,send,payload:()=>payload,noDiscovery:()=>{discover=false;}};
}
it('pairs only after matching native scan, clears QR, verifies Ally identity and never returns its secret',async()=>{
 const f=fixture();await f.pairing.start('request-123','watch-one','phone-one',[]);await flush();
 expect(f.deps.pair).toHaveBeenCalledOnce();expect(f.deps.connect).toHaveBeenCalledWith('192.168.1.2:44444',expect.any(AbortSignal));
 expect(f.pairing.list()[0]).toMatchObject({state:'connected',phoneId:'phone-one'});
 const secret=/P:([^;]+)/.exec(f.payload())![1];expect(JSON.stringify(f.pairing.list())).not.toContain(secret);
 expect(f.send).toHaveBeenLastCalledWith('watch-one',expect.objectContaining({state:'connected',qrData:null}));
 await f.pairing.start('request-123','watch-one','phone-one',[]);await flush();expect(f.deps.pair).toHaveBeenCalledOnce();
});
it('ignores unrelated beacons, expires/cancels and does not retry an old native pairing',async()=>{
 const f=fixture();f.noDiscovery();const connection=new AbortController();
 await f.pairing.start('request-123','watch-one','phone-one',[connection.signal]);await flush();expect(f.deps.pair).not.toHaveBeenCalled();
 connection.abort();await flush();expect(f.pairing.list()[0].state).toBe('cancelled');
 await f.pairing.start('request-123','watch-one','phone-one',[]);expect(f.deps.qr).toHaveBeenCalledOnce();
 const e=fixture();e.noDiscovery();await e.pairing.start('expire-123','watch-one','phone-one',[]);await vi.advanceTimersByTimeAsync(360001);expect(e.deps.pair).not.toHaveBeenCalled();expect(e.pairing.list()[0].state).toBe('cancelled');
});
it('refuses a wrong Ally identity after native pairing and refuses cross-watch request reuse',async()=>{
 const f=fixture('different-phone');f.deps.wait=async()=>{};await f.pairing.start('request-123','watch-one','phone-one',[]);await flush();await flush();
 expect(f.pairing.list()[0].state).toBe('paired_unverified');
 await expect(f.pairing.start('request-123','watch-two','phone-one',[])).rejects.toThrow('already used');
});
it('a failed native pairing is terminal until a new explicit request',async()=>{
 const f=fixture();vi.mocked(f.deps.pair).mockRejectedValue(Error('synthetic refusal'));
 await f.pairing.start('request-123','watch-one','phone-one',[]);await flush();expect(f.pairing.list()[0].state).toBe('failed');
 await f.pairing.start('request-123','watch-one','phone-one',[]);await flush();expect(f.deps.pair).toHaveBeenCalledOnce();
 expect(f.send).toHaveBeenLastCalledWith('watch-one',expect.objectContaining({qrData:null}));
});
it('accepts only exact generated pairing service and private numeric endpoint',()=>{
 expect(pairingEndpoint('studio-good _adb-tls-pairing._tcp 192.168.1.2:33333','studio-good')).toBe('192.168.1.2:33333');
 expect(pairingEndpoint('studio-other _adb-tls-pairing._tcp 192.168.1.2:33333','studio-good')).toBeUndefined();
 for(const value of ['8.8.8.8:1234','127.0.0.1:1234','192.168.1.2:0','192.168.1.2:99999','192.168.1.2;bad:1234','192.168.999.2:1234'])expect(privateAdbEndpoint(value)).toBe(false);
});
