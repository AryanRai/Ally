import { describe, expect, it, vi } from 'vitest';
import { parse } from 'acorn';
import { studyReplyView, studyUserText } from './studyPresentation';
import { displayUserText } from './messageDisplay';
import { compactUserMessage } from './compactPresentation';
import { buildNativeStudyPrompt } from '../../electron/watch/nativeStudy';

vi.mock('acorn', async importOriginal => {
  const actual = await importOriginal<typeof import('acorn')>();
  return { ...actual, parse: vi.fn(actual.parse) };
});

const first = 'Added on page 34: the original slide, Euler’s identity, complex Fourier coefficients, magnitude and phase, and forward and inverse DFT equations.';
const second = 'Every symbol is defined. I also clarified the phase signs, the inverse one-over-N scaling, and the difference between coefficient magnitude and physical wave amplitude. The quick lookup is updated too.';
const fence = (body: string) => '```javascript\n' + body + '\n```';
const program = fence(`step(1);\nsay(${JSON.stringify(first)});\nstep(2);\nsay(${JSON.stringify(second)});`);

describe('Study display projections', () => {
  it('shows the real request despite malformed OCR JSON, retaining the full original in compact details', () => {
    const raw = buildNativeStudyPrompt('Note this in formula sheet.\n\nUser message: keep this too.', '{"highlight":"a document "PDF containing 59 pages""}');
    expect(displayUserText(raw)).toBe('Note this in formula sheet.\n\nUser message: keep this too.');
    expect(compactUserMessage(raw).original).toBe(raw);
    expect(studyUserText('Please explain this:\n' + raw)).toBe('Please explain this:\n' + raw);
    expect(studyUserText('Ally Study: continue this selected chat as a full agent.\nUser message: example')).toContain('Ally Study:');
  });

  it('turns the exact speech program into readable paragraphs with original code retained', () => {
    expect(studyReplyView(program)).toEqual({ text: first + '\n\n' + second, details: [program] });
  });

  it('decodes JavaScript escapes and static templates without executing code or including drawing labels', () => {
    const source = fence('step(1); say(\'Euler\\\'s identity\\nNext\\u0020line\'); text(1,2,"label"); say(`Another line`); globalThis.studyWasExecuted = true;');
    expect(studyReplyView(source)?.text).toBe("Euler's identity\nNext line\n\nAnother line");
    expect((globalThis as Record<string, unknown>).studyWasExecuted).toBeUndefined();
  });

  it('keeps tool-adjacent prose and multiple program blocks in order', () => {
    const source = 'I checked the document.\n\n' + fence('step(1); say("First");') + '\n\nUpdated it.\n\n' + fence('step(2); say("Second");');
    expect(studyReplyView(source)?.text).toBe('I checked the document.\n\nFirst\n\nUpdated it.\n\nSecond');
    expect(studyReplyView(source)?.details).toHaveLength(2);
  });

  it('streams completed speech cues once, withholding unfinished code and speech', () => {
    const source = '```javascript\nstep(1); say("First");\nstep(2); say("Sec';
    expect(studyReplyView(source, true)?.text).toBe('First');
    expect(studyReplyView(source + 'ond");', true)?.text).toBe('First\n\nSecond');
    expect(studyReplyView('```js\nstep(1);', true)).toEqual({ text: '', details: ['```js\nstep(1);'] });
  });

  it('preserves ordinary JS, code examples, invalid programs and non-JS fences', () => {
    for (const source of ['A normal answer.', fence('console.log("say(\\"hello\\")");'), fence('const say = () => {}; say("demo");'), '```python\nsay("hello")\n```', fence('step(1); say("unterminated')]) {
      expect(studyReplyView(source)).toBeUndefined();
    }
  });

  it('never treats nested, conditional or dynamic speech as spoken results', () => {
    const source = fence('step(1); if (false) say("Not said"); function demo(){say("Not called")} say(`Dynamic ${1}`); say("Actual literal");');
    expect(studyReplyView(source)?.text).toBe('Actual literal');
  });

  it('reuses completed blocks while surrounding prose changes without exposing cached arrays', () => {
    const block = fence('step(81); say("Cached completed explanation");');
    vi.mocked(parse).mockClear();
    const view = studyReplyView(block)!;
    view.details[0] = 'Changed by caller';
    for (let i = 0; i < 20; i++) {
      expect(studyReplyView(block + '\nAfter ' + i, true)).toEqual({
        text: 'Cached completed explanation\nAfter ' + i, details: [block],
      });
    }
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('separates streamed and final parsing and invalidates changed or corrected snapshots', () => {
    const partial = '```js\nstep(82); say("Stream cache"); say("unfinished';
    vi.mocked(parse).mockClear();
    expect(studyReplyView(partial, true)?.text).toBe('Stream cache');
    expect(studyReplyView(partial, true)?.text).toBe('Stream cache');
    expect(parse).toHaveBeenCalledTimes(1);
    expect(studyReplyView(partial)).toBeUndefined();
    expect(studyReplyView(partial + '");', true)?.text).toBe('Stream cache\n\nunfinished');
    expect(studyReplyView(partial.replace('Stream cache', 'Corrected'), true)?.text).toBe('Corrected');
  });

  it('evicts old completed programs and bypasses oversized results without losing output', () => {
    const block = fence('step(83); say("Eviction target");');
    studyReplyView(block);
    for (let i = 0; i < 17; i++) studyReplyView(fence(`step(84); say("Other ${i}");`));
    vi.mocked(parse).mockClear();
    expect(studyReplyView(block)?.text).toBe('Eviction target');
    expect(parse).toHaveBeenCalledTimes(1);
    const text = 'x'.repeat(300_000);
    const large = fence(`step(85); say("${text}");`);
    vi.mocked(parse).mockClear();
    expect(studyReplyView(large)?.text).toBe(text);
    expect(studyReplyView(large)?.text).toBe(text);
    expect(parse).toHaveBeenCalledTimes(2);
  });
});
