// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { planUsageSnapshot, usageTool } from './usage';

const now = 1800000000000;
it('compares remaining account-wide allowance across windows and preserves Claude uncertainty', () => {
  const result=planUsageSnapshot({codex:{checkedAt:new Date(now).toISOString(),windows:[{usedPercent:40,resetsAt:now+1000},{usedPercent:100,resetsAt:now+2000}]},claude:{status:'unknown'}},now);
  expect(result.codex).toMatchObject({status:'exhausted',windows:[{remainingPercent:60},{remainingPercent:0}]});
  expect(result.claude.status).toBe('unknown');
  expect(planUsageSnapshot({codex:{checkedAt:new Date(now).toISOString(),windows:[]}},now).codex.status).toBe('unknown');
});
it('past resets and old account observations never claim live allowance', () => {
  const data={codex:{checkedAt:new Date(now).toISOString(),windows:[{usedPercent:100,resetsAt:now-1}]}};
  expect(planUsageSnapshot(data,now).codex.status).toBe('unknown');
  expect(planUsageSnapshot({...data,codex:{...data.codex,windows:[{usedPercent:20,resetsAt:now+200000}]}},now+61000).codex.status).toBe('unknown');
});
it('MCP read calls the usage reader once and does not invoke a model or forwarding', async () => {
  const read=vi.fn(async()=>({claude:{status:'allowed'},codex:{windows:[]}}));
  const tool=usageTool(read);
  const result=await tool.handler({},{});
  expect(read).toHaveBeenCalledOnce();expect(tool.annotations?.readOnlyHint).toBe(true);
  expect(result.structuredContent?.claude).toEqual({status:'allowed'});
});
