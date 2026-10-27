import type {DeviceHub} from './hub.js';
/** Selection happens before a plan. Never change executor after a protected-screen refusal/failure. */
export async function matchingAdb(adb:{list(signal?:AbortSignal):Promise<{serial:string}[]>;identity(serial:string,signal:AbortSignal):Promise<string|undefined>},deviceId:string,signal?:AbortSignal){
 const bounded=AbortSignal.any([AbortSignal.timeout(8000),...(signal?[signal]:[])]);
 for(const device of await adb.list(bounded)){
  if(bounded.aborted)throw Error('Device access cancelled or discovery timed out.');
  // Duplicate mDNS aliases may contain spaces. They are not safe explicit ADB targets.
  if(!/^[A-Za-z0-9_.:\-]{4,180}$/.test(device.serial)||device.serial.startsWith('-'))continue;
  try{if(await adb.identity(device.serial,bounded)===deviceId)return device.serial;}catch{/* unavailable/stale transport */}
 }
 return undefined;
}
export async function controlTransport(hub:DeviceHub,adb:Parameters<typeof matchingAdb>[0],args:Record<string,unknown>,signal?:AbortSignal){
 if(args.serial!==undefined)return args;
 const id=typeof args.deviceId==='string'?args.deviceId:hub.list().filter(d=>d.kind==='phone').length===1?hub.list().find(d=>d.kind==='phone')?.id:undefined;
 if(!id)throw Error('Choose one phone from phone_control_devices.');
 if(hub.capabilities(id).includes('on-device-control'))return {...args,deviceId:id};
 const serial=await matchingAdb(adb,id,signal);
 if(!serial)throw Error('No supported phone transport. Open Ally on the phone for Accessibility control on any network, or use device_access_prepare for local native ADB pairing. No action was retried.');
 return {...args,deviceId:id,serial};
}
