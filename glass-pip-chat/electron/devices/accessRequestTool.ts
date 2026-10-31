import { registerDeviceTool } from '../chatsMcp/index.js';
import { interactions, originatingChat } from './interactions.js';
import { changeAgentSessionAccess } from '../agent/runner.js';
import { updateExternalDesktopAccess } from '../agent/codexDesktop.js';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AccessScope } from '../agent/access.js';
import type { AgentPermission } from '../agent/types.js';

const LABEL: Record<'edit' | 'full', string> = { edit: 'edit', full: 'full' };

export interface AccessRequestDeps {
  apply: (key: string, permission: AgentPermission) => Promise<AccessScope | undefined>;
  desktop: (sessionId: string, permission: AgentPermission) => Promise<AccessScope>;
  codexDesktop: () => boolean;
}
const live: AccessRequestDeps = { apply: changeAgentSessionAccess, desktop: updateExternalDesktopAccess, codexDesktop: () => { try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'agent-config.json'), 'utf8')).codexDesktop === true; } catch { return false; } } };

/**
 * An agent asks for more access the same way it asks a question: the request appears in its own chat on
 * desktop, phone and watch with notifications. Only the user's Allow changes access; the agent never can.
 */
export function registerAccessRequestTool(deps: AccessRequestDeps = live) {
  return registerDeviceTool({ name: 'chat_request_access', description: 'Ask the user to raise this chat\'s access (to edit or full) when the current access blocks the work. The request appears in this conversation on desktop, phone and watch with notifications and waits for the user. Only their Allow changes access; Deny keeps it. Explain the exact reason. Never retry a denied request in the same turn.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['permission', 'reason'], properties: { chatId: { type: 'string' }, permission: { type: 'string', enum: ['edit', 'full'] }, reason: { type: 'string', maxLength: 600 } } },
    handler: async (args, ctx) => {
      const chatId = originatingChat(args, ctx.caller);
      const permission = args.permission;
      if (permission !== 'edit' && permission !== 'full') throw Error('Ask for edit or full access.');
      const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
      if (!reason || reason.length > 600) throw Error('Explain in one short reason why the access is needed.');
      const allow = `Allow ${LABEL[permission]} access`;
      const answer = await interactions.request({ chatId, kind: 'approval', title: `Ally wants ${LABEL[permission]} access`, detail: reason, fields: [],
        actions: [{ value: 'allow', label: allow }, { value: 'deny', label: 'Keep current access' }], expiresAt: Date.now() + 600000 }, ctx.signal || new AbortController().signal);
      if (answer.action !== 'allow') return { content: [{ type: 'text', text: JSON.stringify({ granted: false, message: 'The user kept the current access. Continue within it or explain what is blocked.' }) }] };
      let scope = await deps.apply(chatId, permission);
      const [provider, sessionId] = [chatId.slice(0, chatId.indexOf(':')), chatId.slice(chatId.indexOf(':') + 1)];
      if (!scope && provider === 'codex' && deps.codexDesktop()) scope = await deps.desktop(sessionId, permission);
      scope ??= 'next_message';
      return { content: [{ type: 'text', text: JSON.stringify({ granted: true, permission, scope, message: scope === 'current_reply'
        ? `Access is now ${permission} for this reply. Required confirmations still apply.`
        : `The user allowed ${permission} access, but this reply could not change it. It applies from their next message; tell them so.` }) }] };
    },
  });
}
