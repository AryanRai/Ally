import {randomUUID} from 'node:crypto';
import {registerDeviceTool} from '../chatsMcp/index.js';
import {interactions,originatingChat} from './interactions.js';
import {DeviceAccess} from './deviceAccess.js';
import type {DeviceHub} from './hub.js';

export function registerDeviceAccess(hub:DeviceHub,access:DeviceAccess){
 const result=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value)}]});
 const stops=[registerDeviceTool({name:'device_access_status',description:'Read real Ally/ADB transport readiness. Prefer on-device Accessibility control on any network. Raw scrcpy and APK installation require authorized ADB and their own intent/consent. ADB unavailable is not evidence Accessibility is offline. Never change transport after a security refusal. No pairing or capture.',inputSchema:{type:'object',properties:{},additionalProperties:false},handler:async(_args,ctx)=>result(await access.status(ctx.signal))}),
 registerDeviceTool({name:'device_access_prepare',requiresConfirmation:true,description:'After a real user decision, offer a native phone ADB-pairing QR on a selected connected watch, or request the watch open bounded maintenance mode for an installation/task. User must scan QR through Android Wireless debugging, or tap Start maintenance on the watch. No settings/security prompts automated. Does not grant phone control/raw viewing or install anything. Same reachable local Wi-Fi required for QR; use Accessibility across networks. Watch maintenance cannot guarantee OEM debugging stays on while asleep.',inputSchema:{type:'object',additionalProperties:false,required:['purpose','watchId'],properties:{purpose:{enum:['pair_phone','watch_maintenance']},watchId:{type:'string'},phoneId:{type:'string'},chatId:{type:'string'}}},handler:async(args,ctx)=>{
  const chatId=originatingChat(args,ctx.caller),watchId=String(args.watchId);
  if(!hub.list().some(d=>d.id===watchId&&d.kind==='watch')||!hub.capabilities(watchId).includes('device-access-v1'))throw Error('Choose an updated connected watch from device_access_status.');
  if(args.purpose!=='pair_phone'&&args.purpose!=='watch_maintenance')throw Error('Choose a supported purpose.');
  if(args.purpose==='pair_phone'&&typeof args.phoneId!=='string')throw Error('Choose the intended phoneId for post-pair identity verification.');
  const answer=await interactions.request({chatId,kind:'approval',targetDeviceId:watchId,title:args.purpose==='pair_phone'?'Show phone-pairing QR on watch?':'Prepare watch maintenance?',detail:args.purpose==='pair_phone'?'QR is shown only on this paired watch for up to6 minutes. Scan it manually in the intended phone’s Wireless debugging. Pairing establishes native ADB trust; control, raw viewer and installations remain separate.':'Open Ally Device access on the watch and tap Start maintenance. Up to10 minutes of CPU/Wi-Fi request; its dim screen stays awake only while visible. Stop/expiry releases resources. Cannot force debugging or system Settings awake.',fields:[],actions:[{value:'accept',label:'Prepare access'},{value:'decline',label:'Cancel'}]},ctx.signal??new AbortController().signal);
  if(answer.action!=='accept')return result({state:'declined'});
  if(args.purpose==='pair_phone')return result(await access.pair(randomUUID(),watchId,args.phoneId as string));
  hub.sendTo(watchId,{type:'device_access_state',state:'maintenance_offer',detail:'PC requests a watch maintenance session. Open this screen and tap Start maintenance. Nothing started automatically.'});
  return result({state:'offered_on_watch',started:false});
 }})];
 return ()=>stops.forEach(stop=>stop());
}
