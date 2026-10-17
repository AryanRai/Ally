import { useCallback, useRef, useState } from 'react';
import type { Segment } from '../types/chat';
import { ROBOT_INSTRUCTIONS } from '../config/robotPersona';
import type { Message } from '../types/chat';
import { AGENT_LABEL, AGENT_MODEL_PREFIX, AgentSessionSummary, DEFAULT_AGENT_MODEL, parseAgentModel } from '../types/agent';
import { useAgentChat } from './useAgentChat';
import type { ChatsApi } from './useChats';

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
  const [currentResponse, setCurrentResponse] = useState('');
  const [streamingSegments, setStreamingSegments] = useState<Segment[]>([]);
  const [thinkingText, setThinkingText] = useState('');
  const spokenUpTo = useRef(0);

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
    if (!chat) return;
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
      sessionId = id;
      chats.setAgent(chatId, { provider, sessionId: id, cwd: runCwd });
    };
    if (!linked || linked.cwd !== runCwd) chats.setAgent(chatId, { provider, sessionId, cwd: runCwd });

    setIsTyping(true);
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
      if (!result.stopped) speakNewSentences(result.text, true);

      let content = result.text;
      if (result.thinking) content = `<think>${result.thinking}</think>\n\n${content}`;
      if (result.error) content += `${content ? '\n\n' : ''}⚠️ ${AGENT_LABEL[provider]}: ${result.error}`;
      else if (result.stopped) content += `${content ? '\n\n' : ''}⏹️ Stopped`;

      const hasTools = result.segments.some(s => s.type === 'tool');
      if (content || hasTools) {
        chats.addMessage(chatId, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: content || '(no text reply)',
          timestamp: Date.now(),
          metadata: hasTools ? { segments: JSON.parse(JSON.stringify(result.segments)) } : undefined,
        });
      }
    } catch (error) {
      chats.addMessage(chatId, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsTyping(false);
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
    if (!chat || !text.trim() || isTyping) return;
    const history = chat.messages;
    chats.addMessage(chat.id, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      metadata: { source, context, image: image?.thumbnail },
    });
    const prompt = context ? `Context (from my clipboard):\n${context}\n\n${text}` : text;
    await runTurn(chat.id, prompt, history, image ? [image.path] : undefined);
  }, [chats, isTyping, runTurn]);

  /** Re-ask the user message before `messageId` (the assistant reply is replaced). */
  const regenerate = useCallback(async (messageId: string) => {
    const chat = chats.activeChat;
    if (!chat || isTyping) return;
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
    const { cwd: sessionCwd, messages } = await window.pip.agent.loadSession(session.provider, session.id);
    chats.openAgentSession(
      { provider: session.provider, sessionId: session.id, cwd: sessionCwd ?? session.cwd },
      session.title,
      messages.map((m, i) => ({
        id: `${m.role}-${session.id}-${i}`,
        role: m.role,
        content: m.content || '(tool calls only)',
        timestamp: m.timestamp,
        metadata: m.segments ? { segments: m.segments } : undefined,
      })),
    );
    // Follow-ups should go to the same agent
    if (parseAgentModel(model)?.provider !== session.provider) setModel(`${AGENT_MODEL_PREFIX[session.provider]}default`);
  }, [chats, isTyping, model, setModel]);

  const pickFolder = useCallback(async () => {
    const folder = await agent.pickFolder(cwd);
    if (!folder) return;
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
  }, [agent, chats, cwd]);

  return {
    model,
    setModel,
    provider: parsed.provider,
    providerLabel: AGENT_LABEL[parsed.provider],
    modelName: parsed.model,
    cwd,
    permission: agent.config?.permission ?? 'edit',
    cyclePermission: agent.cyclePermission,
    pickFolder,
    isTyping,
    currentResponse,
    streamingSegments,
    thinkingText,
    send,
    regenerate,
    stop,
    openSession,
  };
}
