import {afterEach,expect,it,vi} from 'vitest';
import {StudyLesson,parseLessonBeats,type MediaObservation} from './lesson';
afterEach(()=>vi.useRealTimers());
const beat={id:'watch',stepId:'clip',cue:'Watch the car.',mode:'wait',annotations:[{id:'car',kind:'pointer',x:100,y:200,at:0,until:2}]};
const observation=(token:string):MediaObservation=>({boardId:'b',stepId:'clip',token,paused:false,ended:false,currentTime:1,duration:3,rate:1,bounds:{x:10,y:20,width:640,height:360},pixels:{width:1280,height:720}});
it('validates bounded clip-relative annotations before any lesson mutation',()=>{
 expect(parseLessonBeats([beat])[0]).toMatchObject({mode:'wait',started:false,annotations:[{id:'car',tone:'blue'}]});
 expect(()=>parseLessonBeats([{...beat,annotations:[{id:'bad',kind:'highlight',x:900,y:0,width:200,height:10}]}])).toThrow('outside video');
 expect(()=>parseLessonBeats([beat,beat])).toThrow('Duplicate');
 expect(()=>parseLessonBeats([{...beat,annotations:[{id:'bad',kind:'text',x:0,y:0}]}])).toThrow('needs text');
});
it('waits for actual ended telemetry, rejecting stale/wrong-board observations',async()=>{
 const lesson=new StudyLesson(),token=lesson.current('b','clip','source');let done=false;
 const wait=lesson.wait('b','clip').then(v=>{done=true;return v;});
 expect(lesson.observe({...observation(token),boardId:'wrong',ended:true})).toBe(false);
 expect(lesson.observe({...observation('stale'),ended:true})).toBe(false);
 lesson.observe({...observation(token),paused:true});await Promise.resolve();expect(done).toBe(false);
 lesson.observe({...observation(token),ended:true,currentTime:3});await expect(wait).resolves.toMatchObject({status:'ended',currentTime:3});
 const next=lesson.current('b','clip','new-source');expect(next).not.toBe(token);expect(lesson.read('b','clip').status).toBe('unobserved');expect(lesson.observe(observation(token))).toBe(false);
});
it('returns observed paused state on timeout without inventing completion and releases waits on close',async()=>{
 vi.useFakeTimers();const lesson=new StudyLesson(),token=lesson.current('b','clip','src');lesson.observe({...observation(token),paused:true});
 const wait=lesson.wait('b','clip',1000);await vi.advanceTimersByTimeAsync(1001);await expect(wait).resolves.toMatchObject({status:'paused',ended:false});
 const closing=lesson.wait('b','clip');lesson.reset();await expect(closing).resolves.toMatchObject({status:'unobserved'});
});
it('keeps stage retries idempotent and rejects conflicting reuse',()=>{
 const lesson=new StudyLesson(),apply=vi.fn(()=>({staged:true}));
 lesson.stage('r','one',apply);lesson.stage('r','one',apply);expect(apply).toHaveBeenCalledOnce();
 expect(()=>lesson.stage('r','different',apply)).toThrow('different data');
});
