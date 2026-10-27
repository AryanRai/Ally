import { displayAssistantText, displayUserText } from './messageDisplay';
import { watchReplyView, watchUserText } from './watchPresentation';
import { studyReplyView } from './studyPresentation';

export type HomeHistory = {
  chat: { id: string; title: string };
  messages: { role: 'user' | 'assistant'; text: string; timestamp: number }[];
  running: boolean;
  activeTurnId?: string;
};
export type HomeTurn = { id: string; chatId: string; status: string; transcript?: string; liveText?: string; reply?: { text: string }; activity?: string };

/** The preview belongs to one selected conversation and its latest question. */
export function notchHomePreview(history: HomeHistory | null, turn: HomeTurn | null) {
  if (!history) return { title: 'Ally', question: '', answer: '', working: false };
  const current = turn?.chatId === history.chat.id ? turn : null;
  const working = current?.status === 'thinking' || history.running;
  const userIndex = history.messages.map(message => message.role).lastIndexOf('user');
  const question = current?.status === 'thinking' && current.transcript
    || history.messages[userIndex]?.text || '';
  const lastAnswer = history.messages.slice(userIndex + 1).reverse().find(message => message.role === 'assistant')?.text || '';
  const raw = current?.status === 'thinking' ? current.reply?.text || current.liveText || '' : lastAnswer;
  const reply = watchReplyView(raw)?.text ?? raw.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
  return {
    title: history.chat.title,
    question: displayUserText(watchUserText(question)),
    answer: displayAssistantText(studyReplyView(reply, working)?.text ?? reply),
    working,
  };
}
