import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { parseManimSpec, type ManimSpec } from './spec.js';
export type ManimState='queued'|'rendering'|'ready'|'error'|'cancelled';
export interface ManimJob {id:string;boardId:string;chatId:string;revision:number;spec:ManimSpec;startAt:number;state:ManimState;created:number;elapsedMs?:number;cacheHit?:boolean;error?:string;sceneStates?:Record<string,ManimSpec['objects']>;clips:Array<{id:string;cue:string;file:string;duration:number}>}
interface Options {python:string;renderer:string;root:string;timeoutMs?:number;render?: (job:ManimJob,folder:string,signal:AbortSignal)=>Promise<ManimJob['clips']>}
/** Bounded single-worker queue. No model request or work in the UI thread. */
export class ManimJobs extends EventEmitter {
  private jobs=new Map<string,ManimJob>();private queue:string[]=[];private active?:{job:ManimJob;abort:AbortController};
  private receipts=new Map<string,{signature:string;id:string}>();
  constructor(private options:Options){super();}
  start(boardId:string,chatId:string,input:unknown,baseId?:string,expectedRevision?:number,requestId?:string,capacity?:number){
    const signature=JSON.stringify({input,baseId,expectedRevision}),receiptKey=boardId+':'+chatId+':'+requestId;
    const receipt=requestId?this.receipts.get(receiptKey):undefined;if(receipt){if(receipt.signature!==signature)throw Error('Render requestId reused with different data');return this.read(receipt.id,boardId,chatId);}
    if(this.receipts.size>=512)throw Error('Render receipt limit reached; restart explicitly.');
    if([...this.jobs.values()].filter(j=>j.state==='queued'||j.state==='rendering').length>=8)throw Error('Manim queue full. Cancel or wait.');
    if(this.jobs.size>=64){const old=[...this.jobs.values()].find(j=>!['queued','rendering'].includes(j.state));if(old)this.jobs.delete(old.id);else throw Error('Manim job limit reached');}
    let spec=parseManimSpec(input),revision=1,startAt=0;
    if(baseId){const base=this.read(baseId,boardId,chatId);if(base.revision!==expectedRevision||base.state!=='ready')throw Error('Stale or unfinished Manim scene. Read status first.');
      if([...this.jobs.values()].some(j=>(j as ManimJob&{parent?:string}).parent===baseId&&['queued','rendering','ready'].includes(j.state)))throw Error('This scene already has a follow-up; read the latest job.');
      startAt=base.spec.sections.length;spec=parseManimSpec({...base.spec,terms:spec.terms,amplitude:spec.amplitude,frequency:spec.frequency,phase:spec.phase,sections:[...base.spec.sections,...spec.sections]});revision=base.revision+1;}
    if(capacity!==undefined&&spec.sections.length-startAt>capacity)throw Error('Study step limit reached. Finish this lesson before starting more animation sections.');
    const job:ManimJob&{parent?:string}={id:randomUUID(),boardId,chatId,spec,revision,startAt,state:'queued',created:Date.now(),clips:[],...(baseId?{parent:baseId}:{})};
    this.jobs.set(job.id,job);if(requestId)this.receipts.set(receiptKey,{signature,id:job.id});this.queue.push(job.id);this.emit('change',structuredClone(job));void this.pump();return structuredClone(job);
  }
  read(id:string,boardId:string,chatId:string){const job=this.jobs.get(id);if(!job||job.boardId!==boardId||job.chatId!==chatId)throw Error('Unknown job or wrong Study board/chat.');return structuredClone(job);}
  async wait(id:string,boardId:string,chatId:string,milliseconds=15000,signal?:AbortSignal){
    const current=this.read(id,boardId,chatId);if(!['queued','rendering'].includes(current.state))return current;
    await new Promise<void>(resolve=>{let timer:ReturnType<typeof setTimeout>;const finish=()=>{clearTimeout(timer);this.off('change',changed);signal?.removeEventListener('abort',finish);resolve();};const changed=(job:ManimJob)=>{if(job.id===id&&!['queued','rendering'].includes(job.state))finish();};timer=setTimeout(finish,Math.max(1,Math.min(milliseconds,20000)));this.on('change',changed);signal?.addEventListener('abort',finish,{once:true});if(signal?.aborted)finish();});
    return this.read(id,boardId,chatId);
  }
  cancel(id:string,boardId:string,chatId:string){this.read(id,boardId,chatId);const job=this.jobs.get(id)!;if(job.state==='ready'||job.state==='error'||job.state==='cancelled')return structuredClone(job);job.state='cancelled';if(this.active?.job.id===id)this.active.abort.abort();this.emit('change',structuredClone(job));return structuredClone(job);}
  revoke(boardId:string){for(const job of this.jobs.values())if(job.boardId===boardId&&['queued','rendering'].includes(job.state))this.cancel(job.id,boardId,job.chatId);}
  close(){for(const j of this.jobs.values())this.revoke(j.boardId);}
  private async pump(){
    if(this.active)return;const id=this.queue.shift();if(!id)return;const job=this.jobs.get(id)!;if(job.state==='cancelled'){void this.pump();return;}
    const abort=new AbortController();this.active={job,abort};job.state='rendering';this.emit('change',structuredClone(job));const began=Date.now();
    const timer=setTimeout(()=>abort.abort(),this.options.timeoutMs??180000);
    try{
      const renderer=await fs.readFile(this.options.renderer);const key=createHash('sha256').update(renderer).update(JSON.stringify({version:'0.22.0',spec:job.spec,startAt:job.startAt,quality:'480p15'})).digest('hex');
      const folder=path.join(this.options.root,key);await fs.mkdir(folder,{recursive:true});
      let clips:ManimJob['clips']|undefined;
      try{const saved=JSON.parse(await fs.readFile(path.join(folder,'clips.json'),'utf8'));if(Array.isArray(saved)&&saved.length){for(const clip of saved){const file=path.resolve(clip.file);if(!file.startsWith(path.resolve(folder)+path.sep)||!(await fs.stat(file)).isFile())throw Error('Invalid cache');}clips=saved;job.cacheHit=true;}}catch{/* Render missing/incomplete cache. */}
      if(!clips){clips=await (this.options.render?this.options.render(job,folder,abort.signal):this.render(job,folder,abort.signal));if(!abort.signal.aborted)await fs.writeFile(path.join(folder,'clips.json'),JSON.stringify(clips));}
      if(abort.signal.aborted)throw Error('Render cancelled or timed out');
      if(job.spec.preset==='scene'&&!this.options.render){
        const saved=await fs.readFile(path.join(folder,'scene-states.json'),'utf8');if(saved.length>1024*1024)throw Error('Rendered state exceeds 1MB');
        const states=JSON.parse(saved);job.sceneStates={};
        for(const section of job.spec.sections){const objects=parseManimSpec({...job.spec,objects:states[section.id],sections:[{id:'frame',cue:'Frame',duration:.2,actions:[]}]}).objects;
          if(objects.length!==job.spec.objects.length||objects.some(o=>!job.spec.objects.some(s=>s.id===o.id&&s.kind===o.kind)))throw Error('Rendered scene IDs changed');
          job.sceneStates[section.id]=objects;
        }
      }
      job.clips=clips;job.state='ready';job.elapsedMs=Date.now()-began;
    }catch(error){if((job.state as ManimState)!=='cancelled'){job.state='error';job.error=abort.signal.aborted?'Render timed out. Retry explicitly after checking status.':String((error as Error).message).slice(-1600);}}
    finally{clearTimeout(timer);this.active=undefined;this.emit('change',structuredClone(job));void this.pump();}
  }
  private async render(job:ManimJob,folder:string,signal:AbortSignal):Promise<ManimJob['clips']>{
    const input=path.join(folder,'input.json');await fs.writeFile(input,JSON.stringify({spec:job.spec,startAt:job.startAt}));
    const args=['-m','manim','--renderer=cairo','-ql','--save_sections','--disable_caching','--media_dir',folder,'--output_file','lesson',this.options.renderer,'AllyLesson'];
    await new Promise<void>((resolve,reject)=>{
      if(signal.aborted){reject(Error('Cancelled'));return;}
      const child=spawn(this.options.python,args,{cwd:folder,windowsHide:true,env:{...process.env,ALLY_MANIM_INPUT:input,OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'2',PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1',PYTHONNOUSERSITE:'1'}});let log='';
      const stop=()=>{if(child.exitCode!==null||!child.pid)return;if(process.platform==='win32')execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{});else child.kill('SIGTERM');};signal.addEventListener('abort',stop,{once:true});
      child.stdout.on('data',b=>{log=(log+b).slice(-4000);});child.stderr.on('data',b=>{log=(log+b).slice(-4000);});
      child.once('error',e=>{signal.removeEventListener('abort',stop);reject(Error('Manim unavailable: '+e.message+'. Run scripts/manim/setup.ps1.'));});
      child.once('exit',code=>{signal.removeEventListener('abort',stop);code===0?resolve():reject(Error('Manim render failed: '+log));});
    });
    const directory=path.join(folder,'videos','lesson','480p15','sections');
    const indexFiles=(await fs.readdir(directory)).filter(n=>n.endsWith('.json'));if(indexFiles.length!==1)throw Error('Manim section manifest missing');
    const entries=JSON.parse(await fs.readFile(path.join(directory,indexFiles[0]),'utf8')) as Array<{name:string;video:string;duration:string}>;
    const clips:ManimJob['clips']=[];
    for(const section of job.spec.sections.slice(job.startAt)){
      const entry=entries.find(e=>e.name===section.id);if(!entry)throw Error('Rendered section missing: '+section.id);
      const file=path.resolve(directory,path.basename(entry.video));const info=await fs.stat(file);if(!info.isFile()||info.size>20*1024*1024)throw Error('Rendered clip exceeds20MB');
      clips.push({id:section.id,cue:section.cue,file,duration:Number(entry.duration)});
    }
    return clips;
  }
}
