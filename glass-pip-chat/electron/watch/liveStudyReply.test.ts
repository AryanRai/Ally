import { afterEach, expect, it, vi } from 'vitest';
import { StudyReplyFeed } from './liveStudyReply';
afterEach(() => vi.useRealTimers());
it('pushes the newest partial reply before completion, coalesces bursts and isolates sessions', () => {
  vi.useFakeTimers(); const feed = new StudyReplyFeed(), listener = vi.fn(); const off = feed.subscribe(listener);
  const row = {key:'codex:one',id:'turn',question:'Explain the crop',text:'',working:true,activity:'Writing…',startedAt:1};
  for (let i=0;i<1000;i++) feed.publish({...row,text:`Partial ${i}`});
  expect(listener).not.toHaveBeenCalled(); vi.advanceTimersByTime(50);
  expect(listener).toHaveBeenCalledExactlyOnceWith({...row,text:'Partial 999'});
  expect(feed.read('codex:other')).toBeNull();
  feed.finish('turn','Complete answer','Response ready'); vi.advanceTimersByTime(50);
  expect(listener.mock.lastCall?.[0]).toMatchObject({text:'Complete answer',working:false});
  off(); feed.close(); expect(vi.getTimerCount()).toBe(0);
});
it('bounds retained chat count and reply text', () => {
  vi.useFakeTimers();const feed=new StudyReplyFeed();
  for(let i=0;i<20;i++)feed.publish({key:`codex:${i}`,id:`${i}`,question:'Q',text:'x'.repeat(70000),working:false,activity:'Ready',startedAt:1});
  expect(feed.read('codex:0')).toBeNull();expect(feed.read('codex:19')?.text).toHaveLength(64001);feed.close();
});
