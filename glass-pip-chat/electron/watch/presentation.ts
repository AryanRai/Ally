import type { AgentHistoryMessage } from '../agent/types.js';
import { studyReplyView, studyUserText } from '../../src/lib/studyPresentation.js';
import { parseWatchReply } from './protocol.js';

/** Display only. Original history and executable Study streams stay intact. */
export function deviceReply(raw: string, streaming = false) {
  const reply = parseWatchReply(studyReplyView(raw, streaming)?.text ?? raw);
  return { ...reply, text: studyReplyView(reply.text)?.text ?? reply.text };
}

export function deviceHistoryReply(message: AgentHistoryMessage) {
  const texts = message.segments?.filter(s => s.type === 'text') ?? [];
  const finals = texts.filter(s => s.phase === 'final_answer');
  const phased = texts.some(s => s.phase);
  const answer = finals.length ? finals.map(s => s.content ?? '').join('\n\n')
    : phased ? texts.filter(s => s.phase !== 'commentary').map(s => s.content ?? '').join('\n\n') : message.content;
  return { ...deviceReply(answer), commentary: texts.filter(s => s.phase === 'commentary').map(s => deviceReply(s.content ?? '').text).filter(Boolean) };
}

export const deviceUserText = studyUserText;

/** Notifications are a short preview; tapping retains the full exact-chat answer. */
export function replyPreview(raw: string): string {
  const text = deviceReply(raw).text
    .replace(/```[^\n]*\n[\s\S]*?(?:```|$)/g, ' [Code available in chat] ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
  return text.length > 280 ? text.slice(0, 277).trimEnd() + '…' : text || 'Your response is ready. Open chat to read it.';
}
