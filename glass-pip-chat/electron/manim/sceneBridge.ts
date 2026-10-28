import {createHash} from 'node:crypto';
import {nativeSceneFingerprint,type ManimSpec,type SceneObject} from './spec.js';
type NativeObject={id:string;visible:boolean;deleted?:boolean;geometry:Record<string,unknown>};
type NativeScene={boardId:string;revision:number;objects:NativeObject[];truncated?:boolean};
/** Produces guarded native commands; never executes them or edits an observed scene. */
export function nativeSceneEdits(spec:ManimSpec,state:SceneObject[],observed:unknown,requestId:string){
 const scene=observed as NativeScene,source=spec.nativeSource;
 if(!source?.width||!source.height||source.boardId!==scene?.boardId||source.revision!==scene.revision||scene.truncated||!Array.isArray(scene.objects))throw Error('Stale/wrong native board, missing source coordinates or incomplete scene. Import a fresh observed scene.');
 if(source.fingerprint!==nativeSceneFingerprint(scene.objects))throw Error('Native geometry changed since import; import a fresh scene');
 if(!/^[\w.-]{1,48}$/.test(requestId))throw Error('Use a stable writeback requestId (1–48 characters)');
 const native=new Map(scene.objects.map(o=>[o.id,o])),initial=new Map(spec.objects.map(o=>[o.id,o]));
 if(!state.length||state.length!==initial.size||new Set(state.map(o=>o.id)).size!==state.length)throw Error('Incomplete rendered scene mapping');
 const commands:Record<string,unknown>[]=[],mapping:Record<string,string>={};let revision=scene.revision;
 const add=(id:string,op:string,fields:Record<string,unknown>={})=>commands.push({boardId:scene.boardId,revision:revision++,requestId:`${requestId}.${commands.length}`,op,id,...fields});
 for(const object of state){
  if(object.nativeChanged===false)continue;
  if(object.nativeRotation&&['rect','text'].includes(object.kind))throw Error('Rotated rectangles/text cannot become editable native shapes');
  const before=initial.get(object.id),mark=native.get(object.id);if(!before||!mark||mark.deleted||!mark.geometry)throw Error('Mapped native object missing/deleted: '+object.id);
  if(!['rect','circle','dot','line','arrow','polygon','text'].includes(object.kind))throw Error('Native writeback supports 2D primitives only: '+object.id);
  const g=mark.geometry,kind=object.kind==='polygon'?'poly':object.kind;
  if(g.do!==kind)throw Error('Native primitive changed: '+object.id);
  const xf=Array.isArray(g.__xf)?g.__xf as number[]:[1,0,0];if(xf.length!==3||!xf.every(Number.isFinite)||xf[0]<=0)throw Error('Unsupported native transform');
  const scale=source.width/12,point=(p:number[])=>[(p[0]*scale+source.width!/2-xf[1])/xf[0],(source.height!/2-p[1]*scale-xf[2])/xf[0]];
  mapping[object.id]=mark.id;
  // Only changed geometry generates ink edits. Unrelated native marks stay untouched.
  const patch:Record<string,unknown>={};
  if(JSON.stringify(object.at)!==JSON.stringify(before.at)||object.width!==before.width||object.height!==before.height){
   if(object.at&&!['line','arrow','polygon'].includes(object.kind)){let at=point(object.at);if(object.kind==='rect')at=[at[0]-(object.width??1)*scale/xf[0]/2,at[1]-(object.height??1)*scale/xf[0]/2];patch.at=at;}
   if(object.kind==='rect'){patch.w=(object.width??1)*scale/xf[0];patch.h=(object.height??1)*scale/xf[0];}
  }
  if(object.radius!==before.radius&&object.radius!==undefined)patch.r=object.radius*scale/xf[0];
  if(object.points&&JSON.stringify(object.points)!==JSON.stringify(before.points))patch.pts=object.points.map(point);
  if(object.text!==before.text&&object.text!==undefined)patch.text=object.text;
  if(Object.values(patch).some(v=>typeof v==='number'&&!Number.isFinite(v)))throw Error('Invalid rendered geometry');
  if(Object.keys(patch).length)add(mark.id,'update',{patch});
  if(object.color.toLowerCase()!==before.color.toLowerCase())add(mark.id,'recolor',{color:object.color});
  if(object.nativeScale!==undefined&&Math.abs(object.nativeScale-1)>.001&&object.kind==='text'){
   if(typeof g.size!=='number')throw Error('Text scaling requires an explicit native font size');
   const size=g.size*object.nativeScale;if(size<=0||size>72)throw Error('Native text size outside supported range');add(mark.id,'restyle',{style:{size}});
  }
  if(object.visible===false&&mark.visible)add(mark.id,'hide');else if(object.visible!==false&&!mark.visible)add(mark.id,'show');
 }
 const digest=createHash('sha256').update(JSON.stringify(state)).digest('hex');
 return{boardId:scene.boardId,sourceRevision:scene.revision,resultRevision:revision,mapping,stateDigest:digest,commands,program:commands.map(c=>`sceneEdit(${JSON.stringify(c)});`).join('\n'),notice:'Emit this program after a short step()/say() cue. This is a plan, not executed ink. Check observed native receipts before claiming success. Same program/request IDs retry idempotently; do not regenerate with a new ID after uncertain delivery.'};
}
