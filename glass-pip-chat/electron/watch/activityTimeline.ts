import type { AgentEvent, AgentHistoryMessage } from '../agent/types.js';
import { deviceReply } from './presentation.js';

/** Public events only. Private reasoning never leaves the agent history. */
export type ActivityEntry = { id: string; type: 'update'; text: string } | { id: string; type: 'tool'; stepId: string };
export function updateActivityTimeline(rows: ActivityEntry[] = [], event: AgentEvent): ActivityEntry[] {
  if (event.kind === 'text' && event.phase === 'commentary') {
    const last = rows.at(-1);
    const id = event.itemId ? `commentary:${event.itemId}` : last?.type === 'update' ? last.id : `commentary:unkeyed:${rows.length}`;
    const existing = rows.find(row => row.id === id);
    if (existing?.type === 'update') return rows.map(row => row === existing ? { ...existing, text: (existing.text + event.text).slice(0, 3200) } : row);
    return [...rows, { id, type: 'update', text: event.text.slice(0, 3200) } as const].slice(-192);
  }
  if (event.kind === 'tool_start' && !rows.some(row => row.type === 'tool' && row.stepId === event.id)) {
    return [...rows, { id: `tool:${event.id}`, type: 'tool', stepId: event.id } as const].slice(-192);
  }
  return rows;
}
export const presentActivityTimeline = (rows: ActivityEntry[] = []) => rows.map(row => row.type === 'update' ? { ...row, text: deviceReply(row.text, true).text } : row);
export function historyActivityTimeline(message: AgentHistoryMessage): ActivityEntry[] {
  return (message.segments ?? []).flatMap((segment, index): ActivityEntry[] => {
    if (segment.type === 'text' && segment.phase === 'commentary' && segment.content?.trim()) return [{ id: `update:${segment.itemId ?? index}`, type: 'update', text: deviceReply(segment.content).text }];
    if (segment.type === 'tool' && segment.toolExecution) return [{ id: `tool:${segment.toolExecution.id}`, type: 'tool', stepId: segment.toolExecution.id }];
    return [];
  });
}
