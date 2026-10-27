import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CodexRpc } from './codexRpc.js';
import type { AgentProvider, AgentUsage } from './types.js';
import { ClaudeAllowanceStore } from './claudeAllowance.js';

type Totals = { runs: number; inputTokens?: number; outputTokens?: number; cachedTokens?: number; costUsd?: number };
type Ledger = { version: 1; since: string; codex: Totals; claude: Totals };
const fields = ['inputTokens', 'outputTokens', 'cachedTokens', 'costUsd'] as const;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Small aggregate only: no transcript reads or periodic history scans. */
export class UsageLedger {
  private state?: Ledger;
  private lane: Promise<unknown> = Promise.resolve();
  constructor(private file: string, private now = () => new Date()) {}
  private async load(): Promise<Ledger> {
    if (this.state) return this.state;
    try {
      const value = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (value.version !== 1 || !Number.isFinite(Date.parse(value.since))) throw Error('Invalid usage ledger');
      for (const provider of ['codex', 'claude']) {
        if (!finite(value[provider]?.runs)) throw Error('Invalid usage totals');
        for (const key of fields) if (value[provider][key] !== undefined && !finite(value[provider][key])) throw Error('Invalid usage total');
      }
      this.state = value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.state = { version: 1, since: this.now().toISOString(), codex: { runs: 0 }, claude: { runs: 0 } };
    }
    return this.state!;
  }
  record(provider: AgentProvider, usage?: AgentUsage) {
    if (!usage || !fields.some(key => finite(usage[key]))) return Promise.resolve();
    const operation = this.lane.then(async () => {
      const state = await this.load();
      const total = state[provider];
      total.runs++;
      for (const key of fields) if (finite(usage[key])) total[key] = (total[key] ?? 0) + usage[key]!;
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const temporary = this.file + '.tmp';
      await fs.writeFile(temporary, JSON.stringify(state));
      await fs.rename(temporary, this.file);
    });
    this.lane = operation.catch(() => {});
    return operation;
  }
  snapshot(): Promise<Ledger> {
    const operation = this.lane.then(async () => structuredClone(await this.load()));
    this.lane = operation.catch(() => {});
    return operation;
  }
}

let ledger: UsageLedger | undefined;
const localLedger = () => ledger ??= new UsageLedger(path.join(app.getPath('userData'), 'provider-usage.json'));
export function recordProviderUsage(provider: AgentProvider, usage?: AgentUsage) {
  // Accounting must never interrupt a response or surface private provider errors.
  try { void localLedger().record(provider, usage).catch(() => {}); } catch { /* App is shutting down. */ }
}

export function rateWindows(result: any) {
  const limits = result?.rateLimitsByLimitId && typeof result.rateLimitsByLimitId === 'object'
    ? Object.values(result.rateLimitsByLimitId) : result?.rateLimits ? [result.rateLimits] : [];
  return limits.flatMap((limit: any) => ['primary', 'secondary'].flatMap(key => {
    const value = limit?.[key];
    if (!finite(value?.usedPercent) || value.usedPercent > 100) return [];
    return [{ name: typeof limit.limitName === 'string' ? limit.limitName.slice(0,100) : typeof limit.limitId === 'string' ? limit.limitId.slice(0,100) : 'Codex',
      window: key, usedPercent: value.usedPercent,
      durationMins: finite(value.windowDurationMins) ? value.windowDurationMins : null,
      resetsAt: finite(value.resetsAt) && value.resetsAt < 8640000000000 ? value.resetsAt * 1000 : null }];
  }));
}

type UsageRpc = Pick<CodexRpc, 'request' | 'close'>;
/** Demand-only, coalesced reads; never starts/resumes a conversation. */
export class CodexUsageReader {
  private cached?: { binary?: string; at: number; value: any };
  private pending?: Promise<any>;
  constructor(private connect: (binary?: string) => Promise<UsageRpc> = binary => CodexRpc.connect(binary), private now = Date.now) {}
  read(binary?: string): Promise<any> {
    if (this.cached && this.cached.binary === binary && this.now() - this.cached.at < 30000) return Promise.resolve(this.cached.value);
    if (this.pending) return this.pending;
    this.pending = (async () => {
      let rpc: UsageRpc | undefined;
      let windows: ReturnType<typeof rateWindows> = [], lifetimeTokens: number | null = null;
      try {
        rpc = await this.connect(binary);
        const [limits, usage] = await Promise.allSettled([
          rpc.request('account/rateLimits/read', {}, 7000), rpc.request('account/usage/read', {}, 7000),
        ]);
        if (limits.status === 'fulfilled') windows = rateWindows(limits.value);
        if (usage.status === 'fulfilled' && finite(usage.value?.summary?.lifetimeTokens)) lifetimeTokens = usage.value.summary.lifetimeTokens;
      } catch { /* The CLI/account may not expose these read-only methods. */ }
      finally { rpc?.close(); }
      const value = { windows, lifetimeTokens, checkedAt: new Date(this.now()).toISOString() };
      this.cached = { binary, at: this.now(), value };
      return value;
    })().finally(() => { this.pending = undefined; });
    return this.pending;
  }
}
const codexUsage = new CodexUsageReader();
let claudeAllowance: ClaudeAllowanceStore | undefined;
const claudePlan = () => claudeAllowance ??= new ClaudeAllowanceStore(path.join(app.getPath('userData'), 'claude-allowance.json'));
export function observeClaudeAllowance(event: unknown) { try { claudePlan().observe(event); } catch { /* Usage cannot interrupt an agent. */ } }
export async function readProviderUsage(binary?: string) {
  const [recorded, codex] = await Promise.all([
    localLedger().snapshot().catch(() => null), codexUsage.read(binary),
  ]);
  return { recorded, codex, claude: claudePlan().read() };
}
