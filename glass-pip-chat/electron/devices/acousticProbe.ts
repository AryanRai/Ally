import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {app,powerMonitor} from 'electron';
const frequencies=[1600,2200,2800,3400];
export function chirpWave(symbols:number[]){
 if(symbols.length!==8||symbols.some(v=>!Number.isInteger(v)||v<0||v>3))throw Error('Invalid chirp');
 const count=8*960,buf=Buffer.alloc(44+count*2);buf.write('RIFF');buf.writeUInt32LE(buf.length-8,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(16000,24);buf.writeUInt32LE(32000,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(count*2,40);
 for(let i=0;i<count;i++){const p=i%960;const gain=p<640?Math.min(1,p/80,(640-p)/80):0;buf.writeInt16LE(Math.round(4500*gain*Math.sin(2*Math.PI*frequencies[symbols[Math.floor(i/960)]]*p/16000)),44+i*2);}return buf;
}
export class AcousticProbe {
 private grants=new Map<string,object>();private seen=new Map<string,number>();private last=new Map<string,number>();
 constructor(private d:{now:()=>number;unlocked:()=>boolean;emit:(symbols:number[])=>Promise<void>}){}
 async message(device:string,kind:string,m:any,send:(v:unknown)=>void){
  if(kind!=='phone')return;
  const now=this.d.now();
  if(m.type==='acoustic_enable'){if(m.enabled===true&&this.d.unlocked()){if(!this.grants.has(device))this.grants.set(device,{});}else this.close(device);return;}
  const id=typeof m.requestId==='string'?m.requestId:'';
  const fail=(message:string)=>send({type:'acoustic_error',requestId:id,message});
  const grant=this.grants.get(device);
  if(!/^[a-f0-9-]{36}$/.test(id)||!this.d.unlocked()||!grant){fail('Enable audio proximity while both devices are unlocked');return;}
  const key=device+':'+id;
  for(const [k,v] of this.seen)if(now-v>1800000)this.seen.delete(k);
  if(this.seen.has(key)||now-(this.last.get(device)??-Infinity)<8000){fail('Chirp already attempted or cooling down; no replay');return;}
  this.seen.set(key,now);this.last.set(device,now);
  const symbols=[...randomBytes(8)].map(v=>v&3);
  send({type:'acoustic_challenge',requestId:id,symbols});
  await new Promise(r=>setTimeout(r,350));
  if(!this.d.unlocked()||this.grants.get(device)!==grant){fail('Acoustic session stopped');return;}
  try{await this.d.emit(symbols);}catch{fail('PC could not play its chirp. Check normal audio output.');}
 }
 close(device:string){this.grants.delete(device);}
 clear(){this.grants.clear();}
}
export function desktopAcousticProbe(){return new AcousticProbe({now:Date.now,unlocked:()=>['active','idle'].includes(powerMonitor.getSystemIdleState(1)),emit:async symbols=>{
 const dir=await fs.mkdtemp(path.join(app.getPath('temp'),'ally-chirp-'));const wav=path.join(dir,'probe.wav');
 try{await fs.writeFile(wav,chirpWave(symbols));const helper=fileURLToPath(new URL('../../../assets/acoustic-play.ps1',import.meta.url));
  await new Promise<void>((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',helper,'-Wave',wav],{windowsHide:true,timeout:5000,maxBuffer:4096},err=>err?reject(err):resolve()));
 }finally{await fs.unlink(wav).catch(()=>{});await fs.rmdir(dir).catch(()=>{});}
 }});}
