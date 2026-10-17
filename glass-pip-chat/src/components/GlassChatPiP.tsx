import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { ThemeUtils } from '../utils/themeUtils';
import { GreetingUtils } from '../utils/greetingUtils';
import { SettingsManager } from '../utils/settingsManager';
import type { AppSettings } from '../types/settings';

import { useWindowManagement } from '../hooks/useWindowManagement';
import { useContextMonitoring } from '../hooks/useContextMonitoring';
import { useSpeechService } from '../hooks/useSpeechService';
import { useEditState } from '../hooks/useEditState';
import { useChats } from '../hooks/useChats';
import { useAgentConversation } from '../hooks/useAgentConversation';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

import FlowField, { FlowFieldState } from './FlowField';
import EdgeGlow from './glow/EdgeGlow';
import { DEFAULT_GLOW_PALETTE, GLOW_PALETTES } from './glow/palette';
import AvatarMode, { AVATAR_WINDOW, AvatarPulse, AvatarStatus } from './AvatarMode';
import ChatSidebar from './ChatSidebar';
import SettingsModal from './SettingsModal';
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
  baseHeight: 140,
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

  const [settingsManager] = useState(() => SettingsManager.getInstance());
  const [appSettings, setAppSettings] = useState<AppSettings>(() => settingsManager.getSettings());
  const [greeting, setGreeting] = useState(() => GreetingUtils.getCurrentGreeting(appSettings));
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
  const { isTyping, currentResponse, streamingSegments, thinkingText } = conversation;

  const headerTitleEdit = useEditState({
    initialValue: activeChat?.title || 'Chat',
    onSave: title => activeChat && chats.rename(activeChat.id, title),
  });

  // ---- Sending -------------------------------------------------------------

  const handleSend = async (messageInput?: string, fromQuickInput = false) => {
    const text = (messageInput ?? (fromQuickInput ? quickInput : input)).trim();
    if (!text || isTyping) return;
    if (fromQuickInput) setQuickInput('');
    else setInput('');
    setInputHistory(prev => [...prev.filter(h => h !== text), text].slice(-50));

    const includeClipboard = context.shouldIncludeContext(fromQuickInput, state.collapsed);
    if (includeClipboard) context.clearNewContextFlag();
    await conversation.send(text, 'text', { context: includeClipboard ? context.contextData.clipboard : undefined });
  };

  // Voice: recognized speech is sent straight away; new speech interrupts a reply
  const lastSpeechRef = useRef<string | null>(null);
  useEffect(() => {
    const text = speech.lastRecognizedText;
    if (!text || !speech.voiceModeEnabled || text === lastSpeechRef.current) return;
    lastSpeechRef.current = text;
    if (isTyping) {
      speech.stopCurrentSpeech();
      conversation.stop();
      setTimeout(() => conversation.send(text, 'speech'), 200);
    } else {
      conversation.send(text, 'speech');
    }
  }, [speech.lastRecognizedText, speech.voiceModeEnabled]);

  // Voice mode drives the microphone
  useEffect(() => {
    if (!speech.isConnected) return;
    if (speech.voiceModeEnabled && !speech.isListening) speech.startListening().catch(console.error);
    if (!speech.voiceModeEnabled && speech.isListening) speech.stopListening().catch(console.error);
  }, [speech.voiceModeEnabled, speech.isConnected, speech.isListening]);

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
    chats.create();
  };

  const selectChat = (chatId: string) => {
    speech.resetTTSQueue();
    chats.select(chatId);
  };

  const toggleCollapse = () => {
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
    isTyping,
  });

  useEffect(() => settingsManager.subscribe(next => {
    setAppSettings(next);
    setGreeting(GreetingUtils.getCurrentGreeting(next));
  }), [settingsManager]);

  useEffect(() => {
    if (!appSettings.greeting?.useRandomGreeting) return;
    const interval = setInterval(() => setGreeting(GreetingUtils.getCurrentGreeting(appSettings)), 30000);
    return () => clearInterval(interval);
  }, [appSettings]);

  useEffect(() => window.pip?.onToggleSpeech(() => setShowSpeechControls(prev => !prev)), []);

  // Circle to Ask: the overlay hands back a cropped screenshot + prompt
  // (a new circle interrupts a reply in progress, like voice barge-in)
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  useEffect(() => window.pip?.circle.onAsk(({ imagePath, thumbnail, prompt }) => {
    const ask = () => conversationRef.current.send(prompt, 'circle', { image: { path: imagePath, thumbnail } });
    if (conversationRef.current.isTyping) {
      conversationRef.current.stop();
      setTimeout(ask, 300);
    } else {
      ask();
    }
  }), []);


  // ---- Visual state ----------------------------------------------------------

  const toolRunning = streamingSegments.some(s => s.type === 'tool' && s.toolExecution?.status === 'executing');
  const backdropState = useMemo((): FlowFieldState => {
    if (isTyping && toolRunning) return 'tool_executing';
    if (isTyping && thinkingText) return 'thinking';
    if (isTyping) return 'streaming';
    if (speech.droidModeEnabled && speech.isSpeaking) return 'speaking';
    return 'idle';
  }, [isTyping, toolRunning, thinkingText, speech.droidModeEnabled, speech.isSpeaking]);

  const orbState = useMemo(() => {
    if (isTyping) return toolRunning ? 'processing' : 'thinking';
    if (speech.voiceModeEnabled && speech.isListening) return 'listening';
    if (speech.droidModeEnabled && speech.isSpeaking) return 'speaking';
    return 'idle';
  }, [isTyping, toolRunning, speech.voiceModeEnabled, speech.isListening, speech.droidModeEnabled, speech.isSpeaking]) as
    'idle' | 'listening' | 'thinking' | 'speaking' | 'processing';

  // ---- Avatar mode -------------------------------------------------------------

  const avatarMode = state.collapsed && (appSettings.ui.collapseStyle ?? 'avatar') === 'avatar';
  const avatarStatus: AvatarStatus = isTyping
    ? toolRunning ? 'tool' : 'thinking'
    : speech.voiceModeEnabled && speech.isListening ? 'listening' : 'idle';

  // When a turn ends, react to how it went
  const [avatarPulse, setAvatarPulse] = useState<AvatarPulse | null>(null);
  const wasTyping = useRef(false);
  useEffect(() => {
    if (wasTyping.current && !isTyping) {
      const last = messages[messages.length - 1];
      const failed = last?.role === 'assistant' && last.content.includes('⚠️');
      setAvatarPulse({ kind: failed ? 'failure' : 'success', at: Date.now() });
    }
    wasTyping.current = isTyping;
  }, [isTyping]);

  useEffect(() => {
    window.pip?.setAvatarMode(avatarMode);
  }, [avatarMode]);

  // ---- Window sizing ---------------------------------------------------------

  const padding = avatarMode ? 0 : appSettings.ui.windowPadding;
  const hasContext = context.hasNewContext && !!context.contextData.clipboard;
  let collapsedHeight = isPreviewExpanded ? COLLAPSED.previewHeight : COLLAPSED.baseHeight;
  if (isContextExpanded && hasContext) collapsedHeight += COLLAPSED.contextHeight;
  if (currentResponse || isTyping) collapsedHeight += COLLAPSED.responseHeight;

  const sidebarWidth = state.collapsed ? 0 : sidebarCollapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;
  const contentWidth = avatarMode
    ? AVATAR_WINDOW.width
    : Math.min(
      state.collapsed ? COLLAPSED.widthBySize[state.size] ?? 360 : sizePx[state.size].w + sidebarWidth,
      MAX_CONTENT.width - padding * 2,
    );
  const contentHeight = avatarMode
    ? AVATAR_WINDOW.height
    : Math.min(state.collapsed ? collapsedHeight : sizePx[state.size].h, MAX_CONTENT.height - padding * 2);

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

  const agentProps = {
    label: conversation.providerLabel,
    model: conversation.modelName,
    folder: conversation.cwd,
    permission: conversation.permission,
    onPickFolder: conversation.pickFolder,
    onCyclePermission: conversation.cyclePermission,
  };

  const messageHandlers = {
    onEdit: (id: string, content: string) => activeChat && chats.updateMessage(activeChat.id, id, content),
    onFork: (id: string, content: string) => activeChat && chats.forkAtMessage(activeChat.id, id, content),
    onDelete: (id: string) => activeChat && chats.deleteMessage(activeChat.id, id),
    onCopy: (content: string) => navigator.clipboard.writeText(content).catch(console.error),
    onCopyCode: (text: string) => navigator.clipboard.writeText(text).catch(console.error),
    onRecompute: conversation.regenerate,
  };

  if (avatarMode) {
    return (
      <div className="fixed inset-0 bg-transparent" style={{ width: contentWidth, height: contentHeight }}>
        <AvatarMode
          status={avatarStatus}
          pulse={avatarPulse}
          caption={isTyping ? `${conversation.providerLabel} is working…` : undefined}
          onExpand={toggleCollapse}
        />
      </div>
    );
  }

  return (
    <motion.div
      className={cn(
        'fixed bg-transparent flex items-center justify-center',
        platform === 'win32' && 'win32-acrylic',
        platform === 'linux' && 'linux-glass-effect'
      )}
      style={{ width: contentWidth + padding * 2, height: contentHeight + padding * 2, zIndex: 50 }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: isResizing ? 1.02 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
    >
      <motion.div
        layout
        className={cn(
          'overflow-hidden relative flex transition-all duration-300 chat-container acrylic-container',
          ThemeUtils.getBorderRadiusClass(appSettings.ui.borderRadius, platform),
          // prxptn: dark translucent glass, hairline border; the OS acrylic/blur still shows through
          'border border-border bg-black/60 text-foreground shadow-[0_12px_48px_rgba(0,0,0,0.55)]',
          isResizing && 'shadow-lg scale-[1.01]',
          platform === 'linux' && 'linux-blur',
          platform !== 'win32' && platform !== 'linux' && 'backdrop-blur-2xl backdrop-saturate-150'
        )}
        style={{ width: contentWidth, height: contentHeight, margin: `${padding}px` }}
      >
        <FlowField state={backdropState} />
        {/* Orbit Mary-style side glow while the agent works */}
        <EdgeGlow active={isTyping} colors={GLOW_PALETTES[DEFAULT_GLOW_PALETTE]} />

        {!state.collapsed && (
          <div className={cn('chat-sidebar', sidebarCollapsed && 'collapsed')}>
            <ChatSidebar
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
              onOpenAgentSession={conversation.openSession}
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
                onContextToggleChange={context.setContextToggleEnabled}
                uiSettings={appSettings.ui}
                currentResponse={currentResponse}
                currentModel={conversation.model}
                showModelSelector={showModelSelector}
                onModelSelectorToggle={() => setShowModelSelector(s => !s)}
                onModelSelect={conversation.setModel}
                voiceModeEnabled={speech.voiceModeEnabled}
                onVoiceModeToggle={() => setVoiceMode(!speech.voiceModeEnabled)}
                onSpeechSettingsOpen={() => setShowSettings(true)}
                speechServiceConnected={speech.isConnected}
                isContextExpanded={isContextExpanded}
                onContextExpandedChange={setIsContextExpanded}
                isSpeaking={speech.isSpeaking}
                isListening={speech.isListening}
                placeholder={greeting}
                orbState={orbState}
              />
            ) : (
              <ExpandedHeader
                platform={platform}
                theme={theme}
                isResizing={isResizing}
                sidebarCollapsed={sidebarCollapsed}
                onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
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
                <Conversation className="flex-1 select-text">
                  <ConversationContent className={cn('px-3 py-3', { compact: 'gap-3', normal: 'gap-5', comfortable: 'gap-7' }[appSettings.ui.messageSpacing])}>
                    {messages.length === 0 && !isTyping ? (
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
                    {isTyping && (
                      <Message from="assistant">
                        <MessageContent>
                          <AgentReply text={currentResponse} thinking={thinkingText} segments={streamingSegments} streaming />
                        </MessageContent>
                      </Message>
                    )}
                  </ConversationContent>
                  <ConversationScrollButton />
                </Conversation>

                <ChatInput
                  ref={inputRef}
                  input={input}
                  setInput={setInput}
                  onSend={() => handleSend()}
                  isTyping={isTyping}
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
                  palette={GLOW_PALETTES[DEFAULT_GLOW_PALETTE]}
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
