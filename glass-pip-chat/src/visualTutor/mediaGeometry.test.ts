import {expect,it} from 'vitest';
import {mediaContentRect} from './mediaGeometry';
it('keeps coordinates attached to video content through letterboxing and resize',()=>{
 expect(mediaContentRect(800,800,1600,900)).toEqual({x:0,y:175,width:800,height:450});
 const wide=mediaContentRect(1000,300,1600,900);expect(wide.x).toBeCloseTo(700/3);expect(wide.width).toBeCloseTo(1600/3);expect(wide.height).toBe(300);
 expect(mediaContentRect(0,800,1600,900).width).toBe(0);
});
