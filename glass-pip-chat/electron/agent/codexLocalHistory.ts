import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { setImmediate as yieldToIO } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { codexRolloutPaths, internalCodexSource } from './codexDiscovery.js';
import { rebuildCodexHistoryAsync } from './sessions.js';
import { codexRolloutPending, isRunning } from './sessionActivity.js';
import { readCodexActivity } from './codexActivity.js';
import type { AgentSessionSnapshot } from './types.js';

/** Bounded cache, never a bound on accessible messages. No history writes or writer connection. */
export class CodexLocalHistory {
  private cache = new Map<string, { fingerprint: string; snapshot?: AgentSessionSnapshot }>();
  private pending = new Map<string, Promise<AgentSessionSnapshot | undefined>>();
  constructor(private paths = codexRolloutPaths) {}
  read(id: string): Promise<AgentSessionSnapshot | undefined> {
    const existing = this.pending.get(id);
    if (existing) return existing;
    const work = this.load(id).finally(() => { if (this.pending.get(id) === work) this.pending.delete(id); });
    this.pending.set(id, work); return work;
  }
  private async load(id: string) {
    const files = this.paths(id);
    if (!files.length) return;
    const stats = await Promise.all(files.map(file => fs.stat(file)));
    const fingerprint = createHash('sha256').update(JSON.stringify(stats.map((s, i) => [files[i], s.ino, s.size, s.mtimeMs, s.ctimeMs]))).digest('hex');
    const cached = this.cache.get(id);
    if (cached?.fingerprint === fingerprint) {
      if (!cached.snapshot) return;
      const activity = await readCodexActivity(files.at(-1)).catch(() => undefined);
      return { ...cached.snapshot, running: !!(activity?.pending && activity.recent) };
    }
    const remember = (snapshot?: AgentSessionSnapshot) => {
      this.cache.delete(id); this.cache.set(id, { fingerprint, snapshot });
      while (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!);
    };
    const records: any[] = [];
    const seen = files.length > 1 ? new Set<string>() : undefined;
    for (const file of files) {
      // Validate the first record before reading the body. A filename alias or
      // inherited rollout can be hundreds of MB but still requires native history.
      const stream = createReadStream(file, { encoding: 'utf8' });
      const lines = createInterface({ input: stream, crlfDelay: Infinity });
      let verified = false;
      let deadline = performance.now() + 8;
      try { for await (const line of lines) {
        if (performance.now() >= deadline) { await yieldToIO(); deadline = performance.now() + 8; }
        if (!line.trim()) continue;
        let record: any;
        try { record = JSON.parse(line); } catch { continue; } // unfinished append
        if (!verified) {
          if (record.type !== 'session_meta' || record.payload?.id !== id || internalCodexSource(record.payload) || record.payload?.forked_from_id || record.payload?.forkedFromId || record.payload?.history_base || record.payload?.history_mode === 'paginated') { remember(); return; }
          verified = true;
          if (typeof record.ordinal === 'number' && record.ordinal !== 0) { remember(); return; } // A compacted suffix is not complete history.
        }
        if (seen?.has(line)) continue;
        seen?.add(line); records.push(record);
      } } finally { lines.close(); stream.destroy(); }
      if (!verified) { remember(); return; }
    }
    if (files.length > 1) records.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    if (!records.some(r => r.type === 'response_item' && r.payload?.type === 'message')) { remember(); return; } // App-only/metadata-only history needs the native API.
    const history = await rebuildCodexHistoryAsync(records);
    const lastWrite = Math.max(...stats.map(s => s.mtimeMs));
    const pending = codexRolloutPending(records);
    const snapshot: AgentSessionSnapshot = { ...history, sessionId: id, revision: `local:${fingerprint}`, running: isRunning(pending, lastWrite), createdAt: records.map(r => Date.parse(r.timestamp)).find(t => Number.isFinite(t) && t > 0) ?? 0 };
    // A file that changed while being read is readable now but must not be cached as complete.
    const after = await Promise.all(files.map(file => fs.stat(file)));
    if (stats.every((s, i) => s.size === after[i].size && s.mtimeMs === after[i].mtimeMs && s.ctimeMs === after[i].ctimeMs)) {
      remember(snapshot);
    }
    return snapshot;
  }
}
