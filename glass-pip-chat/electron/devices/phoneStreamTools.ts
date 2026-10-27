import {registerDeviceTool} from '../chatsMcp/index.js';
import {PhoneStream} from './phoneStream.js';
import {embeddedPhoneViewer} from './embeddedPhoneViewer.js';
import {interactions,originatingChat} from './interactions.js';
import type {DeviceHub} from './hub.js';
export function registerPhoneStream(hub:DeviceHub){
 const owner=(args:Record<string,unknown>,caller?:string)=>{if(!caller)throw Error('Native viewer requires an authenticated originating chat.');return originatingChat(args,caller);};
 const stream=new PhoneStream({now:Date.now,connection:id=>hub.connectionSignal(id),send:(id,m)=>hub.sendTo(id,m),view:embeddedPhoneViewer,
  approve:async(deviceId,chatId,signal)=>{const answer=await interactions.request({chatId,kind:'approval',targetDeviceId:deviceId,title:'Show phone in Ally without ADB?',detail:'Read-only local Ally preview for up to15 minutes, roughly1 frame/second. Sensitive content may appear. No audio/input/clipboard/recording. Frames are not given to the agent. You must also open the phone notification and approve Android screen sharing for this session. Stop in either window/device.',fields:[],actions:[{value:'accept',label:'Allow local viewer'},{value:'decline',label:'Decline'}]},signal);return answer.action==='accept';}});
 const result=(v:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(v)}]});
 const properties={chatId:{type:'string'},requestId:{type:'string',minLength:8,maxLength:80},deviceId:{type:'string'}};
 const stops=[registerDeviceTool({name:'phone_stream_start',requiresConfirmation:true,description:'Open an integrated read-only local Ally phone preview without ADB, using the existing authenticated Ally connection on any network. Requires separate raw-view approval AND a fresh native Android MediaProjection capture decision on the phone. No Accessibility-grant substitution, audio, input, recording, clipboard or frames returned to agent. Roughly1fps JPEG preview, not scrcpy performance. Close/Stop, device/chat disconnect, lock or15min expiry ends it. No automatic native consent or retries.',inputSchema:{type:'object',additionalProperties:false,required:['requestId','deviceId'],properties},handler:async(args,ctx)=>{
  const chat=owner(args,ctx.caller);if(!ctx.signal||ctx.signal.aborted)throw Error('Live caller context required.');
  if(typeof args.deviceId!=='string'||typeof args.requestId!=='string'||!hub.capabilities(args.deviceId).includes('native-viewer-v1'))throw Error('Update and connect the Ally phone app for native viewing.');
  return result(await stream.start(args.requestId,args.deviceId,chat,ctx.signal));
 }}),...(['status','stop'] as const).map(action=>registerDeviceTool({name:`phone_stream_${action}`,description:action==='stop'?'Stop this chat’s native local phone viewer and phone projection.':'Read lifecycle counters only; no frames or screen content.',inputSchema:{type:'object',additionalProperties:false,required:['requestId'],properties},handler:async(args,ctx)=>{const chat=owner(args,ctx.caller);return result(action==='stop'?{stopped:stream.stop(String(args.requestId),chat)}:stream.status(String(args.requestId),chat)??{state:'not-found'});}}))];
 return {start:(id:string,deviceId:string,chatId:string,signal:AbortSignal)=>stream.start(id,deviceId,chatId,signal),message:(id:string,m:Record<string,unknown>)=>stream.message(id,m),stopAll:()=>stream.close(),close:()=>{stream.close();stops.forEach(s=>s());}};
}
