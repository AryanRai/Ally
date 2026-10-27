export interface HandoffSessionDependencies {
  connection(id:string):AbortSignal|undefined;
  control(deviceId:string,chatId:string,signal:AbortSignal):Promise<unknown>;
  serial(deviceId:string,signal:AbortSignal):Promise<string|undefined>;
  viewer(args:{requestId:string;deviceId:string;serial?:string;chatId:string},signal:AbortSignal):Promise<unknown>;
  nativeAvailable?(deviceId:string):boolean;
  status(deviceId:string,body:string):void;
}
/** Gesture requests existing consent flows. No screen read, operation, viewer approval or agent turn here. */
export class HandoffSessions {
 private seen=new Set<string>();private controllers=new Map<AbortController,()=>void>();
 constructor(private deps:HandoffSessionDependencies){}
 async start(deviceId:string,chatId:string,options:{control:boolean;viewer:boolean},id:string){
  if(this.seen.has(id))return;this.seen.add(id);if(this.seen.size>200)this.seen.delete(this.seen.values().next().value!);
  const connection=this.deps.connection(deviceId);if(!connection||connection.aborted)return;
  if(!/^(codex|claude):[\w-]{8,200}$/.test(chatId)){this.deps.status(deviceId,'Open an existing PC chat to request phone control or viewing.');return;}
  const controller=new AbortController();
  const cleanup=()=>{clearTimeout(expiry);connection.removeEventListener('abort',abort);this.controllers.delete(controller);};
  const abort=()=>{controller.abort();cleanup();};
  const expiry=setTimeout(abort,17*60_000);expiry.unref?.();
  this.controllers.set(controller,abort);connection.addEventListener('abort',abort,{once:true});
  try{
   if(options.control){this.deps.status(deviceId,'Review the 15-minute phone-control request.');try{await this.deps.control(deviceId,chatId,controller.signal);this.deps.status(deviceId,'Phone control session approved for 15 minutes.');}catch(e){this.deps.status(deviceId,e instanceof Error?e.message:'Control was not approved.');}}
   if(options.viewer&&!controller.signal.aborted){const serial=await this.deps.serial(deviceId,controller.signal);if(!serial&&!this.deps.nativeAvailable?.(deviceId))throw Error('No authorized ADB connection for this phone. Local viewer was not opened.');this.deps.status(deviceId,'Review the separate raw live-view request.');await this.deps.viewer({requestId:`handoff-${id}`,deviceId,serial,chatId},controller.signal);this.deps.status(deviceId,'Viewer request finished; check its approval and local window.');}
  }catch(e){this.deps.status(deviceId,e instanceof Error?e.message:'Handoff session could not start.');}
  finally{if(!options.viewer||controller.signal.aborted)cleanup();}
 }
 close(){for(const abort of this.controllers.values())abort();this.controllers.clear();}
}
