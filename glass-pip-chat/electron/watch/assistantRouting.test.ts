// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { parseRoute, routeAssistant, shortlist, type RouteChat } from './assistantRouting';

const chats: RouteChat[] = [
  { id: 'codex:ally', provider: 'codex', title: 'Fix Ally watch assistant', cwd: '/Ally', updatedAt: 3, preview: 'Power button and voice recording' },
  { id: 'claude:fpga', provider: 'claude', title: 'FPGA UART receiver', cwd: '/Verilog', updatedAt: 2 },
  { id: 'codex:meal', provider: 'codex', title: 'Dinner recipes', cwd: '/Home', updatedAt: 1 },
];
const cfg = { project: 'synthetic', location: 'global', model: 'gemini-2.5-flash-lite' };

it('offers cross-provider relevant choices without resuming or creating a chat', async () => {
  const classify = vi.fn(async () => ({ kind: 'choose', ids: ['claude:fpga'] }));
  expect(await routeAssistant('What about that serial receiver?', chats, cfg, classify)).toEqual({ kind: 'choose', chats: [chats[1]] });
  expect(classify).toHaveBeenCalledOnce();
});
it('starts an independent topic only when the classifier returns a valid new decision', async () => {
  expect(await routeAssistant('Plan a holiday in Japan', chats, cfg, async () => ({ kind: 'new', ids: [] }))).toEqual({ kind: 'new', chats: [] });
});
it('preserves choice on missing configuration, outages, invalid ids and contradictory decisions', async () => {
  const invalid = [{ kind: 'choose', ids: ['invented'] }, { kind: 'new', ids: ['codex:ally'] }, { kind: 'choose', ids: [] }];
  for (const value of invalid) expect((await routeAssistant('Ally power button', chats, cfg, async () => value)).kind).toBe('choose');
  expect(await routeAssistant('Ally power button', chats)).toMatchObject({ kind: 'choose', limited: true, chats: [chats[0]] });
  expect((await routeAssistant('Continue that', chats, cfg, async () => { throw new Error('offline'); })).chats).toHaveLength(3);
});
it('does not match generic conversation words and ranks scope previews', () => {
  expect(shortlist('Can you help me with my previous chat please', chats)).toEqual([]);
  expect(shortlist('power button recording', chats)).toEqual([chats[0]]);
});
it('rejects empty/oversized input and unknown choices', async () => {
  await expect(routeAssistant('', chats)).rejects.toThrow();
  await expect(routeAssistant('x'.repeat(12001), chats)).rejects.toThrow();
  expect(() => parseRoute({ kind: 'choose', ids: ['unknown'] }, chats)).toThrow();
  expect(await routeAssistant('Hello', [])).toEqual({ kind: 'new', chats: [] });
});
