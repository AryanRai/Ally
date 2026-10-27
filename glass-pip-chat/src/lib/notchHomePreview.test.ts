import { describe, expect, it } from 'vitest';
import { notchHomePreview, type HomeHistory } from './notchHomePreview';
import { buildNativeStudyPrompt } from '../../electron/watch/nativeStudy';

const history: HomeHistory = { chat: { id: 'one', title: 'MECH5720' }, running: false, messages: [
  { role: 'user', text: 'Old question', timestamp: 1 }, { role: 'assistant', text: 'Old answer', timestamp: 2 },
  { role: 'user', text: buildNativeStudyPrompt('Note this in formula sheet.', '{}'), timestamp: 3 },
  { role: 'assistant', text: '```js\nstep(1); say("Added on page 34.");\n```', timestamp: 4 },
] };
describe('selected chat Home preview', () => {
  it('shows the most recent question and readable Study answer', () => {
    expect(notchHomePreview(history, null)).toEqual({ title: 'MECH5720', question: 'Note this in formula sheet.', answer: 'Added on page 34.', working: false });
  });
  it('does not present an old answer as the response to a new question', () => {
    expect(notchHomePreview({ ...history, messages: [...history.messages, { role: 'user', text: 'New question', timestamp: 5 }] }, null).answer).toBe('');
  });
  it('uses the selected active stream and ignores a different chat’s turn', () => {
    const turn = { id: 'turn', chatId: 'one', status: 'thinking', transcript: 'Explain the graph', liveText: '```js\nstep(1); say("First step"); say("Sec' };
    expect(notchHomePreview(history, turn)).toMatchObject({ question: 'Explain the graph', answer: 'First step', working: true });
    expect(notchHomePreview(history, { ...turn, chatId: 'two' }).answer).toBe('Added on page 34.');
  });
  it('clears to an empty preview when no chat is selected and hides reasoning blocks', () => {
    expect(notchHomePreview(null, null)).toEqual({ title: 'Ally', question: '', answer: '', working: false });
    expect(notchHomePreview({ ...history, messages: [{ role: 'assistant', text: '<think>Internal thought</think>\nDone.', timestamp: 1 }] }, null).answer).toBe('Done.');
  });
});
