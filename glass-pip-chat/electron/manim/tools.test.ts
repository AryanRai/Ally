// @vitest-environment node
import {expect,it,vi} from 'vitest';
const registry=vi.hoisted(()=>({register:vi.fn()}));
vi.mock('../chatsMcp/index.js',()=>({registerDeviceTool:registry.register}));
import {registerManimTools} from './tools';
import type {ManimJobs} from './jobs';
it('requires the current board/caller before reading, waiting, cancelling or rendering',async()=>{
 const owner=vi.fn(()=>({id:'board',chatId:'codex:chat',capacity:8}));
 const result={id:'job',boardId:'board',chatId:'codex:chat',revision:1,state:'ready',spec:{preset:'bridge',sections:[]},clips:[{id:'s',file:'private-render-path',cue:'Ready',duration:1}]};
 const jobs={read:vi.fn(()=>result),wait:vi.fn(async()=>result),start:vi.fn((..._args:unknown[])=>result),cancel:vi.fn(()=>result)};
 registerManimTools(jobs as unknown as ManimJobs,owner);const tool=registry.register.mock.calls.at(-1)![0];
 const response=await tool.handler({action:'wait',boardId:'board',jobId:'job'},{caller:'codex:chat'});
 expect(owner).toHaveBeenCalledWith('board','codex:chat');expect(jobs.wait).toHaveBeenCalledWith('job','board','codex:chat',15000,undefined);
 expect(response.content[0].text).not.toContain('private-render-path');
 owner.mockImplementationOnce(()=>{throw Error('wrong board');});await expect(tool.handler({action:'cancel',boardId:'other',jobId:'job'},{})).rejects.toThrow('wrong board');expect(jobs.cancel).not.toHaveBeenCalled();
 await tool.handler({action:'followup',boardId:'board',jobId:'job',expectedRevision:1,requestId:'retry',parameters:{frequency:2,untrusted:'ignored'},sections:[]},{caller:'codex:chat'});
 expect(jobs.start.mock.calls.at(-1)![2]).toMatchObject({frequency:2});expect(jobs.start.mock.calls.at(-1)![2]).not.toHaveProperty('untrusted');
});
