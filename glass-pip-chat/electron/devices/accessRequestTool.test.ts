import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../chatsMcp/index', () => ({ registerDeviceTool: vi.fn(() => vi.fn()) }));
vi.mock('../agent/runner.js', () => ({ changeAgentSessionAccess: vi.fn() }));
vi.mock('../agent/codexDesktop.js', () => ({ updateExternalDesktopAccess: vi.fn() }));
vi.mock('electron', () => ({ app: { getPath: () => '/nowhere' } }));
import { registerDeviceTool } from '../chatsMcp/index';
import { registerAccessRequestTool } from './accessRequestTool';
import { interactions } from './interactions';
afterEach(() => { interactions.closeAll(); vi.clearAllMocks(); });
const chatId = 'codex:session-1234';
const setup = (scope: 'current_reply' | 'next_message' | undefined, desktop = false) => {
  const deps = { apply: vi.fn(async () => scope), desktop: vi.fn(async () => 'current_reply' as const), codexDesktop: () => desktop };
  registerAccessRequestTool(deps); return { deps, tool: vi.mocked(registerDeviceTool).mock.calls[0][0] };
};
const reply = async (result: Promise<any>) => JSON.parse((await result).content[0].text);
describe('agent access requests', () => {
  it('asks in the calling chat and changes access only on Allow', async () => {
    const { deps, tool } = setup('current_reply');
    const result = tool.handler({ permission: 'full', reason: 'Install the dependency' }, { caller: chatId });
    const request = interactions.list(chatId)[0];
    expect(request).toMatchObject({ kind: 'approval', title: 'Ally wants full access', detail: 'Install the dependency' });
    expect(deps.apply).not.toHaveBeenCalled();
    interactions.answer(request.id, { action: 'allow' }, 'phone');
    expect(await reply(result)).toMatchObject({ granted: true, permission: 'full', scope: 'current_reply' });
    expect(deps.apply).toHaveBeenCalledWith(chatId, 'full');
  });
  it('keeps access on Deny or when the request is withdrawn', async () => {
    const { deps, tool } = setup('current_reply');
    const denied = tool.handler({ permission: 'edit', reason: 'Edit a file' }, { caller: chatId });
    interactions.answer(interactions.list(chatId)[0].id, { action: 'deny' }, 'watch');
    expect(await reply(denied)).toMatchObject({ granted: false });
    const controller = new AbortController();
    const withdrawn = tool.handler({ permission: 'edit', reason: 'Edit a file' }, { caller: chatId, signal: controller.signal });
    controller.abort();
    expect(await reply(withdrawn)).toMatchObject({ granted: false });
    expect(deps.apply).not.toHaveBeenCalled();
  });
  it('uses the Codex desktop owner when Ally is not running the reply, else saves for the next message', async () => {
    const owned = setup(undefined, true);
    const result = owned.tool.handler({ permission: 'edit', reason: 'Edit a file' }, { caller: chatId });
    interactions.answer(interactions.list(chatId)[0].id, { action: 'allow' }, 'desktop');
    expect(await reply(result)).toMatchObject({ scope: 'current_reply' });
    expect(owned.deps.desktop).toHaveBeenCalledWith('session-1234', 'edit');
    vi.mocked(registerDeviceTool).mockClear();
    const later = setup(undefined, false);
    const next = later.tool.handler({ permission: 'edit', reason: 'Edit a file' }, { caller: chatId });
    interactions.answer(interactions.list(chatId)[0].id, { action: 'allow' }, 'desktop');
    expect(await reply(next)).toMatchObject({ granted: true, scope: 'next_message' });
  });
  it('rejects readonly, missing reasons and another chat', async () => {
    const { tool } = setup('current_reply');
    await expect(tool.handler({ permission: 'readonly', reason: 'x' }, { caller: chatId })).rejects.toThrow();
    await expect(tool.handler({ permission: 'edit', reason: ' ' }, { caller: chatId })).rejects.toThrow();
    await expect(tool.handler({ permission: 'edit', reason: 'x', chatId: 'codex:other-12345' }, { caller: chatId })).rejects.toThrow();
  });
});
