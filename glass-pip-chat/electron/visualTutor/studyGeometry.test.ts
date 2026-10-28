import { expect, it } from 'vitest';
import { bindStudyCapture, studyDisplay } from './studyGeometry';
import type { TutorBoard } from './types';
const left={id:2,bounds:{x:-1920,y:0,width:1920,height:1080}},right={id:1,bounds:{x:0,y:0,width:1920,height:1080}};
const physical=()=>({x:-2400,y:0,width:2400,height:1350});
const board=():TutorBoard=>({id:'b',chatId:'c',displayId:2,bounds:{...left.bounds},capturedAt:1,steps:[],sketches:[],selected:0,following:true,sketching:false,frozen:false,revision:0});
it('binds the crop monitor at mixed DPI even when the cursor is on another screen',()=>{
 const context={selection:{bounds:left.bounds,sourcePixels:{width:2400,height:1350},focus:{x:100,y:200,width:300,height:400}}};
 expect(studyDisplay(context,[left,right],()=>right)).toBe(left);
 const b=board();expect(bindStudyCapture(b,context,'crop.png',[left,right],physical)).toBe('crop.png');
 expect(b.screenBounds).toEqual(physical());expect(b.focus).toEqual(context.selection.focus);expect(b.screenPixels).toEqual(context.selection.sourcePixels);
});
it('repairs missing physical bounds on reused boards and never reuses an originless native screenshot',()=>{
 const b=board();b.focus={x:1,y:2,width:3,height:4};
 expect(bindStudyCapture(b,{screenshot:{widthInPixels:1280,heightInPixels:720}},'native.png',[left,right],physical)).toBe('');
 expect(b.screenBounds).toEqual(physical());expect(b.focus).toBeUndefined();
});
it('rejects stale capture monitors instead of falling back to the cursor',()=>{
 expect(()=>studyDisplay({selection:{bounds:left.bounds}},[right],()=>right)).toThrow('display changed');
 expect(()=>bindStudyCapture(board(),{selection:{bounds:right.bounds}},'crop.png',[left,right],physical)).toThrow('another display');
 expect(()=>bindStudyCapture(board(),{},undefined,[right],physical)).toThrow('display changed');
});
