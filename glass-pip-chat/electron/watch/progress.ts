import type { AgentEvent } from '../agent/types.js';
import { deviceReply } from './presentation.js';
import { studyReplyView } from '../../src/lib/studyPresentation.js';

export interface PublicProgress { id: string; text: string; complete: boolean; kind: 'commentary' | 'study' }
export interface ProgressState { progress?: PublicProgress[] }
export function updateProgress(rows: PublicProgress[], event: AgentEvent, output = '', study = false): PublicProgress[] {
  const next = rows.map(row => ({ ...row }));
  if (event.kind === 'continuation') return [];
  const active = [...next].reverse().find(row => !row.complete && row.kind === 'commentary');
  const id = event.kind === 'text' ? `commentary:${event.itemId ?? 'progress'}` : '';
  if (active && (event.kind === 'tool_start' || event.kind === 'done' || (event.kind === 'text' && (event.phase !== 'commentary' || active.id !== id)))) active.complete = true;
  if (event.kind === 'text' && event.phase === 'commentary') {
    const row = next.find(row => row.id === id);
    if (row) row.text = (row.text + event.text).slice(0, 3200);
    else next.push({ id, text: event.text.slice(0, 3200), complete: false, kind: 'commentary' });
  }
  if (study) {
    const projection = studyReplyView(output, event.kind !== 'done');
    // Prose outside the drawing program belongs to commentary/final channels.
    // Re-project only the recognized blocks so it cannot be queued twice.
    const lines = projection?.details.flatMap(block => studyReplyView(block, event.kind !== 'done')?.text.split('\n\n').filter(Boolean) ?? []) ?? [];
    lines.forEach((text, i) => { if (!next.some(row => row.id === `study:${i}`)) next.push({ id: `study:${i}`, text, complete: true, kind: 'study' }); });
  }
  return next.slice(-24);
}
export const presentProgress = (rows: PublicProgress[] = []) => rows.map(row => ({ ...row, text: deviceReply(row.text, !row.complete).text })).filter(row => row.text.trim());

export function historyProgress(messages: Array<{ id: string; role: string; text: string; commentary?: string[] }>, running: boolean) {
  const user = [...messages].reverse().find(m => m.role === 'user');
  const last = messages.at(-1);
  const answer = last?.role === 'assistant' ? last : undefined;
  return { progressTurnId: user ? `history:${user.id}` : '', progress: answer ? (answer.commentary ?? []).slice(-24).map((value, index, rows) => ({
    id: `${answer.id}:commentary:${index}`, text: deviceReply(value, true).text,
    complete: !running || index < rows.length - 1 || !!answer.text.trim(), kind: 'commentary' as const,
  })).filter(row => row.text.trim()) : [] };
}
