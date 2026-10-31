import fs from 'node:fs';
import path from 'node:path';
import { registerDeviceTool } from '../chatsMcp/index.js';
import { interactions, originatingChat } from '../devices/interactions.js';
import type { AgentConfig } from './types.js';

/**
 * Agents can read Ally's settings and propose one change at a time; each change waits for the
 * user's own approval in the originating chat. Executable paths are not offered: a changed binary
 * would run with the user's access.
 */
type Setting = { label: string; parse: (value: unknown) => AgentConfig[keyof AgentConfig] };

const flag = (value: unknown) => { if (typeof value !== 'boolean') throw Error('Use true or false.'); return value; };
const localUrl = (value: unknown) => {
  let url: URL | null = null;
  try { url = typeof value === 'string' ? new URL(value) : null; } catch { /* reported below */ }
  if (!url || !/^https?:$/.test(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('Use an http URL on localhost.');
  return url.toString();
};

export const SETTINGS: Record<string, Setting> = {
  permission: { label: 'Default access for new chats (readonly, edit or full)', parse: value => {
    if (value !== 'readonly' && value !== 'edit' && value !== 'full') throw Error('Use readonly, edit or full.');
    return value;
  } },
  defaultCwd: { label: 'Default working folder', parse: value => {
    if (typeof value !== 'string' || !path.isAbsolute(value) || !fs.statSync(value, { throwIfNoEntry: false })?.isDirectory()) throw Error('Use an existing absolute folder.');
    return path.normalize(value);
  } },
  codexDesktop: { label: 'Continue Codex desktop chats through the Codex app', parse: flag },
  kicadEverywhere: { label: 'KiCAD tools in every chat', parse: flag },
  shakeToCircle: { label: 'Shake the cursor to open Circle to Ask', parse: flag },
  robotMcpUrl: { label: 'Robot vision MCP URL', parse: localUrl },
  droidcoreMcpUrl: { label: 'Robot motion MCP URL', parse: localUrl },
};

export function readSettings(config: AgentConfig) {
  return Object.fromEntries(Object.entries(SETTINGS).map(([key, s]) => [key, { label: s.label, value: config[key as keyof AgentConfig] ?? null }]));
}

/** Validates one proposed change; throws with a message the agent can act on. */
export function settingChange(config: AgentConfig, key: unknown, value: unknown) {
  const setting = typeof key === 'string' && Object.hasOwn(SETTINGS, key) ? SETTINGS[key] : undefined;
  if (!setting) throw Error(`Unknown or unavailable setting. Available: ${Object.keys(SETTINGS).join(', ')}.`);
  const next = setting.parse(value);
  const current = config[key as keyof AgentConfig] ?? null;
  return { patch: { [key as string]: next } as Partial<AgentConfig>, label: setting.label, from: current, to: next, unchanged: current === next };
}

const result = (value: unknown, isError = false) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], ...(isError ? { isError } : {}) });

export function registerSettingsTool(config: () => AgentConfig, apply: (patch: Partial<AgentConfig>) => void) {
  return registerDeviceTool({
    name: 'ally_settings', requiresConfirmation: true,
    description: 'Read Ally\'s settings (action get), or change exactly one (action set with key and value). Every change waits for the user\'s own Allow in this chat on desktop, phone or watch; a decline or timeout leaves the setting unchanged. Ask once per change, never batch or retry a declined change. Supply chatId provider:sessionId when caller context is unavailable.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['action'], properties: {
      action: { type: 'string', enum: ['get', 'set'] },
      key: { type: 'string', enum: Object.keys(SETTINGS) },
      value: { description: 'New value: boolean, readonly/edit/full, an absolute folder, or a localhost URL' },
      chatId: { type: 'string' },
    } },
    handler: async (args, ctx) => {
      if (args.action === 'get') return result(readSettings(config()));
      if (args.action !== 'set') return result({ error: 'Use action get or set.' }, true);
      let change: ReturnType<typeof settingChange>;
      try { change = settingChange(config(), args.key, args.value); } catch (error) { return result({ error: (error as Error).message }, true); }
      if (change.unchanged) return result({ changed: false, key: args.key, value: change.to, note: 'Already set; nothing was asked.' });
      const answer = await interactions.request({ chatId: originatingChat(args, ctx.caller), kind: 'approval', title: `Change Ally setting: ${change.label}`,
        detail: `${JSON.stringify(change.from)} → ${JSON.stringify(change.to)}`, fields: [],
        actions: [{ value: 'accept', label: 'Change it' }, { value: 'decline', label: 'Keep current' }], expiresAt: Date.now() + 300_000 }, ctx.signal || new AbortController().signal);
      if (answer.action !== 'accept') return result({ changed: false, key: args.key, decision: answer.action, note: 'The user did not approve; the setting is unchanged.' });
      apply(change.patch);
      return result({ changed: true, key: args.key, from: change.from, to: change.to });
    },
  });
}
