import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../chatsMcp/index', () => ({ registerDeviceTool: vi.fn(() => vi.fn()) }));
import os from 'node:os';
import { registerDeviceTool } from '../chatsMcp/index';
import { interactions } from '../devices/interactions';
import { registerSettingsTool, settingChange } from './settingsTool';
import type { AgentConfig } from './types';

afterEach(() => { interactions.closeAll(); vi.clearAllMocks(); });
const base = (): AgentConfig => ({ defaultCwd: os.homedir(), permission: 'edit', codexDesktop: true });
const tool = (config: AgentConfig, apply = vi.fn()) => { registerSettingsTool(() => config, apply); return { tool: vi.mocked(registerDeviceTool).mock.calls[0][0], apply }; };
const chatId = 'codex:session-1234';

describe('agent settings tool', () => {
  it('validates each setting and offers no executable paths', () => {
    expect(settingChange(base(), 'permission', 'full')).toMatchObject({ patch: { permission: 'full' }, from: 'edit', to: 'full' });
    expect(settingChange(base(), 'codexDesktop', true).unchanged).toBe(true);
    expect(settingChange(base(), 'robotMcpUrl', 'http://localhost:8090/mcp').to).toBe('http://localhost:8090/mcp');
    for (const [key, value] of [['permission', 'admin'], ['codexDesktop', 'yes'], ['robotMcpUrl', 'http://example.com/mcp'], ['defaultCwd', 'relative/folder'], ['codexPath', 'C:\\evil.exe'], ['claudePath', 'x'], ['__proto__', 1]] as const)
      expect(() => settingChange(base(), key, value)).toThrow();
  });
  it('changes a setting only after the user approves that exact change in the calling chat', async () => {
    const { tool: t, apply } = tool(base());
    const pending = t.handler({ action: 'set', key: 'permission', value: 'full' }, { caller: chatId });
    const request = interactions.list(chatId)[0];
    expect(request).toMatchObject({ kind: 'approval', detail: '"edit" → "full"' });
    expect(apply).not.toHaveBeenCalled();
    interactions.answer(request.id, { action: 'accept', values: {} }, 'phone');
    expect(JSON.parse((await pending).content[0].text!)).toMatchObject({ changed: true, to: 'full' });
    expect(apply).toHaveBeenCalledWith({ permission: 'full' });
  });
  it('leaves the setting unchanged on decline, and never asks for a no-op', async () => {
    const { tool: t, apply } = tool(base());
    const pending = t.handler({ action: 'set', key: 'shakeToCircle', value: false }, { caller: chatId });
    interactions.answer(interactions.list(chatId)[0].id, { action: 'decline', values: {} }, 'desktop');
    expect(JSON.parse((await pending).content[0].text!)).toMatchObject({ changed: false });
    expect(JSON.parse((await t.handler({ action: 'set', key: 'codexDesktop', value: true }, { caller: chatId })).content[0].text!)).toMatchObject({ changed: false });
    expect(interactions.list(chatId)).toHaveLength(0);
    expect(apply).not.toHaveBeenCalled();
  });
  it('reads settings without asking', async () => {
    const { tool: t } = tool(base());
    expect(JSON.parse((await t.handler({ action: 'get' }, { caller: chatId })).content[0].text!).permission).toMatchObject({ value: 'edit' });
    expect(interactions.list()).toHaveLength(0);
  });
});
