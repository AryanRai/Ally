import { listSessionActivity } from './runningSessions.js';
import { discoveryReadStates } from './unread.js';
import { codexDiscovery } from './codexDiscovery.js';
import { interactions } from '../devices/interactions.js';
import { assistantActivity, type AssistantActivityRow } from '../watch/assistantActivity.js';

/** Same read-only projection as the Android assistant; no bridge/pairing needed. */
export async function readAgentMonitor() {
  const [sessions, receipts] = await Promise.all([listSessionActivity(), discoveryReadStates()]);
  const rows: AssistantActivityRow[] = sessions.map(s => ({ ...s, id: `${s.provider}:${s.id}`, sessionId: s.id,
    detail: s.status === 'running' ? 'Working…' : s.status === 'completed' ? 'Response completed' : s.status === 'stopped' ? 'Stopped' : 'Error',
    unread: receipts.some(r => r.key === `${s.provider}:${s.id}` && r.unread) }));
  for (const receipt of receipts.filter(r => r.unread && !r.hidden)) {
    const match = /^(codex|claude):([\w-]+)$/.exec(receipt.key);
    if (!match || rows.some(row => row.id === receipt.key)) continue;
    const provider = match[1] as 'codex' | 'claude', sessionId = match[2];
    rows.push({ id: receipt.key, provider, sessionId, title: (provider === 'codex' ? codexDiscovery(sessionId)?.title : undefined) ?? 'Unread conversation',
      updatedAt: 0, status: 'unread', detail: 'Unread reply or notification', unread: true });
  }
  return assistantActivity(rows, interactions.list().map(r => r.chatId));
}
