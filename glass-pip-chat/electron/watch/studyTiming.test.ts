// @vitest-environment node
import { expect, it } from 'vitest';
import { StudyTiming } from './studyTiming';
it('distinguishes setup from first streamed text, recording each only once', () => {
  let now=100; const timing=new StudyTiming(()=>now);
  now=110;timing.mark('historyReady');now=120;timing.mark('boardReady');
  now=150;timing.mark('accepted');now=1000;timing.mark('firstText');
  now=2000;timing.mark('firstText');
  expect(timing.finish(false)).toEqual({historyReady:10,boardReady:20,accepted:50,firstText:900,total:1900,error:false});
  expect(timing.finish(false)).toBeUndefined();
});
it('reports early failure without fabricating model acceptance or streaming', () => {
  const timing=new StudyTiming(()=>5);
  expect(timing.finish(true)).toEqual({total:0,error:true});
});
