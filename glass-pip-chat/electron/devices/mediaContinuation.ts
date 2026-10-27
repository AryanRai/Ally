import {randomBytes,createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {app,shell,powerMonitor} from 'electron';
import {youtubeContinuationUrl} from '../continuity/youtubeContext.js';

type Receipt={status:string;at:number};
type Deps={now:()=>number;unlocked:()=>boolean;open:(url:string)=>Promise<void>;load:()=>Record<string,Receipt>;save:(rows:Record<string,Receipt>)=>void};
/** Authenticated phone UI action, independent of model/chat execution. Tokens never survive restart. */
export class DesktopMediaContinuation {
 private offers=new Map<string,{device:string;id:string;url:string;expires:number}>();
 private receipts:Record<string,Receipt>;
 constructor(private d:Deps){this.receipts=d.load();}
 private key(device:string,id:string){return createHash('sha256').update(device+'\0'+id).digest('hex');}
 private persist(key:string,status:string){const at=this.d.now();this.receipts=Object.fromEntries(Object.entries(this.receipts).filter(([,v])=>at-v.at<86400000).slice(-499));this.receipts[key]={status,at};this.d.save(this.receipts);}
 async message(device:string,kind:string,m:any,send:(value:unknown)=>void){
  const id=typeof m.requestId==='string'?m.requestId:'';
  const reply=(status:string,extra:object={})=>send({type:'media_result',requestId:id,status,...extra});
  try{
   if(kind!=='phone'||!device||!/^[a-zA-Z0-9-]{16,80}$/.test(id)||JSON.stringify(m).length>4096)throw Error('Invalid media request');
   const key=this.key(device,id),old=this.receipts[key];
   if(old){reply(old.status,{message:'Previously attempted; not opened again.'});return;}
   if(m.type==='media_status'){reply('not_attempted');return;}
   if(!this.d.unlocked())throw Error('Unlock the PC before continuing playback');
   if(m.type==='media_prepare'){
    const u=new URL(m.url);if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Only HTTPS YouTube video links are supported');
    if(!Number.isSafeInteger(m.positionMs)||m.positionMs<0||m.positionMs>604800000)throw Error('A reviewed playback position is required');
    const url=youtubeContinuationUrl(u.toString(),m.positionMs/1000);if(!url)throw Error('A supported YouTube video link is required');
    for(const [token,v] of this.offers)if(v.expires<this.d.now()||(v.device===device&&v.id===id))this.offers.delete(token);
    if(this.offers.size>=16)throw Error('Too many pending playback reviews');
    const token=randomBytes(32).toString('hex');this.offers.set(token,{device,id,url,expires:this.d.now()+60000});reply('ready',{token,url,expiresInMs:60000});return;
   }
   if(m.type!=='media_continue'||m.explicit!==true)throw Error('Explicit Continue on PC is required');
   const offer=this.offers.get(m.token);
   if(!offer||offer.device!==device||offer.id!==id||offer.expires<this.d.now())throw Error('Playback review expired or belongs to another device');
   this.offers.delete(m.token);
   // Durable write BEFORE external launch. A crash/timeout is uncertain, never a replay.
   this.persist(key,'opening_uncertain');
   await this.d.open(offer.url);
   this.persist(key,'opened');reply('opened',{message:'Opened the reviewed video at its timestamp in the PC default browser. Playback/login may still need browser interaction.'});
  }catch(e){reply('failed',{message:e instanceof Error?e.message:'Playback continuation failed'});}
 }
 disconnect(device:string){for(const [token,v] of this.offers)if(v.device===device)this.offers.delete(token);}
 clear(){this.offers.clear();}
}
export function desktopMediaContinuation(){
 const file=path.join(app.getPath('userData'),'media-continuation-receipts.json');
 return new DesktopMediaContinuation({now:Date.now,unlocked:()=>['active','idle'].includes(powerMonitor.getSystemIdleState(1)),open:url=>shell.openExternal(url),
  load:()=>{if(!fs.existsSync(file))return {};const rows=JSON.parse(fs.readFileSync(file,'utf8'));if(!rows||typeof rows!=='object'||Array.isArray(rows))throw Error('Invalid media receipt ledger');return rows;},
  save:rows=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(rows));fs.renameSync(file+'.tmp',file);}});
}
