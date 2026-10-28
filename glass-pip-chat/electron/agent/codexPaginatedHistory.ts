import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { setImmediate as yieldToIO } from 'node:timers/promises';
import { canonicalTurnId } from './codexDesktop.js';
import { internalCodexSource } from './codexDiscovery.js';
import { rebuildCodexHistoryAsync } from './sessions.js';
import type { AgentHistoryMessage } from './types.js';

interface Suffix {
  turnIds: Set<string>;
  messages: AgentHistoryMessage[];
  cwd?: string;
}

/** A paginated rollout is only the current suffix, never a replacement for its
 * inherited native history. Read the exact API-supplied path and validate its
 * self-lineage before overlaying complete turn groups onto the native base. */
export class CodexPaginatedHistory {
  private cache = new Map<string, { revision: string; suffix?: Suffix }>();
  async read(id: string, file?: string): Promise<Suffix | undefined> {
    if (!file) return;
    const stat = await fs.stat(file);
    const revision = JSON.stringify([file, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs]);
    const cached = this.cache.get(id);
    if (cached?.revision === revision) return cached.suffix;
    const remember = (suffix?: Suffix) => {
      this.cache.delete(id); this.cache.set(id, { revision, suffix });
      while (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!);
      return suffix;
    };
    const stream = createReadStream(file, { encoding: 'utf8' });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    const groups: Array<{ id: string; records: any[] }> = [];
    let verified = false, ordinal = -1, current: typeof groups[number] | undefined;
    let deadline = performance.now() + 8;
    try {
      for await (const line of lines) {
        if (performance.now() >= deadline) { await yieldToIO(); deadline = performance.now() + 8; }
        if (!line.trim()) continue;
        let record: any;
        try { record = JSON.parse(line); } catch { continue; } // unfinished append
        const p = record.payload;
        if (!verified) {
          const base = p?.history_base;
          if (record.type !== 'session_meta' || p?.id !== id || p?.history_mode !== 'paginated'
            || internalCodexSource(p) || p?.forked_from_id || p?.forkedFromId
            || base?.thread_id !== id || !Number.isSafeInteger(base.end_ordinal_exclusive)
            || base.end_ordinal_exclusive < 0 || record.ordinal !== base.end_ordinal_exclusive) return remember();
          ordinal = record.ordinal; verified = true; continue;
        }
        if (!Number.isSafeInteger(record.ordinal) || record.ordinal !== ordinal + 1) return remember();
        ordinal = record.ordinal;
        if (record.type === 'event_msg' && p?.type === 'task_started') {
          const turn = canonicalTurnId(p.turn_id);
          if (!turn || (p.thread_id && p.thread_id !== id) || groups.some(g => g.id === turn)) return remember();
          current = { id: turn, records: [] }; groups.push(current);
        }
        // Never invent a turn from an unanchored fragment.
        if (current) current.records.push(record);
      }
    } finally { lines.close(); stream.destroy(); }
    if (!verified || !groups.length) return remember();
    const suffix: Suffix = { turnIds: new Set(), messages: [] };
    for (const group of groups) {
      if (!group.records.some(r => r.type === 'response_item' && r.payload?.type === 'message' && r.payload.role === 'user')) continue;
      const rebuilt = await rebuildCodexHistoryAsync(group.records);
      suffix.turnIds.add(group.id); suffix.messages.push(...rebuilt.messages);
      suffix.cwd = rebuilt.cwd ?? suffix.cwd;
    }
    // Cache only a stable append revision; the next poll must see a racing write.
    const after = await fs.stat(file);
    if (after.size === stat.size && after.mtimeMs === stat.mtimeMs && after.ctimeMs === stat.ctimeMs) return remember(suffix);
    return suffix;
  }
}
