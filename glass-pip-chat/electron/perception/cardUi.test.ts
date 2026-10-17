import { describe, expect, it } from 'vitest';
import { extractCardUi, validateCardUi } from './cardUi';

describe('card UI', () => {
  it('pulls the ally-ui block out of a reply and validates it', () => {
    const reply = [
      'NOTIFY: yes',
      'TITLE: GNSS moved off DMA',
      'From earlier: DMA overran the ring buffer.',
      '```ally-ui',
      JSON.stringify([
        { kind: 'facts', items: [{ label: 'Before', value: 'DMA, 512 B ring' }, { label: 'After', value: 'IRQ per byte' }] },
        { kind: 'actions', items: [{ label: 'Why not bigger buffer?', ask: 'Why didn\'t we just grow the DMA buffer?' }] },
      ]),
      '```',
    ].join('\n');
    const { text, ui } = extractCardUi(reply);
    expect(text).not.toMatch(/ally-ui/);
    expect(text).toMatch(/From earlier/);
    expect(ui.map(b => b.kind)).toEqual(['facts', 'actions']);
  });

  it('drops unknown kinds, scripts-as-text are just text, and caps sizes', () => {
    const ui = validateCardUi([
      { kind: 'html', html: '<img onerror=alert(1)>' },
      { kind: 'list', items: Array.from({ length: 50 }, (_, i) => `item ${i}`) },
      { kind: 'table', columns: ['a', 'b'], rows: [['1', '2', '3'], 'not a row'] },
      { kind: 'progress', label: 'Done', value: 7 },
      { kind: 'callout', tone: 'shout', text: '<b>hi</b>' },
    ]);
    expect(ui.map(b => b.kind)).toEqual(['list', 'table', 'progress', 'callout']);
    expect((ui[0] as any).items).toHaveLength(12);
    expect((ui[1] as any).rows).toEqual([['1', '2']]);
    expect((ui[2] as any).value).toBe(1);
    expect(ui[3]).toEqual({ kind: 'callout', tone: 'info', text: '<b>hi</b>' });
  });

  it('ignores malformed JSON', () => {
    expect(extractCardUi('Hi\n```ally-ui\n{nope\n```').ui).toEqual([]);
  });
});
