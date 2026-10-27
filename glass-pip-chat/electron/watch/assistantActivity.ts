import { hiddenConversation } from '../agent/codexDiscovery.js';
import type { AgentProvider } from '../agent/types.js';

export type AssistantStatus = 'running' | 'needs_input' | 'unread' | 'completed' | 'stopped' | 'error';
export interface AssistantActivityRow {
  id: string; provider: AgentProvider; sessionId?: string; title: string; createdAt?: number; updatedAt: number;
  status: AssistantStatus; detail: string; unread: boolean; text?: string;
}

/** Exact session keys merge device aliases; terminal rows never hide a running turn. */
export function assistantActivity(rows: AssistantActivityRow[], attention: string[], now = Date.now()) {
  const merged = new Map<string, AssistantActivityRow>();
  const live = (row: AssistantActivityRow) => row.status === 'running' || row.status === 'needs_input';
  for (const row of rows) {
    if (hiddenConversation(row.provider, row.sessionId ?? row.id.replace(/^codex:/, ''))) continue;
    if (!live(row) && !row.unread && now - row.updatedAt > 30 * 60_000) continue;
    const key = `${row.provider}:${row.sessionId ?? row.id}`;
    const old = merged.get(key);
    if (!old || (live(row) && !live(old)) || (live(row) === live(old) && row.updatedAt >= old.updatedAt)) merged.set(key, { ...row });
  }
  for (const key of attention) {
    const split = key.indexOf(':');
    if (hiddenConversation(key.slice(0, split), key.slice(split + 1))) continue;
    const row = merged.get(key);
    if (row) { row.status = 'needs_input'; row.detail = 'Waiting for your answer'; }
    else {
      const match = /^(codex|claude):([\w-]+)$/.exec(key);
      if (match) merged.set(key, { id: key, provider: match[1] as AgentProvider, sessionId: match[2], title: 'Conversation needs input', status: 'needs_input', detail: 'Waiting for your answer', unread: true, updatedAt: now });
    }
  }
  const ordered = [...merged.values()].sort((a, b) => Number(live(b)) - Number(live(a)) || Number(b.status === 'needs_input') - Number(a.status === 'needs_input') || b.updatedAt - a.updatedAt);
  const active = ordered.filter(live), unread = ordered.filter(row => !live(row) && row.unread);
  const recent = ordered.filter(row => !live(row) && !row.unread).slice(0, 8);
  return { chats: [...active, ...unread, ...recent], running: active.length, ready: [...unread,...recent].filter(row => row.status === 'completed').length, updatedAt: now };
}
