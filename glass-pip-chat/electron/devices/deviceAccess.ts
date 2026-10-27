import {AdbPhone} from './adb.js';
import {AdbQrPairing,pairingDefaults,type PairingDependencies} from './adbPairing.js';
import type {DeviceHub} from './hub.js';
import {matchingAdb} from './phoneTransport.js';

export class DeviceAccess {
 readonly pairing:AdbQrPairing;
 private maintenance=new Map<string,{active:boolean;expiresAt:number;detail:string}>();
 constructor(private hub:DeviceHub,deps:PairingDependencies=pairingDefaults(),private adb=new AdbPhone()){
  this.pairing=new AdbQrPairing(deps,(id,message)=>hub.sendTo(id,message));
 }
 async status(signal?:AbortSignal){
  const devices=this.hub.list();
  const phones=await Promise.all(devices.filter(d=>d.kind==='phone').map(async d=>{
   const serial=await matchingAdb(this.adb,d.id,signal).catch(()=>undefined);
   return {...d,control:this.hub.capabilities(d.id).includes('on-device-control')?'on-device-accessibility':serial?'authorized-adb':'unavailable',
    serial,viewer:serial?'separate-scrcpy-approval-required':this.hub.capabilities(d.id).includes('native-viewer-v1')?'native-projection-separate-approval-and-android-consent-required':'requires-authorized-local-adb-or-updated-phone',installation:serial?'adb-available-not-an-install-authorization':'requires-authorized-adb',
    qr:devices.some(w=>w.kind==='watch'&&this.hub.capabilities(w.id).includes('device-access-v1'))?'available-on-watch-user-native-scan':'open-updated-Ally-on-watch'};
  }));
  return {phones,watches:devices.filter(d=>d.kind==='watch').map(d=>{const lease=this.maintenance.get(d.id);return {...d,maintenance:lease&&lease.expiresAt>Date.now()?lease:{active:false,detail:'No current reported maintenance lease'}};}),pairing:this.pairing.list(),
   network:'Accessibility control uses the authenticated Ally link on any network. ADB QR requires reachable local Wi-Fi; mDNS absence does not prove a different network.',
   watchMaintenance:'User-opened bounded maintenance screen + CPU/Wi-Fi request. Cannot force Android debugging to remain enabled or keep another app screen awake.'};
 }
 async pair(id:string,watchId:string,phoneId:string){
  const devices=this.hub.list();
  if(!devices.some(d=>d.id===watchId&&d.kind==='watch')||!this.hub.capabilities(watchId).includes('device-access-v1'))throw Error('Open updated Ally Device access on the selected watch.');
  if(!devices.some(d=>d.id===phoneId&&d.kind==='phone'))throw Error('Connect the intended phone to Ally first for identity verification.');
  const connections=[this.hub.connectionSignal(watchId),this.hub.connectionSignal(phoneId)];
  if(connections.some(s=>!s))throw Error('Device disconnected.');
  return this.pairing.start(id,watchId,phoneId,connections as AbortSignal[]);
 }
 message(deviceId:string,m:Record<string,unknown>){
  if(!this.hub.list().some(d=>d.id===deviceId&&d.kind==='watch')||!this.hub.capabilities(deviceId).includes('device-access-v1'))return;
  if(m.action==='maintenance_status'){
   if(typeof m.remainingMs!=='number'||!Number.isFinite(m.remainingMs)||m.remainingMs<0||m.remainingMs>600000)return;
   this.maintenance.set(deviceId,{active:m.active===true&&m.remainingMs>0,expiresAt:Date.now()+m.remainingMs,detail:typeof m.detail==='string'?m.detail.slice(0,240):'Reported by watch'});return;
  }
  if(m.action==='stop'&&typeof m.sessionId==='string'){this.pairing.stop(m.sessionId,deviceId);return;}
  if(m.action==='pair_phone'&&typeof m.requestId==='string'){
   const phones=this.hub.list().filter(d=>d.kind==='phone');
   const phoneId=typeof m.phoneId==='string'?m.phoneId:phones.length===1?phones[0].id:undefined;
   if(!phoneId){this.hub.sendTo(deviceId,{type:'device_access_state',state:'failed',detail:'Connect exactly one Ally phone, or select the intended phone from the PC tool.'});return;}
   void this.pair(m.requestId,deviceId,phoneId).catch(()=>this.hub.sendTo(deviceId,{type:'device_access_state',state:'failed',detail:'Pairing unavailable. Connect updated Ally on both devices and try a new request.'}));
  }
 }
 close(){this.pairing.close();}
}
