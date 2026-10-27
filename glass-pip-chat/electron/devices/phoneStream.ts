import {randomBytes} from 'node:crypto';
import type {LocalPhoneView} from './embeddedPhoneViewer.js';
export interface NativeStreamDeps {
 now():number;
 connection(deviceId:string):AbortSignal|undefined;
 send(deviceId:string,message:unknown):void;
 approve(deviceId:string,chatId:string,signal:AbortSignal):Promise<boolean>;
 view(stop:()=>void):LocalPhoneView;
}
interface Stream {id:string;deviceId:string;chatId:string;token:string;state:string;expiresAt:number;frames:number;lastFrame:number;controller:AbortController;cleanup:()=>void;view?:LocalPhoneView}
/** Raw bytes terminate at the user's isolated viewer. Public status contains no frame/secret. */
export class PhoneStream {
 private streams=new Map<string,Stream>();
 constructor(private deps:NativeStreamDeps){}
 status(id:string,chatId:string){const s=this.streams.get(id);return s&&s.chatId===chatId?{requestId:s.id,deviceId:s.deviceId,state:s.state,expiresAt:s.expiresAt,framesReceived:s.frames,transport:'native-media-projection-preview',readOnly:true}:undefined;}
 async start(id:string,deviceId:string,chatId:string,parent:AbortSignal){
  if(!/^[\w-]{8,80}$/.test(id)||parent.aborted)throw Error('Invalid or cancelled viewer request.');
  const old=this.streams.get(id);if(old){if(old.deviceId!==deviceId||old.chatId!==chatId)throw Error('Viewer request ID already used.');return this.status(id,chatId);}
  if(this.streams.size>=100)throw Error('Viewer audit full.');
  if([...this.streams.values()].some(s=>s.deviceId===deviceId&&!['stopped','declined'].includes(s.state)))throw Error('Phone already has a native viewer request.');
  const connection=this.deps.connection(deviceId);if(!connection||connection.aborted)throw Error('Phone disconnected.');
  const controller=new AbortController();
  const stop=()=>this.stop(id,chatId);
  const timer=setTimeout(stop,150000);timer.unref?.();
  const s:Stream={id,deviceId,chatId,token:randomBytes(32).toString('hex'),state:'authorizing',expiresAt:0,frames:0,lastFrame:-Infinity,controller,cleanup:()=>{clearTimeout(timer);connection.removeEventListener('abort',stop);parent.removeEventListener('abort',stop);}};
  this.streams.set(id,s);connection.addEventListener('abort',stop,{once:true});parent.addEventListener('abort',stop,{once:true});
  try{
   if(!await this.deps.approve(deviceId,chatId,controller.signal)){s.state='declined';s.cleanup();controller.abort();return this.status(id,chatId);}
   if(controller.signal.aborted||connection.aborted||this.deps.connection(deviceId)!==connection||parent.aborted)return this.status(id,chatId);
   clearTimeout(timer);s.expiresAt=this.deps.now()+900000;s.state='awaiting_native_capture';
   const expiry=setTimeout(stop,900000);expiry.unref?.();const previous=s.cleanup;s.cleanup=()=>{clearTimeout(expiry);previous();};
   s.view=this.deps.view(stop);
   if(controller.signal.aborted){s.view.close();s.view=undefined;return this.status(id,chatId);}
   this.deps.send(deviceId,{type:'viewer_offer',id,token:s.token,expiresAt:s.expiresAt});
  }catch{this.stop(id,chatId);}
  return this.status(id,chatId);
 }
 message(deviceId:string,m:Record<string,unknown>){
  if(typeof m.id!=='string')return;const s=this.streams.get(m.id);
  if(!s||s.deviceId!==deviceId||s.token!==m.token||s.controller.signal.aborted||s.expiresAt<=this.deps.now()||!s.view)return;
  if(m.type==='viewer_end'){this.stop(s.id,s.chatId);return;}
  if(m.type!=='viewer_frame'||typeof m.jpeg!=='string'||m.jpeg.length>240000||this.deps.now()-s.lastFrame<650)return;
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(m.jpeg))return;
  const bytes=Buffer.from(m.jpeg,'base64');if(bytes.length<4||bytes.length>180000||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return;
  s.lastFrame=this.deps.now();s.frames++;s.state='receiving';s.view.frame(bytes);
 }
 stop(id:string,chatId:string){const s=this.streams.get(id);if(!s||s.chatId!==chatId||s.state==='stopped'||s.state==='declined')return false;
  s.state='stopped';s.controller.abort();s.cleanup();this.deps.send(s.deviceId,{type:'viewer_stop',id:s.id,token:s.token});s.view?.close();s.view=undefined;return true;}
 close(){for(const s of this.streams.values())this.stop(s.id,s.chatId);}
}
