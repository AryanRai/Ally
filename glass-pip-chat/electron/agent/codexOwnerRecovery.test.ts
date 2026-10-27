// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('electron',()=>({shell:{openExternal:vi.fn()}}));
import { CodexDesktopClient, CodexChatUnownedError } from './codexDesktop';
import { recoverExactCodexOwner } from './codexOwnerRecovery';
const id='01a176aa-52ea-7523-97d3-060e0e7c7ec9';
afterEach(()=>vi.restoreAllMocks());
it('opens only the original chat and polls reads until its owner returns',async()=>{
 const c={owner:vi.fn().mockRejectedValueOnce(new CodexChatUnownedError()).mockResolvedValue('owner'),snapshot:vi.fn(async()=>({id})),close:vi.fn()};
 vi.spyOn(CodexDesktopClient,'connect').mockResolvedValue(c as unknown as CodexDesktopClient);
 const open=vi.fn(async()=>{}),pause=vi.fn(async()=>{});
 await recoverExactCodexOwner(id,()=>false,open,pause);
 expect(open).toHaveBeenCalledExactlyOnceWith(`codex://threads/${id}`);
 expect(c.owner.mock.calls).toEqual([[id],[id]]);
 expect(c.snapshot).toHaveBeenCalledWith(id,'owner');expect(c.close).toHaveBeenCalledTimes(2);
 expect(pause).toHaveBeenCalledOnce();
});
it('never accepts a different identity or creates a chat when recovery fails',async()=>{
 const c={owner:vi.fn(async()=> 'owner'),snapshot:vi.fn(async()=>({id:'different'})),close:vi.fn()};
 vi.spyOn(CodexDesktopClient,'connect').mockResolvedValue(c as unknown as CodexDesktopClient);
 await expect(recoverExactCodexOwner(id,()=>false,async()=>{},async()=>{})).rejects.toThrow('No copy was created');
 expect(c.snapshot).toHaveBeenCalledTimes(6);expect(c.close).toHaveBeenCalledTimes(6);
});
it('does not open or reconnect after cancellation and rejects URL injection',async()=>{
 const open=vi.fn(async()=>{}),connect=vi.spyOn(CodexDesktopClient,'connect');
 await recoverExactCodexOwner(id,()=>true,open);
 await expect(recoverExactCodexOwner(id+'?prompt=send',()=>false,open)).rejects.toThrow('identity');
 expect(open).not.toHaveBeenCalled();expect(connect).not.toHaveBeenCalled();
});
