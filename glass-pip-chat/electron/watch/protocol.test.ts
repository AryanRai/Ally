import { describe, expect, it } from 'vitest';
import { parseWatchReply, WATCH_INSTRUCTIONS } from './protocol';

describe('watch UI catalog', () => {
  it('keeps device instructions about optional UI without imposing a persona or brevity', () => {
    expect(WATCH_INSTRUCTIONS).toContain('Plain text and Markdown replies are supported.');
    expect(WATCH_INSTRUCTIONS).toContain('Only when using optional UI widgets');
    expect(WATCH_INSTRUCTIONS).not.toMatch(/You are Ally|concise|glanceable|must be one JSON|viewing this conversation on a watch/);
    expect(WATCH_INSTRUCTIONS).toContain('unless a real tool actually did it');
  });
  it('retains detailed ordinary Markdown and still accepts optional widget envelopes', () => {
    const text = '## Explanation\n\n' + 'A detailed paragraph with **emphasis** and `code`.\n\n'.repeat(120);
    expect(parseWatchReply(text)).toEqual({ text, components: [] });
    expect(parseWatchReply(JSON.stringify({ text, components: [{ type: 'card', title: 'Detail', body: 'Optional' }] }))).toMatchObject({ text, components: [{ type: 'card', title: 'Detail', body: 'Optional' }] });
  });
  it('selects the final reply after tool commentary, respecting escaped quotes and braces', () => {
    const final = { text: 'Folder {Ally} says "ready"', components: [{ type: 'checklist', items: ['Review'] }] };
    const result = parseWatchReply('{"text":"Checking…","components":[]}\nTool complete.\n```json\n' + JSON.stringify(final) + '\n```');
    expect(result.text).toBe(final.text);
    expect(result.components[0].items).toEqual(['Review']);
  });
  it('preserves plain replies when the agent does not emit JSON', () => {
    expect(parseWatchReply('Hello from Ally')).toEqual({ text: 'Hello from Ally', components: [] });
  });
  it('allows known cards and drops executable or unknown content', () => {
    const result = parseWatchReply(JSON.stringify({ text: 'Ready', components: [
      { type: 'html', body: '<script>run()</script>' },
      { type: 'actions', title: 'Next', actions: [{ label: 'Explain', prompt: 'Explain it', javascript: 'run()' }] },
      { type: 'checklist', items: ['One', 22, 'Two'] },
      { type: 'timer', seconds: -10 }, { type: 'progress', progress: 400 },
    ] }));
    expect(result.components).toHaveLength(4);
    expect(result.components[0].actions).toEqual([{ label: 'Explain', prompt: 'Explain it' }]);
    expect(result.components[1].items).toEqual(['One', 'Two']);
    expect(result.components[2].seconds).toBe(1);
    expect(result.components[3].progress).toBe(1);
  });
  it('bounds widget count and supports JSON fences', () => {
    expect(parseWatchReply('```json\n' + JSON.stringify({ text: 'x', components: Array.from({ length: 100 }, () => ({ type: 'card', body: 'x'.repeat(5000) })) }) + '\n```').components).toHaveLength(6);
    expect((parseWatchReply(JSON.stringify({ text: 'x', components: [{ type: 'card', body: 'x'.repeat(5000) }] })).components[0].body as string).length).toBe(1200);
  });
});
