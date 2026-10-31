import { describe, expect, it, vi } from 'vitest';
import { authorize, chatServerPort, registerDeviceTool } from './index';
import { handleRpc } from './protocol';
import { allyChatsMcpServers, forwarding, setEndpoint } from './registry';
import { ChatIndex, scoreChat, terms } from './search';
import { chatTools } from './tools';
import type { AgentHistoryMessage, AgentSessionSummary } from '../agent/types';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const msg = (role: 'user' | 'assistant', content: string): AgentHistoryMessage => ({ role, content, timestamp: NOW });

const summaries: AgentSessionSummary[] = [
  { provider: 'codex', id: 'cx-ally-old', title: 'Ally sidebar redesign', cwd: 'C:\\Projects\\Ally', updatedAt: NOW - 20 * DAY },
  { provider: 'claude', id: 'cc-ally-new', title: 'Ally realtime perception', cwd: 'C:\\Projects\\Ally', updatedAt: NOW - 1000 },
  { provider: 'codex', id: 'cx-gnss', title: 'GNSS driver debugging', cwd: 'C:\\fw', updatedAt: NOW - 2 * DAY },
];
const transcripts: Record<string, AgentHistoryMessage[]> = {
  'cx-ally-old': [msg('user', 'Make the Ally sidebar look like Codex'), msg('assistant', 'Done: grouped by folder.')],
  'cc-ally-new': [msg('user', 'Add meeting mode to Ally with Jev relevance'), msg('assistant', 'Perception pipeline added.')],
  'cx-gnss': [msg('user', 'Why did we move the GNSS UART from DMA to interrupts?'), msg('assistant', 'DMA overran the ring buffer.')],
};

function makeIndex() {
  return new ChatIndex({
    list: async provider => summaries.filter(s => s.provider === provider),
    load: async (_p, id) => ({ messages: transcripts[id] ?? [] }),
  }, 80, 0);
}

describe('protocol', () => {
  const tools = () => [{ name: 'echo', description: 'd', inputSchema: { type: 'object' }, handler: async (a: any) => ({ content: [{ type: 'text' as const, text: String(a.x) }] }) }];
  it.each(['oneOf', 'allOf', 'anyOf'])('identifies any tool with a root %s regardless of its index', async key => {
    const bad = { ...tools()[0], name: 'future_study_tool', inputSchema: { type: 'object', [key]: [{ required: ['html'] }] } };
    for (const listing of [[bad, ...tools()], [...tools(), bad]]) {
      expect(await handleRpc({ id: 1, method: 'tools/list' }, () => listing, {})).toMatchObject({ error: { code: -32603, message: expect.stringContaining('future_study_tool') } });
    }
    expect(() => registerDeviceTool(bad)).toThrow('future_study_tool');
  });
  it('keeps nested operation unions intact and rejects non-object roots', async () => {
    const schema = { type: 'object', properties: { operations: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'number' }] } } } };
    expect(await handleRpc({ id: 1, method: 'tools/list' }, () => [{ ...tools()[0], inputSchema: schema }], {})).toMatchObject({ result: { tools: [{ inputSchema: schema }] } });
    expect(await handleRpc({ id: 1, method: 'tools/list' }, () => [{ ...tools()[0], inputSchema: { type: 'array' } }], {})).toMatchObject({ error: { code: -32603 } });
  });
  it('initializes, lists and calls tools; notifications get no reply', async () => {
    expect(await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, tools, {})).toMatchObject({ result: { protocolVersion: '2025-03-26', capabilities: { tools: {} } } });
    expect(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, tools, {})).toBeNull();
    expect(await handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, tools, {})).toMatchObject({ result: { tools: [{ name: 'echo' }] } });
    expect(await handleRpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo', arguments: { x: 7 } } }, tools, {})).toMatchObject({ result: { content: [{ text: '7' }] } });
    expect(await handleRpc({ jsonrpc: '2.0', id: 4, method: 'nope' }, tools, {})).toMatchObject({ error: { code: -32601 } });
  });
});

describe('authorize', () => {
  const token = 'ab'.repeat(24);
  const req = (url: string, headers: Record<string, string> = {}) => ({ method: 'POST', url, headers: { host: '127.0.0.1:18766', ...headers } });
  it('needs the token, a local Host and no browser Origin', () => {
    expect(authorize(req(`/mcp/${token}?caller=codex:abc-1`), token, 18766)).toEqual({ ok: true, caller: 'codex:abc-1' });
    expect(authorize(req(`/mcp/${'cd'.repeat(24)}`), token, 18766)).toEqual({ ok: false, status: 404 });
    expect(authorize(req(`/mcp/${token}`, { origin: 'https://evil.example' }), token, 18766)).toEqual({ ok: false, status: 403 });
    expect(authorize(req(`/mcp/${token}`, { host: 'evil.example:18766' }), token, 18766)).toEqual({ ok: false, status: 403 });
    expect(authorize(req(`/mcp/${token}?caller=../../x`), token, 18766)).toEqual({ ok: true, caller: undefined });
  });
});

describe('search', () => {
  it('ranks by topic, then recency', async () => {
    const index = makeIndex();
    await index.refresh(true);
    const hits = index.search('ally', {}, NOW);
    expect(hits.map(h => h.id)).toEqual(['cc-ally-new', 'cx-ally-old']);
    expect(index.search('gnss dma', {}, NOW)[0]).toMatchObject({ id: 'cx-gnss' });
    expect(index.search('gnss dma', {}, NOW)[0].snippet).toMatch(/DMA/);
    expect(index.list({ folder: 'ally' }).map(c => c.id)).toEqual(['cc-ally-new', 'cx-ally-old']);
  });

  it('ignores filler words and rewards covering every term', () => {
    expect(terms('find me the most recent Ally dev chat')).toEqual(['ally', 'dev']);
    const chat = { provider: 'codex' as const, id: 'x', title: 'Ally dev', updatedAt: NOW, text: '', raw: '' };
    expect(scoreChat(chat, ['ally', 'dev'], NOW)).toBeGreaterThan(scoreChat(chat, ['ally', 'robot'], NOW));
  });
});

describe('tools', () => {
  const setup = () => {
    const index = makeIndex();
    const send = vi.fn().mockResolvedValue({ status: 'replied', reply: 'Got it. Which screen should it go on?' });
    const open = vi.fn();
    const tools = chatTools({ index, load: async (_p, id) => ({ messages: transcripts[id] }), send, open });
    const call = (name: string, args: Record<string, unknown>, caller?: string) => tools.find(t => t.name === name)!.handler(args, { caller });
    return { send, open, call };
  };

  it('marks chats that are replying right now and lists only those on request', async () => {
    const index = makeIndex();
    const running = vi.fn().mockResolvedValue([
      { provider: 'codex', id: 'cx-gnss', title: 'GNSS driver debugging', cwd: 'C:\fw', updatedAt: NOW },
      { provider: 'claude', id: 'cc-phone', title: 'Started from the phone', updatedAt: NOW },
    ]);
    const tools = chatTools({ index, load: async (_p, id) => ({ messages: transcripts[id] ?? [] }), send: vi.fn(), open: vi.fn(), running });
    const list = tools.find(t => t.name === 'ally_list_chats')!;
    const all = await list.handler({}, {});
    expect(all.content[0].text).toMatch(/GNSS driver debugging" · fw · RUNNING now/);
    expect(all.content[0].text).not.toMatch(/Ally realtime perception.*RUNNING/);
    const only = await list.handler({ running: true, provider: 'claude' }, {});
    expect(only.content[0].text).toMatch(/Started from the phone/);
    expect(only.content[0].text).not.toMatch(/GNSS/);
    running.mockResolvedValue([]);
    expect((await list.handler({ running: true }, {})).content[0].text).toBe('No chats are replying right now.');
  });

  it('forwards to a chat and relays its reply (questions included)', async () => {
    const { send, open, call } = setup();
    const r = await call('ally_send_to_chat', { provider: 'claude', chat_id: 'cc-ally-new', message: 'I want a watch shortcut for meeting mode', open_in_ally: true }, 'codex:cx-gnss');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: 'cc-ally-new', title: 'Ally realtime perception' }), 'I want a watch shortcut for meeting mode', expect.objectContaining({ wait: true, caller: 'codex:cx-gnss' }));
    expect(open).toHaveBeenCalled();
    expect(r.content[0].text).toMatch(/Which screen should it go on\?/);
  });

  it('refuses forwarding to itself and unknown chats', async () => {
    const { call } = setup();
    expect((await call('ally_send_to_chat', { provider: 'claude', chat_id: 'cc-ally-new', message: 'hi' }, 'claude:cc-ally-new')).isError).toBe(true);
    await expect(call('ally_read_chat', { provider: 'codex', chat_id: 'nope' })).rejects.toThrow(/No codex chat/);
  });

  it('distinguishes queued receipts and unconfirmed delivery from sent messages', async () => {
    const { send, call } = setup();
    const args = { provider: 'claude', chat_id: 'cc-ally-new', message: 'implement this', wait: false };
    send.mockResolvedValueOnce({ status: 'queued', reply: '', receiptId: 'receipt-1' });
    const queued = await call('ally_send_to_chat', args);
    expect(queued.content[0].text).toMatch(/queued/i);
    expect(queued.content[0].text).toMatch(/not.*delivered/i);
    send.mockResolvedValueOnce({ status: 'unconfirmed', reply: '' });
    const unknown = await call('ally_send_to_chat', args);
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0].text).toMatch(/not.*claim.*sent/i);
  });

  it('reads the latest messages', async () => {
    const { call } = setup();
    const r = await call('ally_read_chat', { provider: 'codex', chat_id: 'cx-gnss', last: 1 });
    expect(r.content[0].text).toMatch(/DMA overran the ring buffer/);
    expect(r.content[0].text).not.toMatch(/Why did we move/);
  });
});

describe('registry', () => {
  it('gives runs the server with their identity, except ephemeral and forwarded turns', () => {
    setEndpoint(null);
    expect(allyChatsMcpServers({ provider: 'codex', sessionId: 'a' })).toEqual({});
    setEndpoint({ port: 18766, token: 'f'.repeat(48) });
    expect(allyChatsMcpServers({ provider: 'codex', sessionId: 'a' }).ally_chats).toMatch(/\?caller=codex%3Aa$/);
    expect(allyChatsMcpServers({ provider: 'claude', ephemeral: true })).toEqual({});
    forwarding.add('codex:a');
    expect(allyChatsMcpServers({ provider: 'codex', sessionId: 'a' })).toEqual({});
    forwarding.clear();
    setEndpoint(null);
  });
});

it('keeps chat routing off bridge and speech ports, including old saved settings', () => {
  expect(chatServerPort(18765)).toBe(18767); expect(chatServerPort(18766)).toBe(18767);
  expect(chatServerPort(18768)).toBe(18768); expect(chatServerPort(undefined)).toBe(18767);
  expect(chatServerPort(65535)).toBe(18767); expect(chatServerPort(-1)).toBe(18767);
});
