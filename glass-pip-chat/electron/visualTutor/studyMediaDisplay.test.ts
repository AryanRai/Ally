import {expect,it} from 'vitest';
import {mediaMayMove} from './studyMediaDisplay';
import type {TutorBoard} from './types';
const board:TutorBoard={id:'b',chatId:'c',displayId:1,bounds:{x:0,y:0,width:1000,height:800},screenBounds:{x:0,y:0,width:1500,height:1200},capturedAt:1,steps:[{id:'clip',title:'clip',explanation:'',marks:[],clip:{jobId:'j',state:'ready'}}],sketches:[],selected:0,following:true,sketching:false,frozen:false,revision:0};
it('allows media placement independently of unchanged crop/source geometry',()=>{
 const copy=structuredClone(board);expect(mediaMayMove(copy,'clip')).toBe(true);expect(copy).toEqual(board);
 expect(mediaMayMove({...copy,frozen:true},'clip')).toBe(false);expect(mediaMayMove({...copy,sketching:true},'clip')).toBe(false);
 const mark={id:'pen',kind:'text' as const,color:'mint' as const,points:[{x:1,y:1}]};
 expect(mediaMayMove({...copy,sketches:[mark]},'clip')).toBe(false);
 expect(mediaMayMove({...copy,steps:[{...copy.steps[0],marks:[mark]}]},'clip')).toBe(false);
});
