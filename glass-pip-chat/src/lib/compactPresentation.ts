import type { Chat } from '@/types/chat';
import type { AgentSessionSummary } from '@/types/agent';
import { watchUserText } from './watchPresentation';

export function compactUserMessage(raw: string) {
  const content = watchUserText(raw);
  const envelope = /^\s*<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>\s*$/.exec(content);
  if (envelope) {
    try {
      const replies: unknown = JSON.parse(envelope[1]);
      if (Array.isArray(replies) && replies.length && replies.every(reply => reply && typeof reply.question === 'string' && typeof reply.answer === 'string')) {
        return { label: 'You answered', text: replies.map(reply => reply.answer).join('\n\n'), questions: replies.map(reply => reply.question) as string[] };
      }
    } catch { /* Malformed native envelopes stay available in original details. */ }
  }
  if (/^\s*<send_user_message_question_reply>/.test(content)) {
    return { label: 'You answered', text: 'Question reply received', questions: [] as string[], original: raw };
  }
  return { label: 'You', text: content, questions: [] as string[] };
}

/** Only the exact standalone footer produced by Ally is status metadata. */
export function compactReply(content: string) {
  const marker = /(?:^|\r?\n\r?\n)⏹\uFE0F? Stopped\s*$/;
  return { text: content.replace(marker, '').trimEnd(), interrupted: marker.test(content) };
}

/** Independent, read-only Running evidence can be newer than a history snapshot. */
export function selectedSessionRunning(chat: Chat | null | undefined, running: AgentSessionSummary[]) {
  const agent = chat?.agent;
  if (!agent?.sessionId) return false;
  const ids = new Set([agent.sessionId, agent.originalSessionId].filter(Boolean));
  return running.some(session => session.provider === agent.provider && (ids.has(session.id) || !!session.originalSessionId && ids.has(session.originalSessionId)));
}
