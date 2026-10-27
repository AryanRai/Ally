import fs from 'node:fs/promises';
import { isRunning } from './sessionActivity.js';

export interface CodexActivity {
  turnId: string | undefined; pending: boolean; recent: boolean; updatedAt: number;
  /** Additive lifecycle detail; older readers may only provide pending. */
  status?: 'running' | 'completed' | 'stopped';
}

// Keep lifecycle metadata only, never transcript bodies. The running picker
// scans old rollouts too, so unchanged files should not be reopened/decoded.
const cache = new Map<string, { revision: string; activity?: Omit<CodexActivity, 'recent'> }>();

/** The reader app-server does not own another server's runtime status. Use the
 * exact persisted turn lifecycle, without resuming or attaching a writer. */
export async function readCodexActivity(file?: string, now = Date.now()): Promise<CodexActivity | undefined> {
  if (!file) return undefined;
  const stat = await fs.stat(file);
  const revision = JSON.stringify([stat.dev, stat.ino, stat.birthtimeMs, stat.size, stat.mtimeMs, stat.ctimeMs]);
  const cached = cache.get(file);
  if (cached?.revision === revision) return cached.activity && { ...cached.activity, recent: isRunning(true, stat.mtimeMs, now) };
  const remember = (activity?: Omit<CodexActivity, 'recent'>) => {
    cache.delete(file); cache.set(file, { revision, activity });
    if (cache.size > 1024) cache.delete(cache.keys().next().value!);
    return activity && { ...activity, recent: isRunning(true, stat.mtimeMs, now) };
  };
  const handle = await fs.open(file, 'r');
  try {
    let end = stat.size, remainder = '';
    while (end > 0) {
      const length = Math.min(end, 65536);
      end -= length;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, end);
      const lines = (buffer.toString() + remainder).split('\n');
      remainder = lines.shift() ?? '';
      if (end === 0) lines.unshift(remainder);
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].length > 65536 || !/task_started|task_complete|turn_aborted/.test(lines[i])) continue;
        let r;
        try { r = JSON.parse(lines[i]); } catch { continue; }
        if (r.type !== 'event_msg') continue;
        const p = r.payload;
        if (!['task_started', 'task_complete', 'turn_aborted'].includes(p?.type)) continue;
        return remember({ turnId: p.turn_id as string | undefined, pending: p.type === 'task_started', status: (p.type === 'task_started' ? 'running' : p.type === 'task_complete' ? 'completed' : 'stopped') as 'running' | 'completed' | 'stopped', updatedAt: stat.mtimeMs });
      }
      if (remainder.length > 65536) remainder = ''; // lifecycle records are small
    }
    return remember();
  } finally { await handle.close(); }
}
