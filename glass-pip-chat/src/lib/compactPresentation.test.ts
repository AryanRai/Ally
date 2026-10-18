import { describe, expect, it } from 'vitest';
import { compactReply, compactUserMessage, selectedSessionRunning } from './compactPresentation';
import type { Chat } from '@/types/chat';

describe('compact native message presentation', () => {
  it('shows question answers without native tool IDs and keeps the questions available', () => {
    const raw = `<send_user_message_question_reply>\n${JSON.stringify([{ questionItemId: '["request_user_input_async","call_private",0]', question: 'Choose a mode?', answer: '**Meeting** mode' }, { question: 'Include microphone?', answer: 'No' }])}\n</send_user_message_question_reply>`;
    expect(compactUserMessage(raw)).toEqual({ label: 'You answered', text: '**Meeting** mode\n\nNo', questions: ['Choose a mode?', 'Include microphone?'] });
  });
  it('does not decode examples, ordinary JSON or unrelated XML', () => {
    for (const raw of ['Example: <send_user_message_question_reply>[]</send_user_message_question_reply>', '{"answer":"keep me"}', '<note>hello</note>', '**Keep markdown**']) {
      expect(compactUserMessage(raw).text).toBe(raw);
    }
  });
  it('keeps malformed native replies in original details, without leaking protocol into the preview', () => {
    const raw = '<send_user_message_question_reply>[{"questionItemId":"call_private"';
    expect(compactUserMessage(raw)).toEqual({ label: 'You answered', text: 'Question reply received', questions: [], original: raw });
  });
  it('separates the generated interrupted footer without changing genuine reply prose or saved content', () => {
    const raw = 'Partial answer\n\n⏹️ Stopped';
    expect(compactReply(raw)).toEqual({ text: 'Partial answer', interrupted: true });
    expect(raw).toBe('Partial answer\n\n⏹️ Stopped');
    expect(compactReply('⏹️ Stopped')).toEqual({ text: '', interrupted: true });
    expect(compactReply('The task Stopped because…')).toEqual({ text: 'The task Stopped because…', interrupted: false });
    expect(compactReply('```\n⏹️ Stopped\n```').interrupted).toBe(false);
  });
});

it('uses positive Running evidence for the exact selected provider/session and its recorded migration', () => {
  const chat = { agent: { provider: 'codex', sessionId: 'current', originalSessionId: 'original' } } as Chat;
  const row = { provider: 'codex' as const, id: 'current', title: 'Chat', updatedAt: 1 };
  expect(selectedSessionRunning(chat, [row])).toBe(true);
  expect(selectedSessionRunning(chat, [{ ...row, id: 'original' }])).toBe(true);
  expect(selectedSessionRunning(chat, [{ ...row, provider: 'claude' }])).toBe(false);
  expect(selectedSessionRunning(chat, [{ ...row, id: 'different' }])).toBe(false);
  expect(selectedSessionRunning(chat, [])).toBe(false);
});
