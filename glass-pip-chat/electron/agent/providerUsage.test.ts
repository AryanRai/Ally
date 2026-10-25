// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
vi.mock('electron', () => ({ app: { getPath: () => { throw Error('Tests must use an isolated ledger'); } } }));
import { CodexUsageReader, UsageLedger, rateWindows, recordProviderUsage } from './providerUsage';
const homes: string[] = [];
afterEach(async () => { for (const home of homes.splice(0)) await fs.rm(home, { recursive: true, force: true }); });
async function file() { const home = await fs.mkdtemp(path.join(os.tmpdir(),'ally-usage-')); homes.push(home); return path.join(home,'usage.json'); }

it('persists concurrent provider reports separately without inventing absent costs or tokens', async () => {
  const name=await file();const ledger=new UsageLedger(name,()=>new Date('2026-10-26T00:00:00Z'));
  await Promise.all([ledger.record('codex',{inputTokens:100,outputTokens:20,cachedTokens:30}),
    ledger.record('claude',{inputTokens:50,costUsd:0.002}),ledger.record('codex',{outputTokens:10})]);
  const result=await new UsageLedger(name).snapshot();
  expect(result).toEqual({version:1,since:'2026-10-26T00:00:00.000Z',codex:{runs:2,inputTokens:100,outputTokens:30,cachedTokens:30},claude:{runs:1,inputTokens:50,costUsd:0.002}});
  expect(result.codex.costUsd).toBeUndefined();expect(result.claude.outputTokens).toBeUndefined();
});
it('ignores absent, negative and non-finite reports while retaining explicit zero', async () => {
  const ledger=new UsageLedger(await file());
  await ledger.record('codex');await ledger.record('codex',{inputTokens:NaN,outputTokens:-1,costUsd:Infinity});
  expect((await ledger.snapshot()).codex).toEqual({runs:0});
  await ledger.record('codex',{outputTokens:0});expect((await ledger.snapshot()).codex).toEqual({runs:1,outputTokens:0});
});
it('serializes opening Settings with incoming completions without losing recorded usage', async () => {
  const ledger=new UsageLedger(await file());
  await Promise.all([ledger.snapshot(),ledger.record('claude',{inputTokens:5}),ledger.snapshot(),ledger.record('codex',{outputTokens:8})]);
  expect(await ledger.snapshot()).toMatchObject({claude:{runs:1,inputTokens:5},codex:{runs:1,outputTokens:8}});
});
it('does not silently overwrite corrupt persisted accounting', async () => {
  const name=await file();await fs.writeFile(name,'broken');const ledger=new UsageLedger(name);
  await expect(ledger.record('claude',{inputTokens:1})).rejects.toThrow();
  expect(await fs.readFile(name,'utf8')).toBe('broken');
  expect(()=>recordProviderUsage('claude',{inputTokens:2})).not.toThrow();
});
it('normalizes named allowance windows and seconds while rejecting missing/invalid percentages', () => {
  expect(rateWindows({rateLimitsByLimitId:{codex:{limitId:'codex',primary:{usedPercent:25,windowDurationMins:300,resetsAt:1800000000},secondary:{usedPercent:null}}}}))
    .toEqual([{name:'codex',window:'primary',usedPercent:25,durationMins:300,resetsAt:1800000000000}]);
  expect(rateWindows({rateLimits:{primary:{usedPercent:101}}})).toEqual([]);
  expect(rateWindows({})).toEqual([]);
});
it('coalesces read-only account requests, caches briefly, and always closes its private RPC', async () => {
  let time=100000;const close=vi.fn();const request=vi.fn(async(method:string)=>method==='account/usage/read'?{summary:{lifetimeTokens:123}}:{rateLimits:{primary:{usedPercent:0}}});
  const connect=vi.fn(async()=>({request,close}));const reader=new CodexUsageReader(connect,()=>time);
  const [first,second]=await Promise.all([reader.read(),reader.read()]);
  expect(first).toEqual(second);expect(connect).toHaveBeenCalledTimes(1);expect(close).toHaveBeenCalledTimes(1);
  expect(request.mock.calls.map(c=>c[0]).sort()).toEqual(['account/rateLimits/read','account/usage/read']);
  expect(first.lifetimeTokens).toBe(123);expect(first.windows[0].usedPercent).toBe(0);
  await reader.read();expect(connect).toHaveBeenCalledTimes(1);
  time+=30001;await reader.read();expect(connect).toHaveBeenCalledTimes(2);
});
it('keeps working account data if one method is unsupported, and closes even on request failures', async () => {
  const close=vi.fn();const reader=new CodexUsageReader(async()=>({close,request:async(method:string)=>{
    if(method==='account/usage/read')throw Error('unsupported');
    return {rateLimits:{primary:{usedPercent:40}}};
  }}));
  const data=await reader.read();expect(data.lifetimeTokens).toBeNull();expect(data.windows).toHaveLength(1);expect(close).toHaveBeenCalledTimes(1);
  const missing=await new CodexUsageReader(async()=>{throw Error('sensitive provider error');}).read();
  expect(missing).toMatchObject({windows:[],lifetimeTokens:null});expect(JSON.stringify(missing)).not.toContain('sensitive');
});
