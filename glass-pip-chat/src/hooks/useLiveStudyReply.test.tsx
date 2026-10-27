import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLiveStudyReply } from './useLiveStudyReply';
afterEach(cleanup);
it('shows live deltas without waiting for history and ignores stale initial reads and other chats', async () => {
  let receive: any, resolve: any;
  const off=vi.fn();
  window.pip={agent:{liveStudyReply:vi.fn(()=>new Promise(r=>{resolve=r;})),onLiveStudyReply:(callback:any)=>{receive=callback;return off;}}} as any;
  const view=renderHook(({key})=>useLiveStudyReply(key),{initialProps:{key:'codex:one'}});
  const row={key:'codex:one',id:'one',question:'Q',text:'First sentence.',working:true,activity:'Writing',startedAt:1};
  act(()=>receive(row));expect(view.result.current?.text).toBe('First sentence.');
  await act(async()=>resolve(null));expect(view.result.current?.text).toBe('First sentence.');
  act(()=>receive({...row,key:'codex:other',text:'Wrong chat'}));expect(view.result.current?.text).toBe('First sentence.');
  view.rerender({key:'codex:two'});expect(view.result.current).toBeNull();expect(off).toHaveBeenCalledOnce();
});
