import { useCallback, useRef, useState } from 'react';
import type { Segment } from '../types/chat';
import { ROBOT_INSTRUCTIONS } from '../config/robotPersona';
import type { Message } from '../types/chat';
import { AGENT_LABEL, AGENT_MODEL_PREFIX, AgentPermission, AgentSessionSummary, DEFAULT_AGENT_MODEL, parseAgentModel } from '../types/agent';
import { useAgentChat } from './useAgentChat';
import type { ChatsApi } from './useChats';
import { sessionMessages, useSessionSync } from './useSessionSync';

const MODEL_KEY = 'ally-agent-model';
const TRANSCRIPT_HANDOFF_CHARS = 12000;

interface Options {
  chats: ChatsApi;
  robotMode: boolean;
  /** Called with each complete sentence while the reply streams (voice mode) */
  onSentence?: (sentence: string) => void;
}

/** Strip <think> blocks so a transcript handed to a new session stays readable. */
const plainText = (m: Message) => m.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

/**
 * One conversation turn with Claude Code / Codex: picks the agent, links the
 * chat to its session, streams text/thinking/tool pills, and saves the reply.
 */
export function useAgentConversation({ chats, robotMode, onSentence }: Options) {
  const agent = useAgentChat();
  const [model, setModelState] = useState(() => localStorage.getItem(MODEL_KEY) || DEFAULT_AGENT_MODEL);
  const [isTyping, setIsTyping] = useState(false);
  const [runningChatId, setRunningChatId] = useState<string | null>(null);
  const busy = useRef(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [streamingSegments, setStreamingSegments] = useState<Segment[]>([]);
  const [thinkingText, setThinkingText] = useState('');
  const spokenUpTo = useRef(0);
  // The active chat is running in the Claude Code / Codex app rather than in Ally
  const externalRunning = useSessionSync(chats, isTyping);

  const parsed = parseAgentModel(model) ?? parseAgentModel(DEFAULT_AGENT_MODEL)!;
  const cwd = chats.activeChat?.agent?.cwd || agent.config?.defaultCwd || '';

  const setModel = useCallback((id: string) => {
    setModelState(id);
    localStorage.setItem(MODEL_KEY, id);
  }, []);

  /** Speak sentences completed since the last call; `final` flushes the remainder. */
  const speakNewSentences = (text: string, final: boolean) => {
    if (!onSentence) return;
    const pending = text.slice(spokenUpTo.current);
    let end = final ? pending.length : 0;
    if (!final) {
      for (const m of pending.matchAll(/[.!?]\s+/g)) end = m.index! + m[0].length;
    }
    if (end === 0) return;
    for (const sentence of pending.slice(0, end).split(/(?<=[.!?])\s+/)) {
      if (sentence.trim().length > 3) onSentence(sentence.trim());
    }
    spokenUpTo.current += end;
  };

  /** Run one turn in `chatId` (the user message must already be in the chat). */
  const runTurn = useCallback(async (chatId: string, prompt: string, history: Message[], images?: string[]) => {
    const chat = chats.getChat(chatId);
    if (!chat || busy.current) return;
    busy.current = true;
    chats.setSendFailure(chatId);
    const failedText = [...chat.messages].reverse().find(m => m.role === 'user')?.content ?? prompt;
    const { provider } = parsed;

    // Switching agent mid-chat starts a fresh session for the new provider
    const linked = chat.agent?.provider === provider ? chat.agent : undefined;
    const runCwd = linked?.cwd || cwd;
    let sessionId = linked?.sessionId;

    // A new session can't see earlier turns, so hand them over once
    let fullPrompt = prompt;
    if (!sessionId && history.length > 0) {
      const transcript = history
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${plainText(m)}`)
        .join('\n\n')
        .slice(-TRANSCRIPT_HANDOFF_CHARS);
      fullPrompt = `Earlier conversation for context:\n\n${transcript}\n\n---\n\n${prompt}`;
    }

    const link = (id: string) => {
      const originalSessionId = linked?.originalSessionId ?? (sessionId && sessionId !== id ? sessionId : undefined);
      sessionId = id;
      chats.setAgent(chatId, { provider, sessionId: id, originalSessionId, cwd: runCwd });
    };
    if (!linked || linked.cwd !== runCwd) chats.setAgent(chatId, { provider, sessionId, cwd: runCwd });

    setIsTyping(true);
    setRunningChatId(chatId);
    setCurrentResponse('');
    setStreamingSegments([]);
    setThinkingText('');
    spokenUpTo.current = 0;

    try {
      const result = await agent.runTurn(
        { provider, model: parsed.model, cwd: runCwd, sessionId, prompt: fullPrompt, images, robot: robotMode ? { instructions: ROBOT_INSTRUCTIONS } : undefined },
        {
          onSegments: setStreamingSegments,
          onText: text => {
            setCurrentResponse(text);
            speakNewSentences(text, false);
          },
          onThinking: setThinkingText,
          onSession: link,
        },
      );
      if (result.sessionId && result.sessionId !== sessionId) link(result.sessionId);
      if (result.error) chats.setSendFailure(chatId, { message: result.error, text: failedText });
      if (!result.stopped) speakNewSentences(result.text, true);
      if (!result.stopped) window.pip?.notifyReply?.({ id: `reply-${chatId}-${Date.now()}`, chatId, title: result.error ? 'Ally needs attention' : chat.title || 'Ally reply', text: result.error || result.text });

      let content = result.text;
      if (result.thinking) content = `<think>${result.thinking}</think>\n\n${content}`;
      if (result.error) content += `${content ? '\n\n' : ''}⚠️ ${AGENT_LABEL[provider]}: ${result.error}`;
      else if (result.stopped) content += `${content ? '\n\n' : ''}⏹️ Stopped`;
      if (result.error || result.stopped) result.segments.push({ type: 'text', content: result.error ? `⚠️ ${AGENT_LABEL[provider]}: ${result.error}` : '⏹️ Stopped' });

      const hasTools = result.segments.some(s => s.type === 'tool');
      const rich = result.segments.some(s => s.type !== 'text');
      if (content || hasTools) {
        chats.addMessage(chatId, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: content || '(no text reply)',
          timestamp: Date.now(),
          metadata: {
            ...(rich ? { segments: JSON.parse(JSON.stringify(result.segments)) } : {}),
            ...(result.usage ? { usage: result.usage } : {}),
          },
        });
      }
      return { error: result.error };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      chats.setSendFailure(chatId, { message, text: failedText });
      chats.addMessage(chatId, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
      return { error: message };
    } finally {
      busy.current = false;
      setIsTyping(false);
      setRunningChatId(null);
      setCurrentResponse('');
      setStreamingSegments([]);
      setThinkingText('');
    }
  }, [agent, chats, cwd, parsed.model, parsed.provider, robotMode, onSentence]);

  /** Add the user's message to the active chat and get the agent's reply. */
  const send = useCallback(async (
    text: string,
    source: 'text' | 'speech' | 'circle' = 'text',
    extras: { context?: string; image?: { path: string; thumbnail: string } } = {},
  ) => {
    const { context, image } = extras;
    const chat = chats.activeChat;
    if (!chat || !text.trim() || busy.current) return;
    const history = chat.messages;
    chats.addMessage(chat.id, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      metadata: { source, context, image: image?.thumbnail },
    });
    const prompt = context ? `Context (from my clipboard):\n${context}\n\n${text}` : text;
    return await runTurn(chat.id, prompt, history, image ? [image.path] : undefined);
  }, [chats, isTyping, runTurn]);

  /** Re-ask the user message before `messageId` (the assistant reply is replaced). */
  const regenerate = useCallback(async (messageId: string) => {
    const chat = chats.activeChat;
    if (!chat || busy.current) return;
    const index = chat.messages.findIndex(m => m.id === messageId);
    const userMessage = chat.messages[index - 1];
    if (index < 1 || userMessage?.role !== 'user') return;
    chats.deleteMessage(chat.id, messageId);
    await runTurn(chat.id, userMessage.content, chat.messages.slice(0, index - 1));
  }, [chats, isTyping, runTurn]);

  const stop = useCallback(() => agent.stop(), [agent]);

  /** Continue an existing Claude Code / Codex session as an Ally chat. */
  const openSession = useCallback(async (session: AgentSessionSummary) => {
    if (!window.pip?.agent || isTyping) return;
    const { cwd: sessionCwd, messages, sessionId = session.id, originalSessionId } = await window.pip.agent.loadSession(session.provider, session.id);
    chats.openAgentSession(
      { provider: session.provider, sessionId, originalSessionId: originalSessionId ?? session.originalSessionId, cwd: sessionCwd ?? session.cwd },
      session.title,
      sessionMessages(sessionId, messages),
    );
    // Follow-ups should go to the same agent
    if (parseAgentModel(model)?.provider !== session.provider) setModel(`${AGENT_MODEL_PREFIX[session.provider]}default`);
  }, [chats, isTyping, model, setModel]);

  const setFolder = useCallback(async (folder: string) => {
    await agent.updateConfig({ defaultCwd: folder });
    const linked = chats.activeChat?.agent;
    if (chats.activeChat && linked) {
      // A different folder is a different project, so start a new session there
      chats.setAgent(chats.activeChat.id, {
        provider: linked.provider,
        sessionId: linked.cwd === folder ? linked.sessionId : undefined,
        cwd: folder,
      });
    }
  }, [agent, chats]);

  const pickFolder = useCallback(async () => {
    const folder = await agent.pickFolder(cwd);
    if (folder) await setFolder(folder);
  }, [agent, cwd, setFolder]);

  const setPermission = useCallback((permission: AgentPermission) => agent.updateConfig({ permission }), [agent]);

  return {
    model,
    setModel,
    provider: parsed.provider,
    providerLabel: AGENT_LABEL[parsed.provider],
    modelName: parsed.model,
    cwd,
    homeCwd: agent.config?.homeCwd,
    permission: agent.config?.permission ?? 'edit',
    cyclePermission: agent.cyclePermission,
    setPermission,
    pickFolder,
    setFolder,
    isTyping,
    runningChatId,
    externalRunning,
    currentResponse,
    streamingSegments,
    thinkingText,
    send,
    regenerate,
    stop,
    openSession,
  };
}
