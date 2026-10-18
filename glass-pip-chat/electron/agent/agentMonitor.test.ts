// @vitest-environment node
import { expect, it, vi } from 'vitest';
vi.mock('./runningSessions.js', () => ({ listSessionActivity: vi.fn(async () => [{ id: 'working', provider: 'codex', title: 'Working chat', updatedAt: Date.now(), status: 'running' }]) }));
vi.mock('./unread.js', () => ({ discoveryReadStates: vi.fn(async () => [
  { key: 'codex:internal', unread: false, hidden: true }, { key: 'codex:user', unread: true },
  ...Array.from({ length: 30 }, (_, i) => ({ key: `claude:old-${i}`, unread: true })),
]) }));
vi.mock('./codexDiscovery.js', () => ({ codexDiscovery: () => ({ title: 'Guardian review' }), hiddenConversation: (_provider: string, id: string) => id === 'internal' }));
vi.mock('../devices/interactions.js', () => ({ interactions: { list: () => [{ chatId: 'codex:user' }] } }));
import { readAgentMonitor } from './agentMonitor';
it('projects all off-page unread and real attention while retaining status and excluding internal receipts', async () => {
  const result = await readAgentMonitor();
  expect(result.running).toBe(2); expect(result.chats).toHaveLength(32);
  expect(result.chats.some(r => r.sessionId === 'internal')).toBe(false);
  expect(result.chats.find(r => r.sessionId === 'user')).toMatchObject({ title: 'Guardian review', status: 'needs_input', unread: true });
  expect(result.chats.find(r => r.sessionId === 'working')).toMatchObject({ status: 'running', detail: 'Working…' });
});
