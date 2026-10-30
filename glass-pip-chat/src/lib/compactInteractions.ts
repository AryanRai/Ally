import type { InteractionHistory } from '../../electron/devices/interactions';

/** A glance surface keeps live decisions reachable, without becoming the chat's audit log. */
export function compactInteractions(rows: InteractionHistory[], since = 0, now = Date.now()): InteractionHistory[] {
  const unique = [...new Map(rows.map(row => [row.id, row])).values()];
  const pending = unique.filter(row => row.state === 'pending' && row.expiresAt > now);
  if (pending.length) return pending;
  return unique.filter(row => row.state !== 'pending' && row.closedAt !== undefined
    && row.closedAt >= Math.max(since, now - 60000) && row.closedAt <= now)
    .sort((a, b) => b.closedAt! - a.closedAt!).slice(0, 1);
}
