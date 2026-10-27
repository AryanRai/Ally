import { parse, tokenizer } from 'acorn';

/** Display projections only. Never feed these back into history or the interpreter. */
export function studyUserText(raw: string): string {
  if (!raw.startsWith('Ally Study: continue this selected chat as a full agent.')
    || !raw.includes('The app draws and speaks each step live.')
    || !raw.includes('Resume normal formatting after this turn.')) return raw;
  // Context can contain OCR with invalid JSON. Only the runtime delimiter matters;
  // take its first occurrence after the instructions so quoted requests stay whole.
  const start = raw.indexOf('Resume normal formatting after this turn.') + 'Resume normal formatting after this turn.'.length;
  const delimiter = /^User message:[ \t]*(?:\r?\n)?/m.exec(raw.slice(start));
  return delimiter ? raw.slice(start + delimiter.index + delimiter[0].length) : raw;
}

// Completed drawing blocks recur while later prose streams and when histories
// refresh. Keep only bounded display results, never ASTs or executable programs.
const speechCache = new Map<string, { speech: string[] | undefined; size: number }>();
const speechCacheBudget = 512 * 1024; // UTF-16 code units (about 1 MiB).
let speechCacheSize = 0;
let lastStream: { code: string; speech: string[] | undefined } | undefined;

function literalSpeech(code: string, streaming: boolean): string[] | undefined {
  if (streaming && lastStream?.code === code) return lastStream.speech;
  const cached = !streaming ? speechCache.get(code) : undefined;
  if (cached) {
    speechCache.delete(code);
    speechCache.set(code, cached);
    return cached.speech;
  }
  const speech = parseLiteralSpeech(code, streaming);
  // One current streamed snapshot avoids retaining every cumulative prefix.
  if (streaming) {
    lastStream = code.length <= speechCacheBudget / 2 ? { code, speech } : undefined;
  } else {
    const size = code.length + (speech?.reduce((sum, text) => sum + text.length, 0) ?? 0);
    if (size <= speechCacheBudget) {
      while (speechCache.size && (speechCache.size >= 16 || speechCacheSize + size > speechCacheBudget)) {
        const key = speechCache.keys().next().value!;
        speechCacheSize -= speechCache.get(key)!.size;
        speechCache.delete(key);
      }
      speechCache.set(code, { speech, size });
      speechCacheSize += size;
    }
  }
  return speech;
}

function parseLiteralSpeech(code: string, streaming: boolean): string[] | undefined {
  // A Study program starts with a step or a speech cue. Ordinary JS examples,
  // strings, comments and object methods containing say() are never traversed.
  if (!/^\s*(?:step\s*\(\s*\d|say\s*\(\s*["'`])/.test(code)) return undefined;
  let complete = code;
  if (streaming) {
    let depth = 0, end = 0;
    try {
      for (const token of tokenizer(code, { ecmaVersion: 'latest' })) {
        const label = token.type.label;
        if (['(', '[', '{', '${'].includes(label)) depth++;
        if ([')', ']', '}'].includes(label)) depth--;
        if (depth === 0 && (label === ';' || label === '}')) end = token.end;
      }
    } catch { /* An unfinished string/call waits for the next streamed chunk. */ }
    complete = code.slice(0, end);
  }
  try {
    const tree = parse(complete, { ecmaVersion: 'latest' });
    const speech: string[] = [];
    for (const node of tree.body) {
      if (node.type !== 'ExpressionStatement' || node.expression.type !== 'CallExpression') continue;
      const call = node.expression;
      if (call.callee.type !== 'Identifier' || call.callee.name !== 'say' || call.arguments.length !== 1) continue;
      const arg = call.arguments[0];
      if (arg.type === 'Literal' && typeof arg.value === 'string') speech.push(arg.value);
      else if (arg.type === 'TemplateLiteral' && arg.expressions.length === 0) speech.push(arg.quasis.map(q => q.value.cooked ?? q.value.raw).join(''));
    }
    return speech;
  } catch { return undefined; }
}

/** Parse literal top-level speech without evaluating any model-generated code. */
export function studyReplyView(raw: string, streaming = false): { text: string; details: string[] } | undefined {
  const opening = /^ {0,3}(`{3,})(?:javascript|js)[ \t]*\r?\n/gim;
  const details: string[] = [];
  let text = '', cursor = 0;
  for (let match = opening.exec(raw); match; match = opening.exec(raw)) {
    const bodyStart = match.index + match[0].length;
    const closing = new RegExp('^ {0,3}`{' + match[1].length + ',}[ \\t]*\\r?$', 'gm');
    closing.lastIndex = bodyStart;
    const close = closing.exec(raw);
    const end = close ? close.index + close[0].length : raw.length;
    const speech = literalSpeech(raw.slice(bodyStart, close?.index ?? raw.length), !close && streaming);
    if (speech !== undefined) {
      text += raw.slice(cursor, match.index) + speech.join('\n\n');
      details.push(raw.slice(match.index, end));
      cursor = end;
    }
    opening.lastIndex = end;
  }
  return details.length ? { text: (text + raw.slice(cursor)).trim(), details } : undefined;
}
