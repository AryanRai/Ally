import { createHash } from 'node:crypto';

export const OPERATIONS = ['tabs', 'open', 'snapshot', 'screenshot', 'extract', 'wait_for', 'click', 'fill', 'press', 'scroll', 'back', 'close', 'upload'] as const;
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
  if (op === 'snapshot') {
    if (args.query !== undefined) {
      if (typeof args.query !== 'string' || args.query.length > 500 || !args.query.trim()) throw Error('Snapshot query must be 1–500 characters.');
      out.query = args.query;
    }
    if (args.interactive !== undefined) {
      if (typeof args.interactive !== 'boolean') throw Error('interactive must be a boolean.');
      out.interactive = args.interactive;
    }
  }
  if (op === 'wait_for') {
    if (typeof args.text !== 'string' || !args.text.trim() || args.text.length > 500) throw Error('wait_for requires 1–500 characters of visible page text.');
    out.text = args.text;
    if (args.timeout !== undefined && (typeof args.timeout !== 'number' || !Number.isFinite(args.timeout) || args.timeout <= 0 || args.timeout > 15)) throw Error('Wait timeout must be 0–15 seconds.');
    if (args.gone !== undefined && typeof args.gone !== 'boolean') throw Error('gone must be a boolean.');
    out.timeout = args.timeout ?? 10;
    out.gone = args.gone ?? false;
  }
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
