import {randomUUID} from 'node:crypto';
export interface MediaAnnotation {id:string;kind:'pointer'|'arrow'|'highlight'|'text';x:number;y:number;x2?:number;y2?:number;travel?:number;width?:number;height?:number;text?:string;tone:'ink'|'grey'|'orange'|'blue'|'green'|'red';at:number;until?:number;write?:boolean}
export interface LessonBeat {id:string;stepId:string;cue:string;mode:'alongside'|'wait';annotations:MediaAnnotation[];started:boolean;narration?:string;narrationKey?:string}
export interface MediaObservation {boardId:string;stepId:string;token:string;paused:boolean;ended:boolean;currentTime:number;duration:number;rate:number;narration?:{time:number;duration:number;paused:boolean;ended:boolean};bounds:{x:number;y:number;width:number;height:number};pixels:{width:number;height:number};error?:string}
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Expected lesson object');return v as Record<string,unknown>;};
const number=(v:unknown,min:number,max:number)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid lesson coordinate/time');return v;};
const string=(v:unknown,max:number)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Invalid lesson text/ID');return v;};
export function parseLessonBeats(value:unknown):LessonBeat[]{
 if(!Array.isArray(value)||!value.length||value.length>16)throw Error('Stage 1–16 lesson beats');
 const beats=value.map(input=>{const q=object(input);if(q.mode!==undefined&&!['alongside','wait'].includes(String(q.mode)))throw Error('Choose alongside or wait');
  const annotations=q.annotations??[];if(!Array.isArray(annotations)||annotations.length>24)throw Error('At most 24 annotations per beat');
  const marks:MediaAnnotation[]=annotations.map(input=>{const a=object(input);if(!['pointer','arrow','highlight','text'].includes(String(a.kind)))throw Error('Unknown media annotation');
   const tone=a.tone??(a.kind==='pointer'?'blue':'orange');if(!['ink','grey','orange','blue','green','red'].includes(String(tone)))throw Error('Unknown annotation tone');
   const mark:MediaAnnotation={id:string(a.id,80),kind:a.kind as MediaAnnotation['kind'],x:number(a.x,0,1000),y:number(a.y,0,1000),tone:tone as MediaAnnotation['tone'],at:number(a.at??0,0,65)};
   if(a.until!==undefined){mark.until=number(a.until,0,65);if(mark.until<mark.at)throw Error('Annotation ends before it starts');}
   if(a.kind==='arrow'){mark.x2=number(a.x2,0,1000);mark.y2=number(a.y2,0,1000);}
   if(a.kind==='pointer'&&(a.x2!==undefined||a.y2!==undefined)){mark.x2=number(a.x2,0,1000);mark.y2=number(a.y2,0,1000);mark.travel=number(a.travel??.6,.05,10);}
   if(a.kind==='highlight'){mark.width=number(a.width,1,1000);mark.height=number(a.height,1,1000);if(mark.x+mark.width>1000||mark.y+mark.height>1000)throw Error('Highlight outside video');}
   if(a.text!==undefined)mark.text=string(a.text,300);if(a.kind==='text'&&!mark.text)throw Error('Text annotation needs text');
   if(a.write!==undefined){if(typeof a.write!=='boolean')throw Error('write must be boolean');mark.write=a.write;}return mark;
  });
  if(new Set(marks.map(a=>a.id)).size!==marks.length)throw Error('Duplicate annotation ID');
  return{id:string(q.id,80),stepId:string(q.stepId,80),cue:string(q.cue,300),mode:(q.mode??'alongside') as LessonBeat['mode'],annotations:marks,started:false,...(q.narration!==undefined?{narration:string(q.narration,1000)}:{})};
 });
 if(new Set(beats.map(b=>b.id)).size!==beats.length||new Set(beats.map(b=>b.stepId)).size!==beats.length)throw Error('Duplicate lesson beat or step');return beats;
}
/** Actual player observations are scoped to the current board, step and source.
 * No wall-clock timer is treated as proof that a video played or ended. */
export class StudyLesson {
 private currentKey='';private token='';private observation?:MediaObservation;
 private waiters=new Set<()=>void>();
 private receipts=new Map<string,{signature:string;result:unknown}>();
 current(boardId:string,stepId:string,source:string){const key=JSON.stringify([boardId,stepId,source]);if(key!==this.currentKey){this.currentKey=key;this.token=randomUUID();this.observation=undefined;this.changed();}return this.token;}
 invalidate(){this.currentKey='';this.observation=undefined;this.changed();}
 stage<T>(requestId:string,signature:string,apply:()=>T):T{
  const prior=this.receipts.get(requestId);if(prior){if(prior.signature!==signature)throw Error('Lesson requestId reused with different data');return prior.result as T;}
  const result=apply();if(this.receipts.size>=128)this.receipts.delete(this.receipts.keys().next().value!);this.receipts.set(requestId,{signature,result});return result;
 }
 observe(value:MediaObservation){
  if(!value||value.token!==this.token||!this.currentKey)return false;
  const [boardId,stepId]=JSON.parse(this.currentKey);if(value.boardId!==boardId||value.stepId!==stepId)return false;
  if(typeof value.paused!=='boolean'||typeof value.ended!=='boolean'||![value.currentTime,value.duration,value.rate].every(Number.isFinite)||value.currentTime<0||value.duration<0||value.rate<=0||value.rate>4)return false;
  if(value.narration&&(![value.narration.time,value.narration.duration].every(n=>Number.isFinite(n)&&n>=0&&n<=180)||typeof value.narration.paused!=='boolean'||typeof value.narration.ended!=='boolean'))return false;
  if(!value.bounds||!value.pixels||![value.bounds.x,value.bounds.y,value.bounds.width,value.bounds.height,value.pixels.width,value.pixels.height].every(Number.isFinite)||value.bounds.width<0||value.bounds.height<0||value.bounds.width>20000||value.bounds.height>20000||value.pixels.width<0||value.pixels.height<0)return false;
  this.observation={...value,...(value.error?{error:String(value.error).slice(0,300)}:{})};this.changed();return true;
 }
 read(boardId:string,stepId:string){const p=this.observation;return p?.boardId===boardId&&p.stepId===stepId?{...p,status:p.error?'error':p.ended?'ended':p.paused?'paused':'playing'}:{boardId,stepId,status:'unobserved'};}
 async wait(boardId:string,stepId:string,milliseconds=15000,signal?:AbortSignal){
  const done=()=>{const state=this.read(boardId,stepId);return state.status==='ended'||state.status==='error'||signal?.aborted;};
  if(!done())await new Promise<void>(resolve=>{let timer:ReturnType<typeof setTimeout>;const finish=()=>{clearTimeout(timer);this.waiters.delete(changed);signal?.removeEventListener('abort',finish);resolve();};const changed=()=>{if(done()||!this.currentKey)finish();};this.waiters.add(changed);timer=setTimeout(finish,Math.max(1,Math.min(milliseconds,15000)));signal?.addEventListener('abort',finish,{once:true});if(done())finish();});
  return {...this.read(boardId,stepId),...(signal?.aborted?{cancelled:true}:{})};
 }
 private changed(){for(const changed of [...this.waiters])changed();}
 reset(){this.currentKey='';this.observation=undefined;this.receipts.clear();this.changed();}
}
