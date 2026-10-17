import type { MessageBoxOptions } from 'electron';
import type { AgentInteractionHandler } from './types.js';
import { approvalSpec } from '../watch/approvals.js';

type ShowDialog = (options: MessageBoxOptions) => Promise<number>;

/** Native, cancellable decisions for desktop turns; only actual RPC requests enter here. */
export function desktopInteraction(show: ShowDialog): AgentInteractionHandler {
  return async (method, params, signal) => {
    const spec = approvalSpec(method, params);
    if (signal.aborted) return spec.cancel;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 10 * 60_000);
    const ask = async (message: string, detail: string, buttons: string[]) => {
      if (controller.signal.aborted) return 0;
      const response = await show({ type: 'question', title: 'Ally · Your decision', message, detail,
        buttons, defaultId: 0, cancelId: 0, noLink: true, signal: controller.signal });
      return controller.signal.aborted || !Number.isInteger(response) || response < 0 || response >= buttons.length ? 0 : response;
    };
    try {
      const values: Record<string, string> = {};
      for (const field of spec.fields) {
        if (!field.options.length || field.secret) {
          await ask('A text answer is needed', `${field.label}\n\nThis native dialog cannot collect that answer. Cancel this request and reply in chat, or use the watch question screen.`, ['Cancel request']);
          return spec.cancel;
        }
        const selected = await ask(field.label, spec.detail, ['Cancel request', ...field.options.map(o => o.label)]);
        if (!selected) return spec.cancel;
        values[field.id] = field.options[selected - 1].value;
      }
      // Choice questions are fully answered by the explicit selection(s) above.
      if (spec.fields.length && ['item/tool/requestUserInput', 'tool/requestUserInput'].includes(method)) return spec.answer({ action: 'submit', values });
      const actions = spec.actions.filter(a => a.value !== 'cancel');
      const selected = await ask(spec.title, spec.detail, ['Cancel request', ...actions.map(a => a.label)]);
      return selected ? spec.answer({ action: actions[selected - 1].value, values }) : spec.cancel;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
  };
}
