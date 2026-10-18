import { DEVICE_PROTOCOL_PREFIX, parseWatchReply } from '../../electron/watch/protocol';

/** Presentation only. Never rewrite saved messages or unwrap arbitrary JSON. */
export function watchUserText(raw: string): string {
  const legacy = raw.startsWith('You are Ally on a round smartwatch.') && raw.includes('Your final answer must be one JSON object');
  if (!legacy && !raw.startsWith(DEVICE_PROTOCOL_PREFIX)) return raw;
  const delimiter = /\r?\n\r?\nUser message:\r?\n/.exec(raw);
  return delimiter ? raw.slice(delimiter.index + delimiter[0].length) : raw;
}

export function watchReplyView(raw: string) {
  const plain = raw.trim().replace(/^```json\s*\n/i, '').replace(/\n```$/, '');
  // Only complete envelopes qualify. Code examples and malformed JSON remain visible.
  try {
    const value = JSON.parse(plain);
    if (!value || typeof value.text !== 'string' || !Array.isArray(value.components)
      || Object.keys(value).some(key => key !== 'text' && key !== 'components')) return undefined;
    return { text: value.text as string, components: parseWatchReply(plain).components };
  } catch { return undefined; }
}

export function readableReply(raw: string): string {
  return watchReplyView(raw)?.text ?? raw;
}
