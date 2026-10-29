import {createHash} from 'node:crypto';
export const MANIM_PRESETS = ['fourier','phasor','bridge','mechanism','scene'] as const;
export interface SceneObject { id:string; kind:'rect'|'circle'|'dot'|'line'|'arrow'|'text'|'math'|'polygon'|'box'|'sphere'; at?:number[]; points?:number[][]; width?:number; height?:number; radius?:number; text?:string; color:string; fill?:boolean; visible?:boolean; nativeScale?:number; nativeChanged?:boolean; nativeRotation?:number }
export interface SceneAction { op:'move'|'shift'|'scale'|'rotate'|'recolor'|'text'|'hide'|'show'; id:string; value:number|string|number[] }
export interface LessonSection { id:string; cue:string; duration:number; actions:SceneAction[] }
export interface ManimSpec { preset:typeof MANIM_PRESETS[number]; title:string; terms:number; amplitude:number;frequency:number;phase:number;objects:SceneObject[]; groups:Record<string,string[]>; sections:LessonSection[]; nativeSource?:{boardId:string;revision:number;width?:number;height?:number;fingerprint?:string}; }
const record=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Expected an object');return v as Record<string,unknown>;};
const str=(v:unknown,max=120)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Invalid lesson string');return v;};
const id=(v:unknown)=>{const s=str(v,80);if(!/^[a-zA-Z][\w.-]*$/.test(s))throw Error('Invalid semantic ID');return s;};
const num=(v:unknown,min:number,max:number)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid finite lesson number');return v;};
const vector=(v:unknown)=>{if(!Array.isArray(v)||v.length<2||v.length>3)throw Error('Use a 2D/3D vector');return v.map(n=>num(n,-30,30));};
const color=(v:unknown)=>{const s=str(v,24);if(!/^(#[\da-f]{6}|white|grey|gray|red|green|blue|orange|yellow|purple|teal|pink|black)$/i.test(s))throw Error('Use a named color or #RRGGBB');return s;};
const math=(v:unknown)=>{
  const s=str(v,300);
  if(!/^[a-zA-Z0-9\s()+\-*/=^_.,:|<>!{}\[\]√π∑∫∞α-ωΑ-Ω]+$/.test(s)||/(?<!\d)\.|\.(?!\d)/.test(s))throw Error('Use a mathematical Typst expression without markup, strings or field access');
  const functions=new Set(['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','exp','ln','log','sqrt','root','frac','norm','abs','floor','ceil','round','min','max','sum','product','integral','lim','vec','mat','cases','binom','det','bold','upright','italic','cal','bb','f','g','h']);
  for(const match of s.matchAll(/([a-zA-Z][a-zA-Z0-9_-]*)\s*\(/g))if(!functions.has(match[1].replace(/_$/,'')))throw Error('Only mathematical functions are supported');
  return s;
};
export function parseManimSpec(value:unknown):ManimSpec {
  const q=record(value),preset=q.preset??'scene';if(!MANIM_PRESETS.includes(preset as never))throw Error('Unknown Manim preset');
  if(!Array.isArray(q.objects??[])||((q.objects as unknown[]|undefined)?.length??0)>80)throw Error('At most 80 scene objects');
  const objects=(q.objects as unknown[]??[]).map(v=>{const o=record(v);const kind=o.kind;if(!['rect','circle','dot','line','arrow','text','math','polygon','box','sphere'].includes(String(kind)))throw Error('Unknown scene primitive');
    const result:SceneObject={id:id(o.id),kind:kind as SceneObject['kind'],color:color(o.color??'white')};
    if(o.at!==undefined)result.at=vector(o.at);
    if(o.width!==undefined)result.width=num(o.width,0.02,24);if(o.height!==undefined)result.height=num(o.height,0.02,14);if(o.radius!==undefined)result.radius=num(o.radius,0.01,7);
    if(o.text!==undefined)result.text=kind==='math'?math(o.text):str(o.text,300);if((kind==='text'||kind==='math')&&!result.text)throw Error('Text requires words');
    if(['line','arrow','polygon'].includes(String(kind))){if(!Array.isArray(o.points)||o.points.length<2||o.points.length>256)throw Error('Invalid scene points');result.points=o.points.map(vector);}
    if(o.nativeChanged!==undefined){if(typeof o.nativeChanged!=='boolean')throw Error('Invalid changed flag');result.nativeChanged=o.nativeChanged;}if(o.nativeRotation!==undefined)result.nativeRotation=num(o.nativeRotation,-10000,10000);
    if(o.visible!==undefined){if(typeof o.visible!=='boolean')throw Error('Invalid visibility');result.visible=o.visible;}if(o.nativeScale!==undefined)result.nativeScale=num(o.nativeScale,.001,100);
    if(o.fill!==undefined){if(typeof o.fill!=='boolean')throw Error('Invalid fill');result.fill=o.fill;}return result;});
  const names=new Set(objects.map(o=>o.id));if(names.size!==objects.length)throw Error('Duplicate scene ID');
  const groups:Record<string,string[]>={};for(const [name,members]of Object.entries(record(q.groups??{}))){id(name);if(names.has(name)||!Array.isArray(members)||!members.length||members.length>80||members.some(m=>typeof m!=='string'||!names.has(m)))throw Error('Groups must name existing objects');groups[name]=[...new Set(members)] as string[];}
  if(Object.keys(groups).length>32)throw Error('At most32groups');Object.keys(groups).forEach(k=>names.add(k));
  const presetNames:Record<string,string[]>={bridge:['deck','leftTower','rightTower','cable','body','wheelLeft','wheelRight','weight','weightLabel','car'],mechanism:['crank','pin','piston','rod'],fourier:['wave','projection',...Array.from({length:12},(_,i)=>'ring'+i),...Array.from({length:12},(_,i)=>'vector'+i)],phasor:['wave','projection','ring0','vector0']};
  if(!Array.isArray(q.sections)||!q.sections.length||q.sections.length>8)throw Error('Use1–8lesson sections');
  const sections=q.sections.map(v=>{const s=record(v);if(!Array.isArray(s.actions??[])||((s.actions as unknown[]|undefined)?.length??0)>80)throw Error('At most80actions');
    const actions=(s.actions as unknown[]??[]).map(v=>{const a=record(v),op=String(a.op),target=id(a.id);if(preset==='scene'?!names.has(target):!presetNames[String(preset)]?.includes(target))throw Error('Unknown scene target '+target);
      const index=/^(ring|vector)(\d+)$/.exec(target);if(preset==='fourier'&&index&&Number(index[2])>=Number(q.terms??5))throw Error('Unknown harmonic target');
      if(!['scene','bridge'].includes(String(preset))&&!['recolor','hide','show'].includes(op))throw Error('This preset geometry is driven by parameters; use a custom scene for transforms.');
      let val:number|string|number[];
      if(op==='move'||op==='shift')val=vector(a.value);
      else if(op==='scale')val=num(a.value,0.1,5);else if(op==='rotate')val=num(a.value,-720,720);
      else if(op==='recolor')val=color(a.value);else if(op==='text'){
        const object=objects.find(o=>o.id===target);if(preset==='scene'&&!['text','math'].includes(object?.kind??''))throw Error('Text edit requires a text/math object');if(preset!=='scene'&&!(preset==='bridge'&&target==='weightLabel'))throw Error('This preset target is not text');val=object?.kind==='math'?math(a.value):str(a.value,300);}
      else if(op==='hide'||op==='show')val=0;else throw Error('Unknown scene action');
      return {op:op as SceneAction['op'],id:target,value:val};});
    return {id:id(s.id),cue:str(s.cue,300),duration:num(s.duration??3,0.2,10),actions};});
  if(new Set(sections.map(s=>s.id)).size!==sections.length||sections.reduce((a,s)=>a+s.duration,0)>60)throw Error('Duplicate section ID or lesson exceeds60seconds');
  const result:ManimSpec={preset:preset as ManimSpec['preset'],title:str(q.title??'Ally lesson'),terms:num(q.terms??5,1,12),amplitude:num(q.amplitude??1,0.1,2),frequency:num(q.frequency??1,.25,4),phase:num(q.phase??0,-180,180),objects,groups,sections};
  if(!Number.isInteger(result.terms))throw Error('Terms must be an integer');
  if(preset==='scene'&&!objects.length)throw Error('Supply scene objects');
  if(q.nativeSource!==undefined){const source=record(q.nativeSource);result.nativeSource={boardId:str(source.boardId,80),revision:num(source.revision,0,1000000),...(source.width!==undefined?{width:num(source.width,1,16000),height:num(source.height,1,16000),...(source.fingerprint!==undefined?{fingerprint:str(source.fingerprint,64)}:{})}:{})};}
  return result;
}

/** Import observed native 2D data, preserving mark/group names. Never reads a live screen. */
export function nativeToManim(scene:unknown,width:number,height:number):Pick<ManimSpec,'objects'|'groups'|'nativeSource'> {
  num(width,1,16000);num(height,1,16000);const s=record(scene);str(s.boardId,80);num(s.revision,0,1000000);
  if(s.truncated||!Array.isArray(s.objects)||s.objects.length>80)throw Error('Use a complete native scene of at most80objects');
  const scale=12/width,pt=(p:number[])=>[(p[0]-width/2)*scale,(height/2-p[1])*scale];
  const tones:Record<string,string>={ink:'#30333A',grey:'#7E838D',leaf:'#3E9E5C',mint:'#7ED6A0',sky:'#5AA8F5',butter:'#FFD84D'};
  const objects:SceneObject[]=s.objects.filter(v=>{const o=record(v);return o.visible&&!o.deleted;}).map(v=>{
    const o=record(v),g=record(o.geometry),kind=g.do,xf=Array.isArray(g.__xf)?g.__xf:[1,0,0],point=(p:number[])=>pt([p[0]*xf[0]+xf[1],p[1]*xf[0]+xf[2]]);
    if(!['rect','circle','dot','line','arrow','text','poly'].includes(String(kind)))throw Error('Native import supports rect/circle/dot/line/arrow/text/poly');
    const result:SceneObject={id:id(o.id),kind:(kind==='poly'?'polygon':kind) as SceneObject['kind'],color:color(tones[String(g.tone)]??g.tone??'white')};
    const at=Array.isArray(g.at)?g.at:[0,0];
    if(kind==='rect'){result.width=Number(g.w)*scale*xf[0];result.height=Number(g.h)*scale*xf[0];result.at=point([at[0]+Number(g.w)/2,at[1]+Number(g.h)/2]);}
    else result.at=point(at as number[]);
    if(g.r!==undefined)result.radius=Number(g.r)*scale*xf[0];if(g.text!==undefined)result.text=String(g.text);
    if(Array.isArray(g.pts))result.points=g.pts.map(p=>point(p as number[]));result.fill=!!g.fill&&g.fill!=='none';return result;});
  const names=new Set(objects.map(o=>o.id)),groups:Record<string,string[]>={};for(const [key,members]of Object.entries(record(s.groups??{}))){if(Array.isArray(members)){const ids=members.map(i=>'m'+i).filter(k=>names.has(k));if(ids.length)groups[key]=ids;}}
  return {objects,groups,nativeSource:{boardId:String(s.boardId),revision:Number(s.revision),width,height,fingerprint:nativeSceneFingerprint(s.objects)}};
}

export const nativeSceneFingerprint=(objects:unknown)=>createHash('sha256').update(JSON.stringify((objects as Array<Record<string,unknown>>).map(o=>({id:o.id,visible:o.visible,deleted:!!o.deleted,geometry:o.geometry})))).digest('hex');
