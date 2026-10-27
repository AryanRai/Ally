import { RESUME_PROMPT } from '../../electron/agent/resumePrompt';
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
  const [model, setModelState] = useState(() => {
    const saved = localStorage.getItem(MODEL_KEY) || DEFAULT_AGENT_MODEL;
    const provider = chats.activeChat?.agent?.provider;
    return provider && parseAgentModel(saved)?.provider !== provider ? `${AGENT_MODEL_PREFIX[provider]}default` : saved;
  });
  type Live = { isTyping: boolean; inputStatus: string; currentResponse: string; streamingSegments: Segment[]; thinkingText: string };
  const emptyLive: Live = { isTyping: false, inputStatus: '', currentResponse: '', streamingSegments: [], thinkingText: '' };
  const [liveChats, setLiveChats] = useState<Record<string, Live>>({});
  const busy = useRef(new Set<string>());
  const externalRequests = useRef(new Map<string, string>());
  const openingSessions = useRef(new Map<string, Promise<void>>());
  const selectedId = chats.activeChat?.id ?? '';
  const selectedRef = useRef(selectedId); selectedRef.current = selectedId;
  const { isTyping, inputStatus, currentResponse, streamingSegments, thinkingText } = liveChats[selectedId] ?? emptyLive;
  const runningChatId = isTyping ? selectedId : null;
  const updateLive = (chatId: string, patch: Partial<Live>) => setLiveChats(all => ({ ...all, [chatId]: { ...emptyLive, ...all[chatId], ...patch } }));
  const spokenUpTo = useRef<Record<string, number>>({});
  // The active chat is running in the Claude Code / Codex app rather than in Ally
  const [control, setControl] = useState<{ token?: string; canStop: boolean }>({ canStop: false });
  const externalRunning = useSessionSync(chats, isTyping, setControl);

  const parsed = parseAgentModel(model) ?? parseAgentModel(DEFAULT_AGENT_MODEL)!;
  const cwd = chats.activeChat?.agent?.cwd || agent.config?.defaultCwd || '';

  const setModel = useCallback((id: string) => {
    setModelState(id);
    localStorage.setItem(MODEL_KEY, id);
  }, []);

  /** Speak sentences completed since the last call; `final` flushes the remainder. */
  const speakNewSentences = (chatId: string, text: string, final: boolean) => {
    if (!onSentence || selectedRef.current !== chatId) return;
    const pending = text.slice(spokenUpTo.current[chatId] ?? 0);
    let end = final ? pending.length : 0;
    if (!final) {
      for (const m of pending.matchAll(/[.!?]\s+/g)) end = m.index! + m[0].length;
    }
    if (end === 0) return;
    for (const sentence of pending.slice(0, end).split(/(?<=[.!?])\s+/)) {
      if (sentence.trim().length > 3) onSentence(sentence.trim());
    }
    spokenUpTo.current[chatId] = (spokenUpTo.current[chatId] ?? 0) + end;
  };

  /** Run one turn in `chatId` (the user message must already be in the chat). */
  const runTurn = useCallback(async (chatId: string, prompt: string, history: Message[], images?: string[], resumeToken?: string) => {
    const chat = chats.getChat(chatId);
    if (!chat || busy.current.has(chatId)) return;
    busy.current.add(chatId);
    updateLive(chatId, { inputStatus: '' });
    chats.setSendFailure(chatId);
    const failedText = [...chat.messages].reverse().find(m => m.role === 'user')?.content ?? prompt;
    const selectedModel = resumeToken && chat.agent ? { provider: chat.agent.provider, model: 'default' } : parsed;
    const { provider } = selectedModel;

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

    let accountId = linked?.codexAccountId;
    const link = (id: string, profileId?: string) => {
      accountId = profileId ?? accountId;
      const originalSessionId = linked?.originalSessionId ?? (sessionId && sessionId !== id ? sessionId : undefined);
      sessionId = id;
      chats.setAgent(chatId, { provider, sessionId: id, originalSessionId, cwd: runCwd, codexAccountId: accountId });
    };
    if (!linked || linked.cwd !== runCwd) chats.setAgent(chatId, { provider, sessionId, cwd: runCwd, codexAccountId: linked?.codexAccountId });

    updateLive(chatId, { ...emptyLive, isTyping: true });
    spokenUpTo.current[chatId] = 0;

    try {
      const result = await agent.runTurn(
        { provider, codexAccountId: linked?.codexAccountId, model: selectedModel.model, cwd: runCwd, sessionId, prompt: fullPrompt, images, resumeToken, robot: robotMode ? { instructions: ROBOT_INSTRUCTIONS } : undefined },
        {
          onSegments: value => updateLive(chatId, { streamingSegments: value }),
          onText: text => {
            updateLive(chatId, { currentResponse: text });
            speakNewSentences(chatId, text, false);
          },
          onThinking: value => updateLive(chatId, { thinkingText: value }),
          onSession: link,
          onQueuedInput: (id, text) => chats.addMessage(chatId, { id: `queued-${id}`, role: 'user', content: text, timestamp: Date.now() }),
        },
        chatId,
      );
      if (result.sessionId && result.sessionId !== sessionId) link(result.sessionId);
      if (result.error) chats.setSendFailure(chatId, { message: result.error, text: failedText });
      if (!result.stopped) speakNewSentences(chatId, result.text, true);
      const finalSegments = result.segments.filter(s => s.type === 'text' && s.phase === 'final_answer');
      const replyText = finalSegments.length ? finalSegments.map(s => s.content ?? '').join('\n\n')
        : result.segments.some(s => s.phase) ? result.segments.filter(s => s.type === 'text' && s.phase !== 'commentary').map(s => s.content ?? '').join('\n\n') : result.text;
      if (!result.stopped && (result.error || replyText.trim())) window.pip?.notifyReply?.({ id: `reply-${chatId}-${Date.now()}`, kind: result.error ? 'attention' : 'response', chatId, session: sessionId ? { id: sessionId, provider, title: chat.title || 'Ally reply', cwd: runCwd } : undefined, title: result.error ? 'Ally needs attention' : chat.title || 'Ally reply', text: result.error || replyText });

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
      busy.current.delete(chatId);
      delete spokenUpTo.current[chatId];
      updateLive(chatId, { ...emptyLive });
    }
  }, [agent, chats, cwd, parsed.model, parsed.provider, robotMode, onSentence]);

  /** Add the user's message to the active chat and get the agent's reply. */
  const send = useCallback(async (
    text: string,
    source: 'text' | 'speech' | 'circle' = 'text',
    extras: { mode?: 'auto' | 'steer' | 'queue'; context?: string; image?: { path: string; thumbnail: string } } = {},
  ) => {
    const { context, image } = extras;
    const chat = chats.activeChat;
    if (!chat || !text.trim()) return;
    if (externalRunning && !busy.current.has(chat.id) && chat.agent?.sessionId) {
      const intent = extras.mode === 'steer' ? 'steer' : 'queue';
      const key = JSON.stringify([chat.id, text, intent]);
      const requestId = externalRequests.current.get(key) ?? crypto.randomUUID();
      externalRequests.current.set(key, requestId);
      try {
        if (image) throw new Error('External input accepts text. Send the image after this response.');
        const mode = await window.pip.agent!.sessionInput(chat.agent.provider, chat.agent.sessionId, context ? `Context (from my clipboard):\n${context}\n\n${text}` : text, requestId, intent);
        externalRequests.current.delete(key);
        chats.setSendFailure(chat.id);
        updateLive(chat.id, { inputStatus: mode === 'steered' ? 'Added to current work' : 'Queued after this response' });
        if (mode !== 'queued') chats.addMessage(chat.id, { id: `input-${requestId}`, role: 'user', content: text, timestamp: Date.now(), metadata: { source, context } });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        chats.setSendFailure(chat.id, { message, text }); return { error: message };
      }
    }
    if (busy.current.has(chat.id)) {
      try {
        if (image) throw new Error('Mid-turn input currently accepts text and voice. Send the image after this response.');
        const prompt = context ? `Context (from my clipboard):\n${context}\n\n${text}` : text;
        const mode = await agent.steer(prompt, extras.mode, chat.id);
        chats.setSendFailure(chat.id);
        updateLive(chat.id, { inputStatus: mode === 'steered' ? 'Added to current work' : 'Queued after this response' });
        if (mode !== 'queued') chats.addMessage(chat.id, { id: `input-${crypto.randomUUID()}`, role: 'user', content: text, timestamp: Date.now(), metadata: { source, context } });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        chats.setSendFailure(chat.id, { message, text });
        return { error: message };
      }
    }
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
  }, [chats, isTyping, externalRunning, runTurn, agent]);

  /** Re-ask the user message before `messageId` (the assistant reply is replaced). */
  const regenerate = useCallback(async (messageId: string) => {
    const chat = chats.activeChat;
    if (!chat || busy.current.has(chat.id)) return;
    const index = chat.messages.findIndex(m => m.id === messageId);
    const userMessage = chat.messages[index - 1];
    if (index < 1 || userMessage?.role !== 'user') return;
    chats.deleteMessage(chat.id, messageId);
    await runTurn(chat.id, userMessage.content, chat.messages.slice(0, index - 1));
  }, [chats, isTyping, externalRunning, runTurn, agent]);

  const stop = useCallback(() => {
    if (agent.stop(selectedId)) return;
    const linked = chats.activeChat?.agent;
    if (linked?.sessionId) void window.pip.agent?.stopSession(linked.provider, linked.sessionId).catch(error => chats.setSendFailure(selectedId, { message: String(error), text: '' }));
  }, [agent, selectedId, chats]);
  const resume = useCallback(async () => {
    const chat = chats.activeChat;
    if (!chat?.agent?.sessionId || !control.token || busy.current.has(chat.id) || externalRunning) return;
    chats.addMessage(chat.id, { id: `resume-${crypto.randomUUID()}`, role: 'user', content: RESUME_PROMPT, timestamp: Date.now() });
    await runTurn(chat.id, RESUME_PROMPT, chat.messages, undefined, control.token);
  }, [chats, control.token, externalRunning, runTurn]);

  /** Continue an existing Claude Code / Codex session as an Ally chat. */
  const openSession = useCallback(async (session: AgentSessionSummary) => {
    if (!window.pip?.agent) return;
    const existing = chats.chats.find(chat => chat.agent?.provider === session.provider && (chat.agent.sessionId === session.id || chat.agent.originalSessionId === session.id));
    const target = existing ?? chats.openAgentSession({ provider: session.provider, sessionId: session.id, originalSessionId: session.originalSessionId, cwd: session.cwd, codexAccountId: session.codexAccountId }, session.title, undefined, session.createdAt);
    if (existing) chats.select(existing.id);
    // Follow-ups should go to the same agent
    if (parseAgentModel(model)?.provider !== session.provider) setModel(`${AGENT_MODEL_PREFIX[session.provider]}default`);
    const key = `${session.provider}:${session.id}`;
    if (openingSessions.current.has(key)) return openingSessions.current.get(key);
    const loading = window.pip.agent.loadSession(session.provider, session.id).then(snapshot => {
      const current = chats.getChat(target.id);
      if (busy.current.has(target.id)) return; // An accepted local send owns its messages; polling catches up after it ends.
      if (!current?.agent || current.agent.provider !== session.provider || (current.agent.sessionId !== session.id && current.agent.originalSessionId !== session.id)) return;
      const resolved = snapshot.sessionId ?? session.id;
      if (current.agent.sessionId !== resolved || (snapshot.codexAccountId && snapshot.codexAccountId !== current.agent.codexAccountId)) chats.setAgent(target.id, { ...current.agent, codexAccountId: snapshot.codexAccountId ?? current.agent.codexAccountId, sessionId: resolved, originalSessionId: snapshot.originalSessionId ?? session.id, cwd: snapshot.cwd ?? current.agent.cwd });
      if (!snapshot.unchanged) chats.syncAgentSession(target.id, session.provider, resolved, sessionMessages(resolved, snapshot.messages), snapshot.cwd);
    }).catch(error => {
      // Keep the selected chat and its saved transcript usable; a later click retries.
      updateLive(target.id, { inputStatus: `History unavailable · ${error instanceof Error ? error.message : 'retry opening this chat'}` });
    }).finally(() => { if (openingSessions.current.get(key) === loading) openingSessions.current.delete(key); });
    openingSessions.current.set(key, loading);
    return loading;
  }, [chats, isTyping, model, setModel]);

  const setFolder = useCallback(async (folder: string) => {
    await agent.updateConfig({ defaultCwd: folder });
    const linked = chats.activeChat?.agent;
    if (chats.activeChat && linked) {
      // A different folder is a different project, so start a new session there
      chats.setAgent(chats.activeChat.id, {
        provider: linked.provider,
        codexAccountId: linked.codexAccountId,
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
    inputStatus,
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
    resume,
    canResume: !!chats.activeChat?.agent?.sessionId && !!control.token && !isTyping && !externalRunning,
    canStop: isTyping || control.canStop,
    openSession,
  };
}
