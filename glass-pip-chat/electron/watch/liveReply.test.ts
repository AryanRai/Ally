import { describe, expect, it } from 'vitest';
import { liveReplyText } from './liveReply';

describe('device live text', () => {
  it('shows commentary immediately', () => {
    expect(liveReplyText('Checking the current project…')).toBe('Checking the current project…');
  });
  it('decodes every split in a structured answer without exposing JSON or broken escapes', () => {
    const text = 'A "quote", a \\ path,\na new line and 😀.';
    const raw = JSON.stringify({ text, components: [] });
    for (let i = 0; i <= raw.length; i++) {
      const preview = liveReplyText(raw.slice(0, i));
      expect(text.startsWith(preview), `split ${i}: ${preview}`).toBe(true);
      expect(preview).not.toContain('components');
    }
    expect(liveReplyText(raw)).toBe(text);
  });
  it('retains commentary, hides partial fences, and ignores nested text/card properties', () => {
    const raw = 'Checking…\n```json\n' + JSON.stringify({ components: [{ text: 'not the answer' }], text: 'Done' });
    for (let i = 'Checking…'.length; i <= raw.length; i++) {
      expect(['Checking…', 'Checking…\n\nD', 'Checking…\n\nDo', 'Checking…\n\nDon', 'Checking…\n\nDone']).toContain(liveReplyText(raw.slice(0, i)));
    }
  });
  it('supports escaped unicode split across events and selects the latest reply object', () => {
    expect(liveReplyText('{"text":"\\uD83D')).toBe('');
    expect(liveReplyText('{"text":"\\uD83D\\uDE00')).toBe('😀');
    expect(liveReplyText('{"text":"Checking"}\n{"text":"Finished"}')).toBe('Finished');
  });
  it('bounds output and keeps ordinary braces in prose', () => {
    expect(liveReplyText('Folder {Ally} is ready')).toBe('Folder {Ally} is ready');
    expect(liveReplyText('{"text":"' + 'a'.repeat(64000))).toHaveLength(12000);
  });
  it('streams the useful card sections before the JSON envelope has finished', () => {
    const intro = 'My recommendation';
    const body = 'Research with [Paper](https://example.org/paper)';
    const raw = JSON.stringify({ text: intro, components: [{ type: 'card', title: 'Research', body }] });
    for (let i = 0; i <= raw.length; i++) {
      const preview = liveReplyText(raw.slice(0, i));
      expect(`${intro}\n\nResearch\n\n${body}`.startsWith(preview)).toBe(true);
      expect(preview).not.toMatch(/"(?:type|title|body|components)"/);
    }
    expect(liveReplyText(raw.slice(0, -3))).toContain(body);
  });
  it('keeps unknown widget bodies and action prompts out of live text', () => {
    const raw = JSON.stringify({ text: 'Answer', components: [{ type: 'html', body: 'hidden' }, { type: 'actions', actions: [{ label: 'Continue', prompt: 'do not execute' }] }] });
    expect(liveReplyText(raw)).toBe('Answer\n\nContinue');
  });
});
