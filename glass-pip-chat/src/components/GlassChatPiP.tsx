import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { ThemeUtils } from '../utils/themeUtils';
import { useAgentGreeting } from '../hooks/useAgentGreeting';
import { SettingsManager } from '../utils/settingsManager';
import type { AppSettings } from '../types/settings';
import type { Segment } from '../types/chat';
import type { AgentPermission } from '../types/agent';

import { useWindowManagement } from '../hooks/useWindowManagement';
import { useContextMonitoring } from '../hooks/useContextMonitoring';
import { useSpeechService } from '../hooks/useSpeechService';
import { useEditState } from '../hooks/useEditState';
import { useChats } from '../hooks/useChats';
import { useAgentConversation } from '../hooks/useAgentConversation';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useExternalSessions } from '../hooks/useExternalSessions';
import { AGENT_MODEL_PREFIX } from '../types/agent';

import FlowField, { FlowFieldState } from './FlowField';
import WindowGlow from './glow/WindowGlow';
import type { OrbMood } from './glow/EnergyOrb';
import type { RobotPulse, RobotStatus } from './glow/RobotAvatar';
import ChatSidebar from './ChatSidebar';
import SettingsModal from './SettingsModal';
import ClaudeLoginDialog from './ClaudeLoginDialog';
import PerceptionBar from './perception/PerceptionBar';
import ContextCards from './perception/ContextCards';
import PerceptionDebug from './perception/PerceptionDebug';
import { usePerception } from '../hooks/usePerception';
import { SpeechControls } from './SpeechControls';
import CollapsedHeader from './chat/CollapsedHeader';
import ExpandedHeader from './chat/ExpandedHeader';
import ChatInput from './chat/ChatInput';
import ChatMessage, { AgentReply } from './chat/ChatMessage';
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';

const SIDEBAR_WIDTH = { expanded: 280, collapsed: 48 };
const MAX_CONTENT = { width: 850, height: 800 }; // larger windows overflow the acrylic background
const COLLAPSED = {
  widthBySize: { S: 320, M: 360, L: 420 } as Record<string, number>,
  baseHeight: 96,
  extrasHeight: 40,
  previewHeight: 340,
  contextHeight: 96,
  responseHeight: 140,
};

/** The glass PiP overlay: chat sidebar, agent conversation, voice and clipboard context. */
export default function GlassChatPiP() {
  const win = useWindowManagement();
  const { state, platform, theme, isResizing, setIsResizing, sizePx } = win;
  const context = useContextMonitoring();
  const speech = useSpeechService();
  const chats = useChats();
  const external = useExternalSessions();
  // Realtime meeting / lecture sessions (perception → relevance → agent)
  const perception = usePerception();
  const perceptionRef = useRef(perception);
  perceptionRef.current = perception;
  const [perceptionDebug, setPerceptionDebug] = useState(false);

  const [settingsManager] = useState(() => SettingsManager.getInstance());
  const [appSettings, setAppSettings] = useState<AppSettings>(() => settingsManager.getSettings());
  const [robotMode, setRobotMode] = useState(() => localStorage.getItem('ally-robot-mode') === 'true');

  const conversation = useAgentConversation({
    chats,
    robotMode,
    // Spoken replies while voice mode is on — the part Claude Code itself can't do
    onSentence: speech.voiceModeEnabled
      ? sentence => { speech.synthesizeSpeechStreaming(sentence).catch(err => console.error('TTS failed:', err)); }
      : undefined,
  });

  const [input, setInput] = useState('');
  const [quickInput, setQuickInput] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showSpeechControls, setShowSpeechControls] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [isContextExpanded, setIsContextExpanded] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeChat = chats.activeChat;
  const messages = activeChat?.messages ?? [];
  const { isTyping, runningChatId } = conversation;
  const activeIsWorking = isTyping && activeChat?.id === runningChatId;
  const selectedChatId = useRef(activeChat?.id);
  selectedChatId.current = activeChat?.id;
  const currentResponse = activeIsWorking ? conversation.currentResponse : '';
  const streamingSegments = activeIsWorking ? conversation.streamingSegments : [];
  const thinkingText = activeIsWorking ? conversation.thinkingText : '';
  const executingTool = [...conversation.streamingSegments].reverse().find(s => s.type === 'tool' && s.toolExecution?.status === 'executing')?.toolExecution;
  const lastSegment = conversation.streamingSegments.at(-1);
  const workingStatus = executingTool ? `Working · ${executingTool.name}` : lastSegment?.type === 'thinking' ? 'Thinking…' : lastSegment?.type === 'text' ? 'Writing…' : 'Working…';
  const runningChatTitle = chats.chats.find(chat => chat.id === runningChatId)?.title || 'another chat';
  // The active chat is mid-turn in the Claude Code / Codex app: show it working, but
  // Stop belongs to that app (Ally only reads its transcript)
  const externalWorking = !activeIsWorking && conversation.externalRunning;
  const externalApp = activeChat?.agent?.provider === 'codex' ? 'Codex' : 'Claude Code';
  const externalTool = externalWorking
    ? [...((messages.at(-1)?.metadata?.segments ?? []) as Segment[])].reverse().find(s => s.type === 'tool' && s.toolExecution?.status === 'executing')?.toolExecution
    : undefined;
  const externalStatus = `Working in ${externalApp}${externalTool ? ` · ${externalTool.name}` : '…'}`;
  const greeting = useAgentGreeting(conversation.provider, conversation.modelName);

  const headerTitleEdit = useEditState({
    initialValue: activeChat?.title || 'Chat',
    onSave: title => activeChat && chats.rename(activeChat.id, title),
  });

  // ---- Sending -------------------------------------------------------------

  const handleSend = async (messageInput?: string, fromQuickInput = false) => {
    const text = (messageInput ?? (fromQuickInput ? quickInput : input)).trim();
    if (!text) return;
    if (fromQuickInput) setQuickInput('');
    else setInput('');
    setInputHistory(prev => [...prev.filter(h => h !== text), text].slice(-50));

    const includeClipboard = context.shouldIncludeContext(fromQuickInput, state.collapsed);
    if (includeClipboard) context.clearNewContextFlag();
    const sentFrom = activeChat?.id;
    const result = await conversation.send(text, 'text', { context: includeClipboard ? context.contextData.clipboard : undefined });
    if (result?.error && selectedChatId.current === sentFrom) {
      // Preserve anything typed meanwhile; a failure also keeps a saved copy per chat.
      if (fromQuickInput) setQuickInput(current => current || text);
      else setInput(current => current || text);
    }
  };

  // Voice adds guidance to the active work without cancelling it.
  const lastSpeechRef = useRef<number>(0);
  useEffect(() => {
    const text = speech.lastRecognizedText;
    if (!text || !speech.voiceModeEnabled || speech.recognitionId === lastSpeechRef.current) return;
    lastSpeechRef.current = speech.recognitionId;
    if (isTyping) {
      speech.stopCurrentSpeech();
      conversation.send(text, 'speech');
    } else {
      conversation.send(text, 'speech');
    }
  }, [speech.recognitionId, speech.voiceModeEnabled]);

  const setVoiceMode = async (enabled: boolean) => {
    if (enabled && !speech.isConnected) {
      try {
        await speech.connect();
      } catch (error) {
        console.error('Failed to connect to speech service:', error);
        return;
      }
    }
    speech.setVoiceModeEnabled(enabled);
  };

  // ---- Chat + window actions ------------------------------------------------

  const createChat = () => {
    speech.resetTTSQueue();
    const chat = chats.create();
    chats.setAgent(chat.id, { provider: conversation.provider, cwd: conversation.cwd });
  };

  const selectChat = (chatId: string) => {
    speech.resetTTSQueue();
    chats.select(chatId);
    const provider = chats.getChat(chatId)?.agent?.provider;
    if (provider && provider !== conversation.provider) conversation.setModel(`${AGENT_MODEL_PREFIX[provider]}default`);
  };
  useEffect(() => window.pip?.onReplyOpen?.(notice => {
    if (notice.chatId && chats.getChat(notice.chatId)) selectChat(notice.chatId);
    else if (notice.session) { speech.resetTTSQueue(); void conversation.openSession(notice.session); }
  }), [chats, conversation]);

  const toggleCollapse = () => {
    setExtrasOpen(false);
    setShowModelSelector(false);
    if (!state.collapsed) {
      setIsPreviewExpanded(false);
    }
    win.handleCollapseToggle();
  };

  const toggleRobotMode = () => {
    setRobotMode(prev => {
      localStorage.setItem('ally-robot-mode', String(!prev));
      return !prev;
    });
  };

  useKeyboardShortcuts({
    toggleCollapse,
    openSettings: () => setShowSettings(true),
    newChat: createChat,
    hide: win.handleHide,
    cycleSize: win.handleSizeChange,
    toggleSidebar: () => !state.collapsed && setSidebarCollapsed(c => !c),
    toggleContext: () => context.setShowContext(!context.showContext),
    focusInput: () => (state.collapsed ? document.getElementById('quick-input') : inputRef.current)?.focus(),
    stop: conversation.stop,
    history: inputHistory,
    isTyping: isTyping || externalWorking,
  });

  useEffect(() => settingsManager.subscribe(next => {
    setAppSettings(next);
  }), [settingsManager]);

  useEffect(() => window.pip?.onToggleSpeech(() => setShowSpeechControls(prev => !prev)), []);

  // Circle to Ask: the overlay hands back a cropped screenshot + prompt
  // (a new circle interrupts a reply in progress, like voice barge-in)
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  useEffect(() => window.pip?.circle.onAsk(async ({ imagePath, thumbnail, prompt }) => {
    const live = perceptionRef.current.status?.session?.state === 'running' ? await perceptionRef.current.api?.context(30_000).catch(() => '') : '';
    const withContext = live ? `${prompt}\n\n[Recent audio and screen, last 30 s]\n${live}` : prompt;
    const ask = () => conversationRef.current.send(withContext, 'circle', { image: { path: imagePath, thumbnail } });
    if (conversationRef.current.isTyping) {
      conversationRef.current.stop();
      setTimeout(ask, 300);
    } else {
      ask();
    }
  }), []);


  // An agent asked Ally to open a chat (ally_open_chat / forward with open_in_ally).
  // If a reply is streaming here, switch once it finishes.
  const pendingOpen = useRef<Parameters<typeof conversation.openSession>[0] | null>(null);
  useEffect(() => window.pip?.chatsMcp?.onOpenChat(req => {
    const session = { provider: req.provider, id: req.sessionId, title: req.title, cwd: req.cwd, updatedAt: Date.now() };
    if (conversationRef.current.isTyping) pendingOpen.current = session;
    else void conversationRef.current.openSession(session);
  }), []);
  useEffect(() => {
    if (conversation.isTyping || !pendingOpen.current) return;
    const session = pendingOpen.current;
    pendingOpen.current = null;
    void conversation.openSession(session);
  }, [conversation.isTyping]);

  // ---- Visual state ----------------------------------------------------------

  const toolRunning = streamingSegments.some(s => s.type === 'tool' && s.toolExecution?.status === 'executing');
  const backdropState = useMemo((): FlowFieldState => {
    if (isTyping && toolRunning) return 'tool_executing';
    if (isTyping && thinkingText) return 'thinking';
    if (isTyping) return 'streaming';
    if (speech.droidModeEnabled && speech.isSpeaking) return 'speaking';
    return 'idle';
  }, [isTyping, toolRunning, thinkingText, speech.droidModeEnabled, speech.isSpeaking]);

  // Seeing or hearing: voice input, a circled screenshot being looked at, or a
  // perception / image tool running. The orb morphs into the robot for these.
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const perceiving = streamingSegments.some(s =>
    s.type === 'tool' && s.toolExecution?.status === 'executing' &&
    /howyouseeme|droidcore|camera|vision|screenshot|view_image|perceive|look|see|hear|listen|audio|\.(png|jpe?g|gif|webp)\b/i.test(
      s.toolExecution.name + ' ' + JSON.stringify(s.toolExecution.parameters ?? {}))
  );
  const listening = speech.voiceModeEnabled && speech.isListening;
  const sensing = listening || (isTyping && (perceiving || !!lastUser?.metadata?.image));
  const mood: OrbMood = isTyping ? 'busy' : listening ? 'listening' : 'idle';
  const robotStatus: RobotStatus = listening ? 'listening' : isTyping ? (sensing ? 'seeing' : toolRunning ? 'tool' : 'thinking') : 'idle';
  const [extrasOpen, setExtrasOpen] = useState(false);

  // When a turn ends, react to how it went
  const [robotPulse, setRobotPulse] = useState<RobotPulse | null>(null);
  const wasTyping = useRef(false);
  useEffect(() => {
    if (wasTyping.current && !isTyping) {
      const last = messages[messages.length - 1];
      const failed = last?.role === 'assistant' && last.content.includes('⚠️');
      setRobotPulse({ kind: failed ? 'failure' : 'success', at: Date.now() });
    }
    wasTyping.current = isTyping;
  }, [isTyping]);

  // ---- Window sizing ---------------------------------------------------------

  // On Windows the OS draws the rounded acrylic window, so the app fills it edge to edge;
  // elsewhere the app draws its own rounded glass inside a transparent window
  const nativeFrame = platform === 'win32';
  const padding = nativeFrame ? 0 : appSettings.ui.windowPadding;
  const hasContext = context.hasNewContext && !!context.contextData.clipboard;
  let collapsedHeight = isPreviewExpanded ? COLLAPSED.previewHeight : COLLAPSED.baseHeight;
  if (extrasOpen) collapsedHeight += COLLAPSED.extrasHeight + (state.size === 'S' ? 32 : 0);
  if (isContextExpanded && hasContext && context.showContext) collapsedHeight += COLLAPSED.contextHeight;
  if (currentResponse || isTyping) collapsedHeight += COLLAPSED.responseHeight;
  // Portals still live inside the native window; make room for the agent picker.
  if (showModelSelector) collapsedHeight = Math.max(collapsedHeight, 440);
  if (showSettings) collapsedHeight = Math.max(collapsedHeight, 600);

  const sidebarWidth = state.collapsed ? 0 : sidebarCollapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;
  const contentWidth = Math.min(
    state.collapsed ? COLLAPSED.widthBySize[state.size] ?? 360 : sizePx[state.size].w + sidebarWidth,
    MAX_CONTENT.width - padding * 2,
  );
  const contentHeight = Math.min(state.collapsed ? collapsedHeight : sizePx[state.size].h, MAX_CONTENT.height - padding * 2);

  // The expanded sidebar doesn't fit next to the largest chat area
  useEffect(() => {
    if (!state.collapsed && sizePx[state.size].w + SIDEBAR_WIDTH.expanded > MAX_CONTENT.width - padding * 2) {
      setSidebarCollapsed(true);
    }
  }, [state.size, state.collapsed, padding]);

  useEffect(() => {
    if (!window.pip) return;
    setIsResizing(true);
    const delay = state.collapsed ? 200 : 50; // let collapse cleanup settle first
    const resize = setTimeout(() => window.pip.resizeWindow(contentWidth + padding * 2, contentHeight + padding * 2), delay);
    const reset = setTimeout(() => setIsResizing(false), 400 + delay);
    return () => {
      clearTimeout(resize);
      clearTimeout(reset);
    };
  }, [contentWidth, contentHeight, padding, state.collapsed]);

  // Folders the user's chats already run in, newest first, for the folder picker
  const recentFolders = useMemo(() => {
    const dated = [
      ...chats.chats.map(c => ({ cwd: c.agent?.cwd, at: c.updatedAt })),
      ...external.sessions.map(s => ({ cwd: s.cwd, at: s.updatedAt })),
    ].filter((x): x is { cwd: string; at: number } => !!x.cwd).sort((a, b) => b.at - a.at);
    return [...new Set(dated.map(x => x.cwd))];
  }, [chats.chats, external.sessions]);

  const agentProps = {
    label: conversation.providerLabel,
    provider: conversation.provider,
    model: conversation.modelName,
    folder: conversation.cwd,
    homeFolder: conversation.homeCwd,
    recentFolders,
    permission: conversation.permission,
    onPickFolder: conversation.pickFolder,
    onCyclePermission: conversation.cyclePermission,
    onModel: conversation.setModel,
    onFolder: (folder: string) => void conversation.setFolder(folder),
    onPermission: (permission: AgentPermission) => void conversation.setPermission(permission),
  };

  const messageHandlers = {
    onEdit: (id: string, content: string) => activeChat && chats.updateMessage(activeChat.id, id, content),
    onFork: (id: string, content: string) => activeChat && chats.forkAtMessage(activeChat.id, id, content),
    onDelete: (id: string) => activeChat && chats.deleteMessage(activeChat.id, id),
    onCopy: (content: string) => navigator.clipboard.writeText(content).catch(console.error),
    onCopyCode: (text: string) => navigator.clipboard.writeText(text).catch(console.error),
    onRecompute: conversation.regenerate,
  };

  return (
    <motion.div
      className={cn(
        'fixed bg-transparent flex items-center justify-center',
        platform === 'win32' && 'win32-acrylic',
        platform === 'linux' && 'linux-glass-effect'
      )}
      style={{ width: contentWidth + padding * 2, height: contentHeight + padding * 2, zIndex: 50 }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: isResizing && !nativeFrame ? 1.02 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
    >
      <motion.div
        layout
        className={cn(
          'overflow-hidden relative flex transition-all duration-300 chat-container acrylic-container',
          // prxptn: dark translucent glass; the OS acrylic/blur still shows through
          'bg-black/60 text-foreground',
          !nativeFrame && ThemeUtils.getBorderRadiusClass(appSettings.ui.borderRadius, platform),
          !nativeFrame && 'border border-border shadow-[0_12px_48px_rgba(0,0,0,0.55)]',
          !nativeFrame && isResizing && 'shadow-lg scale-[1.01]',
          platform === 'linux' && 'linux-blur',
          platform !== 'win32' && platform !== 'linux' && 'backdrop-blur-2xl backdrop-saturate-150'
        )}
        style={{ width: contentWidth, height: contentHeight, margin: `${padding}px` }}
      >
        <FlowField state={backdropState} />
        {/* Orbit Mary's panel glow: while the agent works and while you type */}
        <WindowGlow agentWorking={isTyping || externalWorking} userTyping={!!(state.collapsed ? quickInput : input).trim()} />

        {!state.collapsed && (
          <div className={cn('chat-sidebar', sidebarCollapsed && 'collapsed')}>
            <ChatSidebar
              homeCwd={conversation.homeCwd}
              runningChatId={runningChatId ?? (externalWorking ? activeChat?.id : null)}
              workingStatus={runningChatId ? workingStatus : externalStatus}
              onStop={runningChatId ? conversation.stop : undefined}
              chats={chats.chats}
              activeChat={activeChat?.id || null}
              onChatSelect={selectChat}
              onChatCreate={createChat}
              onChatDelete={chats.remove}
              onChatRename={chats.rename}
              isCollapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
              theme={theme}
              platform={platform}
              externalSessions={external.sessions}
              runningSessions={external.running}
              runningError={external.runningError}
              onOpenAgentSession={session => void conversation.openSession(session).then(external.refresh)}
            />
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 chat-main-area">
          {/* Header */}
          <div
            className={cn(
              'relative z-10 flex min-h-[44px] cursor-grab items-center gap-2 border-b border-border bg-black/20 px-2.5 py-2 active:cursor-grabbing',
              state.collapsed && 'flex-col items-stretch gap-2 border-b-0 pb-3'
            )}
            style={{ WebkitAppRegion: state.collapsed ? 'no-drag' : 'drag', userSelect: 'none' } as React.CSSProperties}
            title={state.collapsed ? '' : 'Drag to move window'}
          >
            {state.collapsed ? (
              <CollapsedHeader
                platform={platform}
                theme={theme}
                isTyping={isTyping}
                messages={messages}
                quickInput={quickInput}
                setQuickInput={setQuickInput}
                onSend={(text) => handleSend(text, true)}
                onStop={conversation.stop}
                onCollapseToggle={toggleCollapse}
                onSizeChange={win.handleSizeChange}
                onHide={win.handleHide}
                onCopyMessage={messageHandlers.onCopy}
                onPreviewToggle={setIsPreviewExpanded}
                onMessageEdit={messageHandlers.onEdit}
                onMessageFork={messageHandlers.onFork}
                onMessageDelete={messageHandlers.onDelete}
                onCopyCode={messageHandlers.onCopyCode}
                onRecompute={messageHandlers.onRecompute}
                isResizing={isResizing}
                size={state.size}
                hasNewContext={context.hasNewContext}
                contextData={context.contextData}
                contextToggleEnabled={context.contextToggleEnabled}
                showContext={context.showContext}
                onContextToggle={() => context.setShowContext(!context.showContext)}
                uiSettings={appSettings.ui}
                currentResponse={currentResponse}
                currentModel={conversation.model}
                showModelSelector={showModelSelector}
                onModelSelectorToggle={() => setShowModelSelector(s => !s)}
                onModelSelect={conversation.setModel}
                voiceModeEnabled={speech.voiceModeEnabled}
                onVoiceModeToggle={() => setVoiceMode(!speech.voiceModeEnabled)}
                speechServiceConnected={speech.isConnected}
                isContextExpanded={isContextExpanded}
                onContextExpandedChange={setIsContextExpanded}
                placeholder={greeting}
                mood={mood}
                sensing={sensing}
                robotStatus={robotStatus}
                pulse={robotPulse}
                onExtrasChange={setExtrasOpen}
              />
            ) : (
              <ExpandedHeader
                platform={platform}
                theme={theme}
                isResizing={isResizing}
                activeChat={activeChat}
                headerTitleEdit={headerTitleEdit}
                hasNewContext={context.hasNewContext}
                contextData={context.contextData}
                showContext={context.showContext}
                onContextToggle={() => context.setShowContext(!context.showContext)}
                contextToggleEnabled={context.contextToggleEnabled}
                onContextToggleChange={context.setContextToggleEnabled}
                currentModel={conversation.model}
                showModelSelector={showModelSelector}
                onModelSelectorToggle={() => setShowModelSelector(s => !s)}
                onModelSelect={conversation.setModel}
                onSizeChange={win.handleSizeChange}
                onSettings={() => setShowSettings(true)}
                onCollapseToggle={toggleCollapse}
                onHide={win.handleHide}
                size={state.size}
                showSpeechControls={showSpeechControls}
                onSpeechToggle={() => setShowSpeechControls(!showSpeechControls)}
              />
            )}
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            {!state.collapsed && (
              <motion.div
                key="content"
                className="flex flex-col h-[calc(100%-44px)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Transcript (AI Elements): sticks to the bottom while the agent streams */}
                <div className="relative flex min-h-0 flex-1 flex-col">
                <ContextCards perception={perception} />
                <Conversation className="flex-1 select-text">
                  <ConversationContent className={cn('px-3 py-3', { compact: 'gap-3', normal: 'gap-5', comfortable: 'gap-7' }[appSettings.ui.messageSpacing])}>
                    {messages.length === 0 && !activeIsWorking ? (
                      <ConversationEmptyState
                        title={conversation.providerLabel}
                        description="Ask anything, or circle something on screen."
                        className="[&_h3]:font-tanker [&_h3]:text-2xl [&_h3]:tracking-wide"
                      />
                    ) : (
                      messages.map(message => (
                        <ChatMessage
                          key={message.id}
                          message={message}
                          onEdit={messageHandlers.onEdit}
                          onFork={messageHandlers.onFork}
                          onDelete={messageHandlers.onDelete}
                          onRetry={messageHandlers.onRecompute}
                        />
                      ))
                    )}
                    {activeIsWorking && (
                      <Message from="assistant">
                        <MessageContent>
                          <AgentReply text={currentResponse} thinking={thinkingText} segments={streamingSegments} streaming />
                        </MessageContent>
                      </Message>
                    )}
                  </ConversationContent>
                  <ConversationScrollButton />
                </Conversation>
                </div>

                {activeChat?.sendFailure && <div role="alert" className="border-t border-border px-3 py-2 text-xs text-amber-200">
                  <p>{activeChat.sendFailure.message}</p>
                  <div className="mt-1 flex gap-3">
                    {!input.trim() && <button type="button" className="underline" onClick={() => setInput(activeChat.sendFailure!.text)}>Restore message</button>}
                    <button type="button" className="underline" onClick={() => chats.setSendFailure(activeChat.id)}>Dismiss</button>
                  </div>
                </div>}
                <PerceptionBar perception={perception} sessions={external.sessions} onOpenDebug={() => setPerceptionDebug(true)} />
                <ChatInput
                  ref={inputRef}
                  input={input}
                  setInput={setInput}
                  onSend={() => handleSend()}
                  isTyping={isTyping || externalWorking}
                  workingStatus={conversation.inputStatus || (externalWorking ? externalStatus : activeIsWorking ? workingStatus : `${workingStatus} · ${runningChatTitle}`)}
                  stopDisabledReason={externalWorking ? `Running in the ${externalApp} app. Stop it there.` : undefined}
                  onStop={conversation.stop}
                  contextData={context.contextData}
                  onExplainClipboard={() => {
                    setInput(`Explain this: ${context.contextData.clipboard}`);
                    context.clearNewContextFlag();
                  }}
                  placeholder={speech.interimTranscript ? `🎤 ${speech.interimTranscript}` : greeting}
                  messages={messages}
                  robotMode={robotMode}
                  onRobotModeToggle={toggleRobotMode}
                  sensing={sensing}
                  robotStatus={robotStatus}
                  voice={{ enabled: speech.voiceModeEnabled, listening: speech.voiceModeEnabled && speech.isListening, onToggle: () => setVoiceMode(!speech.voiceModeEnabled) }}
                  agent={agentProps}
                />

                <AnimatePresence>
                  {showSpeechControls && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-white/10 overflow-hidden"
                    >
                      <div className="p-3">
                        {/* Recognized speech is handled once, by the lastRecognizedText effect above */}
                        <SpeechControls
                          onVoiceModeChange={setVoiceMode}
                          onDroidModeChange={speech.setDroidModeEnabled}
                          onSettingsOpen={() => setShowSettings(true)}
                          voiceModeEnabled={speech.voiceModeEnabled}
                          droidModeEnabled={speech.droidModeEnabled}
                          compact={false}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <ClaudeLoginDialog />
      <PerceptionDebug open={perceptionDebug} onOpenChange={setPerceptionDebug} perception={perception} />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        platform={platform}
        theme={theme}
        contextToggleEnabled={context.contextToggleEnabled}
        onContextToggleChange={context.setContextToggleEnabled}
        appSettings={appSettings}
        onSettingsChange={updates => settingsManager.updateSettings(updates)}
      />
    </motion.div>
  );
}
