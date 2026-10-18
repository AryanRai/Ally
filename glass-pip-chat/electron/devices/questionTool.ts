import { registerDeviceTool } from '../chatsMcp/index.js';
import { interactions, originatingChat } from './interactions.js';
import type { ApprovalField } from '../watch/approvals.js';

export function questionFields(value: unknown): ApprovalField[] {
  if (!Array.isArray(value) || !value.length || value.length > 6) throw Error('Provide one to six questions.');
  const ids = new Set<string>();
  return value.map(q => {
    if (!q || typeof q.id !== 'string' || !/^[\w-]{1,60}$/.test(q.id) || ids.has(q.id) || typeof q.question !== 'string' || !q.question.trim() || q.question.length > 600 || q.secret || q.isSecret) throw Error('Use unique question IDs and plain questions; credentials and secret questions require manual handoff.');
    ids.add(q.id);
    if (q.options != null && (!Array.isArray(q.options) || q.options.length > 6 || q.options.some((o: unknown) => typeof o !== 'string' || !o.trim() || o.length > 160) || new Set(q.options).size !== q.options.length)) throw Error('Provide at most six distinct text options.');
    return { id: q.id, label: q.question, required: true, secret: false, options: (q.options || []).map((o: string) => ({ value: o, label: o })), freeText: true };
  });
}
export function registerQuestionTool() {
  return registerDeviceTool({ name: 'chat_ask_user', description: 'Ask real structured questions in the originating Ally conversation. Desktop, phone and watch all show unanswered choices and free text, with chat notifications and unread attention across every connected surface. Waits for an actual user answer; never use reply widgets to simulate this request. No credentials, OTP or secret inputs. Supply chatId provider:sessionId when caller context is unavailable.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['questions'], properties: { chatId: { type: 'string' }, questions: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['id', 'question'], properties: { id: { type: 'string' }, question: { type: 'string', maxLength: 600 }, options: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 160 } } } } } } },
    handler: async (args, ctx) => {
      const result = await interactions.request({ chatId: originatingChat(args, ctx.caller), kind: 'question', title: 'Ally has a question', detail: '', fields: questionFields(args.questions), actions: [{ value: 'submit', label: 'Send answer' }, { value: 'cancel', label: 'Cancel' }], expiresAt: Date.now() + 600000 }, ctx.signal || new AbortController().signal);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  });
}
