import { randomUUID } from 'node:crypto';
import type { AgentInteractionHandler } from './types.js';
import { approvalSpec } from '../watch/approvals.js';
import { interactions, type InteractionBroker } from '../devices/interactions.js';

/** Genuine RPC decisions go to the chat timeline; no model-authored button grants consent. */
export function desktopInteraction(chatId: () => string | undefined, broker: InteractionBroker = interactions): AgentInteractionHandler {
  return async (method, params, signal) => {
    const spec = approvalSpec(method, params);
    if (signal.aborted) return spec.cancel;
    const chat = chatId();
    if (!chat) throw Error('This decision needs the original chat session. Reopen that chat in Ally.');
    return new Promise((resolve, reject) => {
      let withdraw: (() => void) | undefined;
      const abort = () => withdraw?.();
      const settle = (result: unknown) => { signal.removeEventListener('abort', abort); resolve(result); };
      try {
        withdraw = broker.add({ id: randomUUID(), chatId: chat, kind: spec.fields.length ? 'question' : 'approval',
          title: spec.title, detail: spec.detail, fields: spec.fields, actions: spec.actions,
          desktopOnly: spec.fields.some(field => field.secret), expiresAt: Date.now() + 600_000 },
          answer => { const result = spec.answer(answer); settle(result); }, () => settle(spec.cancel));
      } catch (error) { reject(error); return; }
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  };
}
