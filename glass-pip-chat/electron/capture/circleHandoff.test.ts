// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { CircleHandoff, circlePixels, circleRegion, type CircleCapture } from './circleHandoff';
const capture = { capturedAt: 123, image: {}, display: { id: 7 } } as CircleCapture;
afterEach(() => vi.useRealTimers());
it('hands the frozen selection to only its original chat, once', () => {
  const handoff=new CircleHandoff(); const id=handoff.issue('chat-a',capture);
  expect(()=>handoff.take(id,'chat-b')).toThrow('another chat');
  expect(handoff.take(id,'chat-a')).toBe(capture);
  expect(()=>handoff.take(id,'chat-a')).toThrow('expired');
});
it('revokes expired or replaced captures rather than silently taking a fresh screenshot', () => {
  vi.useFakeTimers(); const handoff=new CircleHandoff(); const id=handoff.issue('chat-a',capture);
  const next=handoff.issue('chat-a',capture); expect(()=>handoff.take(id,'chat-a')).toThrow();
  vi.advanceTimersByTime(60001); expect(()=>handoff.take(next,'chat-a')).toThrow();
});
it('maps selection pixels using actual capture dimensions and clips at screen edges', () => {
  expect(circlePixels({x:100,y:50,width:200,height:100},{width:1000,height:500},{width:1500,height:750})).toEqual({x:150,y:75,width:300,height:150});
  expect(circleRegion({x:990,y:490,width:50,height:50},{width:1000,height:500})).toEqual({x:990,y:490,width:10,height:10});
  expect(()=>circleRegion({x:Infinity,y:0,width:1,height:1},{width:1000,height:500})).toThrow();
  expect(()=>circleRegion({x:1001,y:0,width:50,height:50},{width:1000,height:500})).toThrow();
});
