import fs from 'node:fs';

export interface ClaudeAllowance {
  status: 'allowed' | 'allowed_warning' | 'rejected';
  window: string; usedPercent: number | null; resetsAt: number | null;
  checkedAt: string; usingOverage: boolean | null;
}
/** Consume provider-issued metadata only; no credentials, prompts or cost-based guesses. */
export class ClaudeAllowanceStore {
  private latest?: ClaudeAllowance;
  constructor(private file: string, private now = Date.now) {}
  observe(event: any) {
    const info = event?.type === 'rate_limit_event' ? event.rate_limit_info : undefined;
    if (!info || !['allowed', 'allowed_warning', 'rejected'].includes(info.status)) return;
    const fraction = typeof info.utilization === 'number' && Number.isFinite(info.utilization) && info.utilization >= 0 && info.utilization <= 1 ? info.utilization : null;
    this.latest = {
      status: info.status, window: typeof info.rateLimitType === 'string' ? info.rateLimitType.slice(0, 80) : 'unspecified',
      usedPercent: fraction === null ? null : fraction * 100,
      resetsAt: typeof info.resetsAt === 'number' && Number.isFinite(info.resetsAt) && info.resetsAt > 0 && info.resetsAt < 8640000000000 ? info.resetsAt * 1000 : null,
      checkedAt: new Date(this.now()).toISOString(), usingOverage: typeof info.isUsingOverage === 'boolean' ? info.isUsingOverage : null,
    };
    // Persist only the sanitized observation, never the raw provider event.
    try { fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.latest)); fs.renameSync(this.file + '.tmp', this.file); } catch { /* Live observation remains available. */ }
  }
  read() {
    let observation = this.latest;
    if (!observation) try {
      const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (['allowed', 'allowed_warning', 'rejected'].includes(value.status) && typeof value.checkedAt === 'string' && typeof value.window === 'string') observation = {
        status: value.status, window: value.window.slice(0,80), checkedAt: value.checkedAt,
        usedPercent: typeof value.usedPercent === 'number' && value.usedPercent >= 0 && value.usedPercent <= 100 ? value.usedPercent : null,
        resetsAt: typeof value.resetsAt === 'number' && Number.isFinite(value.resetsAt) ? value.resetsAt : null,
        usingOverage: typeof value.usingOverage === 'boolean' ? value.usingOverage : null,
      };
    } catch { /* No provider observation yet. */ }
    const age = observation ? this.now() - Date.parse(observation.checkedAt) : Infinity;
    const stale = !Number.isFinite(age) || age < 0 || age > 300000 || (observation?.resetsAt != null && observation.resetsAt <= this.now());
    return { source: 'claude_cli_rate_limit_event', status: stale ? 'unknown' : observation!.status,
      allowanceAvailable: !!observation && !stale, stale, observation: observation ?? null,
      note: 'Claude CLI reports allowance status during real Claude turns. A missing percentage is unknown, not zero. No probe prompt is sent.' };
  }
}
