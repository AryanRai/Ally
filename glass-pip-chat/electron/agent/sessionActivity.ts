// Is a session mid-turn in another app (Claude Code desktop, Codex)? Read-only:
// inferred from the transcript, never by attaching to the running agent.

/** A turn that has written nothing for this long is treated as abandoned (crash, closed app). */
export const STALE_TURN_MS = 10 * 60_000;

const FINISHED = new Set(['end_turn', 'stop_sequence', 'max_tokens', 'refusal']);

/** Only explicit lifecycle evidence is a terminal status; disappearance is not completion. */
export function claudeTerminalStatus(records: any[]): 'completed' | 'stopped' | 'error' | undefined {
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r?.isSidechain || r?.isMeta || !['user', 'assistant'].includes(r?.type)) continue;
    if (r.type === 'assistant') {
      if (r.isApiErrorMessage || r.message?.model === '<synthetic>') return 'error';
      return FINISHED.has(r.message?.stop_reason) ? 'completed' : undefined;
    }
    return /^\[Request interrupted/.test(userText(r.message?.content).trim()) ? 'stopped' : undefined;
  }
  return undefined;
}

function userText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((b: any) => b?.type === 'text').map((b: any) => b.text ?? '').join('\n');
  return '';
}

/** Claude Code: every step is `stop_reason: tool_use` until the final reply ends the turn. */
export function claudeTurnPending(records: any[]): boolean {
  for (let i = records.length - 1; i >= 0; i--) {
    const l = records[i];
    if (l?.isSidechain || (l?.type !== 'user' && l?.type !== 'assistant')) continue;
    if (l.type === 'assistant') {
      if (l.isApiErrorMessage || l.message?.model === '<synthetic>') return false; // CLI error stand-in
      return !FINISHED.has(l.message?.stop_reason);
    }
    if (l.isMeta) continue;
    // A prompt or tool result the agent hasn't answered yet, unless the user interrupted
    return !/^\[Request interrupted/.test(userText(l.message?.content).trim());
  }
  return false;
}

/** Bookkeeping writes (titles, costs, bridge state) must not revive an old turn. */
export function claudeActivityAt(records: any[], fallback: number): number {
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (record?.isSidechain || record?.isMeta || (record?.type !== 'user' && record?.type !== 'assistant')) continue;
    const timestamp = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN;
    // Older transcripts without timestamps retain the existing file-time fallback.
    return Number.isFinite(timestamp) ? timestamp : fallback;
  }
  return fallback;
}

/** Codex rollout files: `task_started` until `task_complete` / `turn_aborted`. */
export function codexRolloutPending(records: any[]): boolean {
  for (let i = records.length - 1; i >= 0; i--) {
    const t = records[i]?.type === 'event_msg' ? records[i].payload?.type : undefined;
    if (t === 'task_started') return true;
    if (t === 'task_complete' || t === 'turn_aborted') return false;
  }
  return false;
}

/** Codex app-server turns: the last one is still `inProgress`. */
export function codexTurnsPending(turns: any[]): boolean {
  return turns.at(-1)?.status === 'inProgress';
}

/** Pending and written to recently enough to still be alive. */
export function isRunning(pending: boolean, lastWriteMs: number, now = Date.now()): boolean {
  return pending && now - lastWriteMs < STALE_TURN_MS;
}
