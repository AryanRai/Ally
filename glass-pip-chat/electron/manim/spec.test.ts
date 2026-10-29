// @vitest-environment node
import { expect, it } from 'vitest';
import { parseManimSpec, nativeToManim } from './spec';
const sections=[{id:'moveCar',cue:'The car moves.',duration:1,actions:[{op:'shift',id:'car',value:[-3,0]}]}];
it('keeps named objects/groups and rejects invalid targets, code and unbounded lessons',()=>{
  const spec={preset:'scene',title:'Bridge',objects:[{id:'body',kind:'rect',at:[0,0]}],groups:{car:['body']},sections};
  expect(parseManimSpec(spec).groups.car).toEqual(['body']);
  expect(()=>parseManimSpec({...spec,groups:{car:['missing']}})).toThrow();
  expect(()=>parseManimSpec({...spec,sections:[{...sections[0],actions:[{op:'exec',id:'car',value:'code'}]}]})).toThrow();
  expect(()=>parseManimSpec({...spec,objects:[{id:'body',kind:'rect',at:[Infinity,0]}]})).toThrow();
  expect(()=>parseManimSpec({...spec,sections:Array.from({length:8},(_,i)=>({...sections[0],id:'s'+i,duration:10}))})).toThrow();
  expect(()=>parseManimSpec({...spec,objects:[{id:'equation',kind:'math',text:'#read("private")'}]})).toThrow();
  expect(()=>parseManimSpec({...spec,objects:[{id:'equation',kind:'math',text:'read(str(123))'}]})).toThrow();
});
it('imports observed native marks and semantic groups with screen coordinate/transform conversion',()=>{
  const imported=nativeToManim({boardId:'123-bridge',revision:3,groups:{car:[2]},objects:[{id:'m2',visible:true,geometry:{do:'rect',at:[600,300],w:100,h:40,tone:'leaf',__xf:[1,-200,0]}}]},1200,720);
  expect(imported.objects[0].at).toEqual([-1.5,.4]);expect(imported.groups.car).toEqual(['m2']);expect(imported.nativeSource?.revision).toBe(3);
  expect(parseManimSpec({...imported,preset:'scene',title:'Imported',sections}).nativeSource?.boardId).toBe('123-bridge');
  expect(()=>nativeToManim({truncated:true,boardId:'b',revision:1,objects:[]},1280,720)).toThrow();
});
