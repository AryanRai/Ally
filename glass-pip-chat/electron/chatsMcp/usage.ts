import type { ToolDef } from './protocol.js';
import { text } from './protocol.js';

export function planUsageSnapshot(data: any, now = Date.now()) {
  const windows = (data?.codex?.windows ?? []).map((w: any) => ({ ...w, remainingPercent: Math.max(0, 100 - w.usedPercent) }));
  const age = now - Date.parse(data?.codex?.checkedAt ?? '');
  const fresh = Number.isFinite(age) && age >= 0 && age <= 60000;
  const valid = windows.filter((w: any) => w.resetsAt == null || w.resetsAt > now);
  const codex = { source: 'codex_account_rate_limits', checkedAt: data?.codex?.checkedAt ?? null, windows,
    status: !fresh || valid.length !== windows.length || !valid.length ? 'unknown' : valid.some((w: any) => w.remainingPercent === 0) ? 'exhausted' : 'available' };
  const claude = data?.claude ?? { status: 'unknown', allowanceAvailable: false };
  return { checkedAt: new Date(now).toISOString(), codex, claude,
    guidance: 'Plan allowances are account-wide. Unknown or stale does not mean available or exhausted. Local token/cost totals are not subscription balance. Do not switch providers or resend messages automatically; respect the user’s selected chat and provider.' };
}
export function usageTool(read: () => Promise<unknown>): ToolDef {
  return { name: 'ally_usage', description: 'Check Codex and Claude plan allowance before recommending a provider or forwarding work. Codex reports account-wide remaining percentages/reset times. Claude reports its last real CLI allowance event, which may lack percentages or be stale/unknown. Does not send a model prompt, purchase credits or switch providers.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, title: 'Plan usage' },
    handler: async () => { const result = planUsageSnapshot(await read()); return text(JSON.stringify(result), result); } };
}
