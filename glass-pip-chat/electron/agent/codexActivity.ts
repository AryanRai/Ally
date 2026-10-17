import fs from 'node:fs/promises';
import { isRunning } from './sessionActivity.js';

/** The reader app-server does not own another server's runtime status. Use the
 * exact persisted turn lifecycle, without resuming or attaching a writer. */
export async function readCodexActivity(file?: string, now = Date.now()) {
  if (!file) return undefined;
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
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
        return { turnId: p.turn_id as string | undefined, pending: p.type === 'task_started',
          recent: isRunning(true, stat.mtimeMs, now), updatedAt: stat.mtimeMs };
      }
      if (remainder.length > 65536) remainder = ''; // lifecycle records are small
    }
    return undefined;
  } finally { await handle.close(); }
}
