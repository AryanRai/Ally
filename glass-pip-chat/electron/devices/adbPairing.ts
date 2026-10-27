import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import QRCode from 'qrcode';
import {setTimeout as delay} from 'node:timers/promises';
import {adbBinary,createAdbRun,AdbPhone} from './adb.js';

export interface PairingDependencies {
 now():number;
 qr(payload:string):Promise<string>;
 services(signal:AbortSignal):Promise<string>;
 pair(endpoint:string,secret:string,signal:AbortSignal):Promise<void>;
 connect(endpoint:string,signal:AbortSignal):Promise<void>;
 identity(endpoint:string,signal:AbortSignal):Promise<string>;
 wait(signal:AbortSignal):Promise<unknown>;
}
export function privateAdbEndpoint(value:string){
 const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/.exec(value);
 if(!m)return false;const [a,b,c,d,port]=m.slice(1).map(Number);
 return [a,b,c,d].every(n=>n<=255)&&port>0&&port<=65535&&(a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168));
}
export function pairingEndpoint(list:string,service:string){
 return list.split(/\r?\n/).map(line=>line.trim().split(/\s+/)).find(p=>p.length===3&&p[0]===service&&p[1]==='_adb-tls-pairing._tcp'&&privateAdbEndpoint(p[2]))?.[2];
}
/** Pairing secret goes through stdin only, never process arguments/errors or public status. */
export function pairViaStdin(endpoint:string,secret:string,signal:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(Error('Pairing cancelled'));return;}
  const child=spawn(adbBinary(),['pair',endpoint],{windowsHide:true,stdio:['pipe','pipe','pipe'],signal});
  let output='';let settled=false;
  const finish=(ok:boolean)=>{if(settled)return;settled=true;clearTimeout(timer);ok?resolve():reject(Error('Native ADB pairing failed. Start a new QR when ready.'));};
  const timer=setTimeout(()=>{child.kill();finish(false);},25_000);
  child.stdout.on('data',chunk=>{output=(output+chunk.toString()).slice(-2000);});
  child.stderr.resume();child.stdin.on('error',()=>finish(false));child.on('error',()=>finish(false));
  child.on('exit',code=>finish(code===0&&/Successfully paired/.test(output)));
  child.stdin.end(secret+'\n');
 });
}
export const pairingDefaults=():PairingDependencies=>{
 const run=createAdbRun(),adb=new AdbPhone(run);
 return {now:Date.now,qr:payload=>QRCode.toDataURL(payload,{errorCorrectionLevel:'M',width:360,margin:4}),
  services:async signal=>(await run(['mdns','services'],signal)).toString(),pair:pairViaStdin,
  connect:async(endpoint,signal)=>{const text=(await run(['connect',endpoint],signal)).toString();if(!/^(?:already )?connected to /m.test(text))throw Error('Native ADB transport did not connect.');},
  identity:(endpoint,signal)=>adb.identity(endpoint,signal),wait:signal=>delay(1200,undefined,{signal})};
};
export interface PairingStatus {id:string;watchId:string;phoneId:string;state:string;expiresAt:number;detail:string;endpoint?:string}
interface Session {status:PairingStatus;controller:AbortController;cleanup:()=>void}
export class AdbQrPairing {
 private sessions=new Map<string,Session>();
 constructor(private deps:PairingDependencies,private send:(id:string,message:unknown)=>void){}
 list(){return [...this.sessions.values()].map(s=>({...s.status}));}
 async start(id:string,watchId:string,phoneId:string,connections:AbortSignal[]){
  if(!/^[\w-]{8,80}$/.test(id)||connections.some(s=>s.aborted))throw Error('Device disconnected or request invalid.');
  const prior=this.sessions.get(id);
  if(prior){if(prior.status.watchId!==watchId||prior.status.phoneId!==phoneId)throw Error('Request ID already used.');return {...prior.status};}
  if(this.sessions.size>=100)throw Error('Pairing audit full.');
  for(const s of this.sessions.values())if(!s.controller.signal.aborted&&s.status.watchId===watchId)throw Error('Stop the current watch QR before starting another.');
  const controller=new AbortController();
  const status:PairingStatus={id,watchId,phoneId,state:'preparing',expiresAt:this.deps.now()+360000,detail:'Scan only from Android Wireless debugging → Pair device with QR code.'};
  const abort=()=>{controller.abort();this.update(session,'cancelled','Pairing stopped or device disconnected.');};
  const timer=setTimeout(abort,360000);timer.unref?.();
  const session:Session={status,controller,cleanup:()=>{clearTimeout(timer);connections.forEach(s=>s.removeEventListener('abort',abort));}};
  connections.forEach(s=>s.addEventListener('abort',abort,{once:true}));this.sessions.set(id,session);
  if(connections.some(s=>s.aborted))abort();
  void this.run(session).catch(()=>{if(!controller.signal.aborted)this.update(session,'failed','Native pairing unavailable or timed out. Use USB or restart pairing manually.');}).finally(()=>{controller.abort();session.cleanup();});
  return {...status};
 }
 private update(session:Session,state:string,detail:string,qrData?:string){
  Object.assign(session.status,{state,detail});
  this.send(session.status.watchId,{type:'device_access_state',...session.status,qrData:qrData??null});
 }
 private async run(s:Session){
  const signal=s.controller.signal,service='studio-'+randomBytes(8).toString('hex'),secret=randomBytes(18).toString('base64url');
  const qr=await this.deps.qr(`WIFI:T:ADB;S:${service};P:${secret};;`);
  if(signal.aborted)return;
  this.update(s,'waiting_for_scan','Scan on your phone in Wireless debugging. No phone control, viewing or installation is granted by this screen.',qr);
  while(!signal.aborted&&this.deps.now()<s.status.expiresAt){
   const endpoint=pairingEndpoint(await this.deps.services(signal),service);
   if(!endpoint){await this.deps.wait(signal);continue;}
   this.update(s,'pairing','Native phone scan detected. Pairing once…');
   await this.deps.pair(endpoint,secret,signal);
   // A fresh connect service on the same native-scanned phone must match Ally's device identity.
   const ip=endpoint.slice(0,endpoint.lastIndexOf(':'));
   let connected:string|undefined;
   for(let i=0;i<8&&!signal.aborted;i++){
    const addresses=(await this.deps.services(signal)).split(/\r?\n/).map(line=>line.trim().split(/\s+/))
      .filter(p=>p.length===3&&p[1]==='_adb-tls-connect._tcp'&&p[2].startsWith(ip+':')&&privateAdbEndpoint(p[2])).map(p=>p[2]);
    for(const target of [...new Set(addresses)]){
     try{await this.deps.connect(target,signal);if(await this.deps.identity(target,signal)===s.status.phoneId){connected=target;break;}}catch{/* stale mDNS endpoint, no device operation */}
    }
    if(connected)break;await this.deps.wait(signal);
   }
   if(signal.aborted)return;
   if(!connected){this.update(s,'paired_unverified','Native pairing completed; expected Ally phone identity/transport is not verified. No access started.');return;}
   s.status.endpoint=connected;this.update(s,'connected','Phone identity verified. Control/viewing still use their separate approval flows.');return;
  }
  if(!signal.aborted)this.update(s,'expired','QR expired. Start a new native scan when ready.');
 }
 stop(id:string,watchId?:string){const s=this.sessions.get(id);if(!s||watchId&&s.status.watchId!==watchId)return false;s.controller.abort();s.cleanup();this.update(s,'cancelled','Stopped. Native Android pairing is not revoked; manage that on the phone.');return true;}
 close(){for(const s of this.sessions.values())this.stop(s.status.id);}
}
