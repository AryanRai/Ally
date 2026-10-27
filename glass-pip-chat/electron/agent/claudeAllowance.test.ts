// @vitest-environment node
import { expect, it } from 'vitest';
import { ClaudeAllowanceStore } from './claudeAllowance';

it('reports real allowed/rejected metadata without inventing missing percentages or overage permission', () => {
  let now = 1800000000000;
  const store = new ClaudeAllowanceStore('Z:/nonexistent/ally-usage-fixture.json', () => now);
  expect(store.read().status).toBe('unknown');
  store.observe({ type:'rate_limit_event', rate_limit_info:{status:'allowed', rateLimitType:'five_hour',resetsAt:1800003600,overageStatus:'rejected'} });
  expect(store.read()).toMatchObject({status:'allowed',allowanceAvailable:true,observation:{usedPercent:null,usingOverage:null}});
  store.observe({type:'rate_limit_event',rate_limit_info:{status:'rejected',utilization:1,resetsAt:1800003600,isUsingOverage:false}});
  expect(store.read()).toMatchObject({status:'rejected',observation:{usedPercent:100,usingOverage:false}});
  now += 300001; expect(store.read().status).toBe('unknown');
});
it('does not convert a passed reset into available balance or accept unrelated CLI output', () => {
  const store = new ClaudeAllowanceStore('Z:/nonexistent/ally-usage-fixture.json', () => 1800000000000);
  store.observe({type:'result',rate_limit_info:{status:'allowed'}});expect(store.read().status).toBe('unknown');
  store.observe({type:'rate_limit_event',rate_limit_info:{status:'rejected',resetsAt:1799999999,utilization:NaN}});
  expect(store.read()).toMatchObject({status:'unknown',observation:{usedPercent:null}});
});
