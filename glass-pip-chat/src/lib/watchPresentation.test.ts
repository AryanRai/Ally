import { describe, expect, it } from 'vitest';
import { watchUserText, watchReplyView, readableReply } from './watchPresentation';
import { WATCH_INSTRUCTIONS } from '../../electron/watch/protocol';

describe('watch message presentation preserves conversation content', () => {
  it('hides only the known prompt prefix, retaining user delimiters and whitespace', () => {
    const message = 'Check this\n\nUser message:\nkeep this too.\n';
    const raw = `${WATCH_INSTRUCTIONS}\nApproval guidance.\n\nUser message:\n${message}`;
    expect(watchUserText(raw)).toBe(message);
    expect(watchUserText(raw.replace(/\n/g, '\r\n'))).toBe(message.replace(/\n/g, '\r\n'));
    expect(watchUserText(`Example:\n${raw}`)).toBe(`Example:\n${raw}`);
    expect(watchUserText('User message:\nOrdinary text')).toBe('User message:\nOrdinary text');
  });
  it('decodes replies without truncating errors, quotes, or Unicode', () => {
    const text = `“Hello”\nNo approval is pending.\n${'detail '.repeat(2200)}`;
    const raw = JSON.stringify({ text, components: [] });
    expect(readableReply(raw)).toBe(text);
    expect(readableReply(`\`\`\`json\n${raw}\n\`\`\``)).toBe(text);
  });
  it('leaves ordinary JSON, examples and incomplete messages readable', () => {
    for (const raw of ['{"text":"a record"}', '{"text":"reply","components":[],"id":1}', '{"text":"unfinished', 'Example: {"text":"hi","components":[]}']) {
      expect(watchReplyView(raw)).toBeUndefined();
      expect(readableReply(raw)).toBe(raw);
    }
  });
  it('uses the safe widget catalog while retaining reply text', () => {
    const raw = JSON.stringify({ text: 'Ready', components: [{ type: 'script', body: 'doSomething()' }, { type: 'card', title: 'Report', body: 'Sent' }] });
    expect(watchReplyView(raw)).toEqual({ text: 'Ready', components: [{ type: 'card', title: 'Report', body: 'Sent' }] });
  });
});
