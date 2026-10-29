import { displayAssistantText, displayUserText } from './messageDisplay';
import { watchReplyView, watchUserText } from './watchPresentation';
import { studyReplyView } from './studyPresentation';

export type HomeHistory = {
  chat: { id: string; title: string };
  messages: { role: 'user' | 'assistant'; text: string; timestamp: number; commentary?: string[] }[];
  running: boolean;
  activeTurnId?: string;
  progress?: HomeProgress[];
  turn?: HomeTurn;
};
export type HomeProgress = { id: string; text: string; complete?: boolean; kind?: string };
export type HomeTurn = { id: string; chatId: string; status: string; startedAt?: number; transcript?: string; liveText?: string; reply?: { text: string }; activity?: string; progress?: HomeProgress[] };

/** The preview belongs to one selected conversation and its latest question. */
export function notchHomePreview(history: HomeHistory | null, turn: HomeTurn | null) {
  if (!history) return { title: 'Ally', question: '', answer: '', working: false };
  const current = turn?.chatId === history.chat.id ? turn : null;
  const working = current ? current.status === 'thinking' : history.running;
  const userIndex = history.messages.map(message => message.role).lastIndexOf('user');
  const question = current?.transcript
    || history.messages[userIndex]?.text || '';
  const lastAnswer = history.messages.slice(userIndex + 1).reverse().find(message => message.role === 'assistant')?.text || '';
  const sameQuestion = !current?.transcript || displayUserText(watchUserText(current.transcript)) === displayUserText(watchUserText(history.messages[userIndex]?.text || ''));
  const raw = current?.reply?.text || current?.liveText || (sameQuestion ? lastAnswer : '');
  const reply = watchReplyView(raw)?.text ?? raw.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
  const progress = (current?.progress?.length ? current.progress : sameQuestion ? history.progress ?? history.messages.at(-1)?.commentary?.map((text, i) => ({id:String(i),text})) ?? [] : [])
    .map(row => displayAssistantText(studyReplyView(row.text, working)?.text ?? row.text)).filter(text => text.trim()).slice(-3);
  return {
    title: history.chat.title,
    question: displayUserText(watchUserText(question)),
    answer: displayAssistantText(studyReplyView(reply, working)?.text ?? reply),
    working,
    ...(progress.length ? { progress } : {}),
    ...(current?.activity ? { activity: current.activity } : {}),
  };
}
