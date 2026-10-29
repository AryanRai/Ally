import { desktopInteraction } from '../agent/desktopApprovals.js';
import { chatSelection, type SelectionSnapshot } from '../agent/selection.js';
import type { AgentInteractionHandler } from '../agent/types.js';

/**
 * Approval requests from native HeyClicky background jobs (ally-study/ally-codex-shim.mjs).
 * Each one becomes Ally's normal approval card in the chat the notch has selected, so it
 * shows on desktop, phone and watch. Only the user's answer resolves it; nothing here
 * approves on its own, and an unanswered request resolves to the request's cancel value.
 */
export const NATIVE_JOB_METHODS = new Set([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval',
  'item/tool/requestUserInput',
  'mcpServer/elicitation/request',
]);

export function nativeJobChat(snapshot: SelectionSnapshot = chatSelection.snapshot()): string {
  const selected = snapshot.selected;
  if (!selected?.sessionId) throw Error('Select a chat in the notch so background job approvals have somewhere to appear.');
  return `${selected.provider}:${selected.sessionId}`;
}

const label = (job: unknown) => typeof job === 'string' && job.trim() ? `Background job: ${job.trim().slice(0, 160)}` : 'Background job';

export async function answerNativeJobApproval(input: any, signal: AbortSignal, deps: { chat?: () => string; interact?: (chatId: () => string) => AgentInteractionHandler } = {}) {
  if (!input || typeof input !== 'object' || typeof input.method !== 'string' || !NATIVE_JOB_METHODS.has(input.method)) throw Error('Unsupported background job request');
  if (!input.params || typeof input.params !== 'object' || Array.isArray(input.params)) throw Error('Invalid background job request');
  const chat = (deps.chat ?? (() => nativeJobChat()))();
  const prefix = label(input.job);
  const params = input.method === 'mcpServer/elicitation/request'
    ? { ...input.params, message: [prefix, input.params.message].filter(Boolean).join('\n\n') }
    : { ...input.params, reason: [prefix, input.params.reason].filter(Boolean).join('\n\n') };
  return (deps.interact ?? desktopInteraction)(() => chat)(input.method, params, signal);
}
