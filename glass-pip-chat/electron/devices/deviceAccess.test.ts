import {it,expect,vi} from 'vitest';
import {DeviceHub} from './hub';
import {DeviceAccess} from './deviceAccess';
import type {PairingDependencies} from './adbPairing';
it('requires a negotiated paired watch and an identified connected phone, and does not start viewing/control',async()=>{
 const hub=new DeviceHub(vi.fn()),send=vi.fn();hub.connect('watch-one','watch',send);hub.connect('phone-one','phone',vi.fn(),['on-device-control']);
 const deps={now:Date.now,qr:vi.fn(async()=> 'data:image/png;base64,fixture'),services:vi.fn(async()=>''),pair:vi.fn(),connect:vi.fn(),identity:vi.fn(),wait:vi.fn()} as unknown as PairingDependencies;
 const access=new DeviceAccess(hub,deps);await expect(access.pair('request-123','watch-one','phone-one')).rejects.toThrow('updated');
 access.message('phone-one',{action:'pair_phone',requestId:'request-123'});expect(deps.qr).not.toHaveBeenCalled();
 access.close();hub.close();
});
