// @vitest-environment node
import { expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import { ManimJobs, type ManimJob } from './jobs';
const spec={preset:'bridge',title:'Bridge',sections:[{id:'car',cue:'Move the car.',duration:1,actions:[]}]};
async function setup(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'ally-manim-jobs-'));const renderer=path.join(root,'lesson.py');await fs.writeFile(renderer,'fixed generator');return {root,renderer,cleanup:async()=>{if(path.dirname(root)===os.tmpdir())await fs.rm(root,{recursive:true,force:true});}};}
const done=async(jobs:ManimJobs,id:string)=>{await vi.waitFor(()=>expect(['ready','error','cancelled']).toContain(jobs.read(id,'b','c').state));return jobs.read(id,'b','c');};
it('serializes renders, caches identical specs, and rejects wrong-owner/stale/conflicting requests',async()=>{
 const f=await setup();let active=0,max=0,renders=0;
 const render=async(job:ManimJob,folder:string)=>{active++;max=Math.max(max,active);renders++;await new Promise(r=>setTimeout(r,10));const file=path.join(folder,'clip.mp4');await fs.writeFile(file,'clip');active--;return job.spec.sections.slice(job.startAt).map(s=>({id:s.id,cue:s.cue,duration:s.duration,file}));};
 const jobs=new ManimJobs({...f,python:'unused',render});
 try{const a=jobs.start('b','c',spec,undefined,undefined,'r1');expect(jobs.start('b','c',spec,undefined,undefined,'r1').id).toBe(a.id);
  expect(()=>jobs.start('b','c',{...spec,title:'Changed'},undefined,undefined,'r1')).toThrow('reused');
  const first=await done(jobs,a.id);expect(first.state).toBe('ready');const b=jobs.start('b','c',spec);expect((await done(jobs,b.id)).cacheHit).toBe(true);expect(renders).toBe(1);expect(max).toBe(1);
  expect(()=>jobs.read(a.id,'other','c')).toThrow('wrong');expect(()=>jobs.start('b','c',spec,a.id,0)).toThrow('Stale');
  const follow=jobs.start('b','c',{...spec,sections:[{id:'return',cue:'Return the car.',duration:1,actions:[{op:'shift',id:'car',value:[1,0]}]}]},a.id,first.revision);
  expect((await done(jobs,follow.id)).startAt).toBe(1);expect(jobs.read(follow.id,'b','c').revision).toBe(2);
 }finally{jobs.close();await f.cleanup();}
});
it('cancels active and queued jobs without allowing a late ready result',async()=>{
 const f=await setup();const render=async(_j:ManimJob,_d:string,signal:AbortSignal)=>new Promise<ManimJob['clips']>((_r,reject)=>{if(signal.aborted)reject(Error('abort'));else signal.addEventListener('abort',()=>reject(Error('abort')),{once:true});});
 const jobs=new ManimJobs({...f,python:'unused',render});
 try{const a=jobs.start('b','c',spec);await vi.waitFor(()=>expect(jobs.read(a.id,'b','c').state).toBe('rendering'));const b=jobs.start('b','c',spec);jobs.revoke('b');expect((await done(jobs,a.id)).state).toBe('cancelled');expect(jobs.read(b.id,'b','c').state).toBe('cancelled');await new Promise(r=>setTimeout(r,20));expect(jobs.read(a.id,'b','c').state).toBe('cancelled');}finally{jobs.close();await f.cleanup();}
});
