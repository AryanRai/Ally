import { createHash } from 'node:crypto';

export const OPERATIONS = ['tabs', 'open', 'snapshot', 'screenshot', 'click', 'fill', 'press', 'scroll', 'back', 'close', 'upload'] as const;
export type Operation = typeof OPERATIONS[number];
export function webURL(raw: unknown) {
  if (typeof raw !== 'string' || raw.length > 8000) throw Error('Provide an HTTP(S) URL.');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Only HTTP(S) pages without URL credentials are supported.');
  return url.href;
}
export function callerKey(caller: string | undefined, chatId: unknown) {
  if (caller && chatId && caller !== chatId) throw Error('Browser chat does not match the calling chat.');
  const key = caller || chatId;
  if (typeof key !== 'string' || !/^(codex|claude):[\w-]{1,200}$/.test(key)) throw Error('Provide the originating provider:session chatId.');
  return key;
}
export const taskKey = (caller: string) => 'ally-agent-' + createHash('sha256').update(caller).digest('hex').slice(0, 32);
export function operationArgs(args: Record<string, unknown>) {
  if (!OPERATIONS.includes(args.operation as Operation)) throw Error('Unsupported browser operation.');
  const op = args.operation as Operation, out: Record<string, unknown> = { operation: op };
  if (args.tabId !== undefined) {
    if (typeof args.tabId !== 'string' || !/^[\w-]{1,100}$/.test(args.tabId)) throw Error('Use a tabId returned by browser tools.');
    out.tabId = args.tabId;
  }
  if (!['tabs', 'open'].includes(op) && !out.tabId) throw Error('A tabId is required.');
  if (op === 'open') out.url = webURL(args.url);
  if (['click', 'fill', 'upload'].includes(op)) {
    if (typeof args.ref !== 'string' || !/^[\w:.-]{1,120}$/.test(args.ref)) throw Error('Use an element ref from the latest snapshot.');
    out.ref = args.ref;
  }
  if (op === 'upload') {
    if (!Array.isArray(args.paths) || args.paths.length < 1 || args.paths.length > 6 || !args.paths.every(p => typeof p === 'string' && p.length <= 4096 && !/[\r\n\0]/.test(p))) throw Error('Upload requires 1–6 explicit local file paths.');
    out.paths = args.paths;
    out.url = webURL(args.url);
  }
  if (op === 'fill') {
    if (typeof args.text !== 'string' || args.text.length > 20000) throw Error('Text must be at most 20000 characters.');
    out.text = args.text;
  }
  if (op === 'press') {
    if (!['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'PageDown', 'PageUp', 'Home', 'End'].includes(String(args.key))) throw Error('Unsupported key.');
    out.key = args.key;
  }
  if (op === 'scroll') {
    if (!['up', 'down'].includes(String(args.direction))) throw Error('Scroll up or down.');
    out.direction = args.direction;
  }
  return out;
}
export const isInput = (op: unknown) => ['click', 'fill', 'press', 'scroll', 'back', 'close', 'upload'].includes(String(op));
