// @vitest-environment node
import {expect,it} from 'vitest';
import {nativeToManim,parseManimSpec} from './spec';
import {nativeSceneEdits} from './sceneBridge';
const scene={boardId:'bridge',revision:2,groups:{car:[1,2]},objects:[
 {id:'m0',visible:true,geometry:{do:'line',pts:[[100,380],[1100,380]],tone:'grey'}},
 {id:'m1',visible:true,geometry:{do:'rect',at:[610,350],w:80,h:30,tone:'green'}},
 {id:'m2',visible:true,geometry:{do:'text',at:[675,440],text:'Weight',tone:'orange',size:26}}]};
const spec=()=>parseManimSpec({...nativeToManim(scene,1280,720),preset:'scene',title:'Bridge',sections:[{id:'move',cue:'Move.',duration:1,actions:[]}]});
it('maps a moved car and edited label back to the same native IDs, preserving bridge geometry',()=>{
 const base=spec(),state=structuredClone(base.objects);state[0].nativeChanged=false;
 state[1].at![0]-=3;state[2].at![0]-=3;state[2].text='Weight = mg';
 const result=nativeSceneEdits(base,state,scene,'bridge-write');
 expect(result.commands).toHaveLength(2);expect(result.commands.map(c=>c.id)).toEqual(['m1','m2']);
 expect((result.commands[0].patch as {at:number[]}).at[0]).toBeCloseTo(290);
 expect(result.program).toContain('Weight = mg');expect(result.program).not.toContain('"id":"m0"');
 expect(nativeSceneEdits(base,state,scene,'bridge-write')).toEqual(result);
 expect(scene.objects[1].geometry.at).toEqual([610,350]);
});
it('rejects stale boards, changed geometry, truncated frames and unsupported 3D/rotation before returning edits',()=>{
 const base=spec(),state=structuredClone(base.objects);
 for(const bad of [{...scene,boardId:'wrong'},{...scene,revision:3},{...scene,truncated:true},{...scene,objects:scene.objects.map(o=>({...o,geometry:{...o.geometry,tone:'red'}}))}])expect(()=>nativeSceneEdits(base,state,bad,'x')).toThrow();
 expect(()=>nativeSceneEdits(base,[state[0]],scene,'x')).toThrow('Incomplete');
 state[1].nativeRotation=45;expect(()=>nativeSceneEdits(base,state,scene,'x')).toThrow('Rotated');
});
