import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { ThemeUtils } from '../utils/themeUtils';
import { useAgentGreeting } from '../hooks/useAgentGreeting';
import { useNotchPreview } from '../hooks/useNotchPreview';
import { useLiveStudyReply } from '../hooks/useLiveStudyReply';
import { SettingsManager } from '../utils/settingsManager';
import type { AppSettings } from '../types/settings';
import type { Segment } from '../types/chat';
import type { AgentPermission } from '../types/agent';

import { useWindowManagement } from '../hooks/useWindowManagement';
import { useWindowSizing } from '../hooks/useWindowSizing';
import ExpandedChatSurface from './chat/ExpandedChatSurface';
import { useContextMonitoring } from '../hooks/useContextMonitoring';
import { useSpeechService } from '../hooks/useSpeechService';
import { useEditState } from '../hooks/useEditState';
import { useChats } from '../hooks/useChats';
import { useChatDrafts } from '../hooks/useChatDrafts';
import { useAgentConversation } from '../hooks/useAgentConversation';
import { useChatInteractions } from '../hooks/useChatInteractions';
import ChatInteractionCard from './chat/ChatInteractionCard';
import PendingDecisionOverlay from './chat/PendingDecisionOverlay';
import HandoffHalo from './chat/HandoffHalo';
import { interactionTimeline } from '../lib/interactionTimeline';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useExternalSessions } from '../hooks/useExternalSessions';
import { useSharedChatSelection } from '../hooks/useSharedChatSelection';
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
import { selectedSessionRunning } from '@/lib/compactPresentation';
import { useVisualTutor } from '@/hooks/useVisualTutor';
import VisualTutorControls from './visualTutor/VisualTutorControls';
import CircleSelectionControls from './visualTutor/CircleSelectionControls';
import { meetingReply } from './chat/CollapsedMeetingControls';
import ExpandedHeader from './chat/ExpandedHeader';
import ChatInput from './chat/ChatInput';
import CodexAccountControl from './chat/CodexAccountControl';
import MessageQueueStack from './chat/MessageQueueStack';
import ChatMessage, { AgentReply } from './chat/ChatMessage';
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';

const SIDEBAR_WIDTH = { expanded: 280, collapsed: 48 };
const MAX_CONTENT = { width: 850, height: 800 }; // larger windows overflow the acrylic background
const COLLAPSED = {
  widthBySize: { S: 320, M: 360, L: 420 } as Record<string, number>,
  baseHeight: 96,
};

/** The glass PiP overlay: chat sidebar, agent conversation, voice and clipboard context. */
export default function GlassChatPiP() {
  const win = useWindowManagement();
  const { state, manualSize, platform, theme, isResizing, setIsResizing, sizePx } = win;
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

  const draftId = chats.activeChat?.id ?? '';
  const { input, setInput } = useChatDrafts(draftId);
  // Both sizes edit the same draft, including a send restored after failure.
  const quickInput = input;
  const setQuickInput = setInput;
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showSpeechControls, setShowSpeechControls] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [collapsedBodyHeight, setCollapsedBodyHeight] = useState(76);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [screenAutoAttach, setScreenAutoAttach] = useState(() => localStorage.getItem('ally-screen-auto-attach') === 'true');
  const [screenNotice, setScreenNotice] = useState('');
  const preparingScreen = useRef(false);
  useEffect(() => { localStorage.setItem('ally-screen-auto-attach', String(screenAutoAttach)); }, [screenAutoAttach]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeChat = chats.activeChat;
  const selectionError = useSharedChatSelection(activeChat, chats.selectionRestored, conversation.permission, conversation.openSession, chats.setAgent, {
    setPermission: conversation.setPermission,
    selectLocal: id => { if (!chats.getChat(id)) return false; chats.select(id); return true; },
  });
  const messages = activeChat?.messages ?? [];
  const sessionKey = activeChat?.agent?.sessionId ? `${activeChat.agent.provider}:${activeChat.agent.sessionId}` : undefined;
  const studyLive = useLiveStudyReply(sessionKey);
  const liveStudy = studyLive?.working ? studyLive : null;
  const decisions = useChatInteractions(sessionKey);
  const pendingDecisions = decisions.rows.filter(row => row.state === 'pending');
  const decisionCards = <div className="max-h-80 space-y-2 overflow-y-auto">{pendingDecisions.map(request => <ChatInteractionCard key={request.id} request={request} onAnswer={decisions.answer} />)}</div>;
  const meetingTurn = meetingReply(perception, activeChat);
  const meetingWorking = meetingTurn?.state === 'running' || meetingTurn?.state === 'queued';
  const { isTyping, runningChatId } = conversation;
  const activeIsWorking = isTyping && activeChat?.id === runningChatId;
  const currentResponse = activeIsWorking ? conversation.currentResponse : '';
  const streamingSegments = activeIsWorking ? conversation.streamingSegments : [];
  const thinkingText = activeIsWorking ? conversation.thinkingText : '';
  const timeline = useMemo(() => state.collapsed ? [] : interactionTimeline(messages, decisions.rows.filter(row=>!activeIsWorking || row.state!=='pending')), [messages, decisions.rows, state.collapsed, activeIsWorking]);
  const executingTool = [...conversation.streamingSegments].reverse().find(s => s.type === 'tool' && s.toolExecution?.status === 'executing')?.toolExecution;
  const lastSegment = conversation.streamingSegments.at(-1);
  const workingStatus = executingTool ? `Working · ${executingTool.name}` : lastSegment?.type === 'thinking' ? 'Thinking…' : lastSegment?.type === 'text' ? 'Writing…' : 'Working…';
  const runningChatTitle = chats.chats.find(chat => chat.id === runningChatId)?.title || 'another chat';
  // The active chat is mid-turn in the Claude Code / Codex app: show it working, but
  // Stop belongs to that app (Ally only reads its transcript)
  const externalWorking = !activeIsWorking && (!!liveStudy || conversation.externalRunning || selectedSessionRunning(activeChat, external.running));
  const externalApp = activeChat?.agent?.provider === 'codex' ? 'Codex' : 'Claude Code';
  const externalTool = externalWorking
    ? [...((messages.at(-1)?.metadata?.segments ?? []) as Segment[])].reverse().find(s => s.type === 'tool' && s.toolExecution?.status === 'executing')?.toolExecution
    : undefined;
  const externalStatus = externalTool ? `Working · ${externalTool.name}` : 'Thinking…';
  const tutor = useVisualTutor(activeChat?.id, conversation.send, activeChat?.agent?.sessionId ? `${activeChat.agent.provider}:${activeChat.agent.sessionId}` : activeChat?.id);
  useEffect(() => { void window.pip?.circle?.setChat?.(activeChat?.id, activeChat?.title).catch(() => {}); }, [activeChat?.id, activeChat?.title]);
  const greeting = useAgentGreeting(conversation.provider, conversation.modelName);
  const lastMessage = messages.at(-1);
  useNotchPreview(
    appSettings.notch?.livePreview !== false,
    activeIsWorking || externalWorking,
    [...messages].reverse().find(m => m.role === 'user')?.content ?? '',
    currentResponse || (externalWorking && lastMessage?.role === 'assistant' ? lastMessage.content : ''),
    activeIsWorking ? workingStatus : externalStatus,
    appSettings.notch?.greetOnDock === false ? '' : greeting,
  );

  const headerTitleEdit = useEditState({
    initialValue: activeChat?.title || 'Chat',
    onSave: title => activeChat && chats.rename(activeChat.id, title),
  });

  // ---- Sending -------------------------------------------------------------

  const handleSend = async (messageInput?: string, fromQuickInput = false, mode: 'auto' | 'steer' | 'queue' = 'queue') => {
    const text = (messageInput ?? (fromQuickInput ? quickInput : input)).trim();
    if (!text) return;
    if (preparingScreen.current) return;
    const midTurn = activeIsWorking || externalWorking;
    setScreenNotice('');
    const targetChatId = activeChat?.id;
    const attachment = tutor.claimAttachment(midTurn);
    if (attachment.blocked) { setScreenNotice('Your selected image is saved. Send it after this response finishes; Queue and Steer accept text during a response.'); return; }
    if (screenAutoAttach && midTurn) setScreenNotice('Sending text follow-up. Screen auto-attach resumes with your next new turn.');
    if (screenAutoAttach && !midTurn && !attachment.image) {
      if (tutor.board) { setScreenNotice('Drawing context attached · clear it to auto-attach a fresh screen.'); }
      else {
        preparingScreen.current = true; setScreenNotice('Attaching screen…');
        try {
          if (!window.pip?.captureQueryScreen) throw Error('Desktop capture unavailable');
          attachment.image = await window.pip.captureQueryScreen(); setScreenNotice('');
        } catch { setScreenNotice('Screen unavailable · sending your question without it.'); }
        finally { preparingScreen.current = false; }
        if (circleTarget.current.chatId !== targetChatId) { setScreenNotice('Chat changed · screen was not sent.'); return; }
      }
    }
    setInput(current => current.trim() === text ? '' : current);
    setInputHistory(prev => [...prev.filter(h => h !== text), text].slice(-50));

    const includeClipboard = context.shouldIncludeContext(fromQuickInput, state.collapsed);
    if (includeClipboard) context.clearNewContextFlag();
    const result = tutor.board?.presentation === 'study' && !midTurn
      ? await tutor.study(includeClipboard ? `Context (from my clipboard):\n${context.contextData.clipboard}\n\n${text}` : text, activeIsWorking || externalWorking)
      : await conversation.send(tutor.decorate(text), 'text', { mode, image: attachment.image, context: includeClipboard ? context.contextData.clipboard : undefined });
    if (result?.error) {
      setScreenNotice(result.error);
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
    if (tutor.board?.presentation === 'study') {
      void tutor.study(text, activeIsWorking || externalWorking).then(result => { if (result?.error) setInput(current => current ? `${current}\n${text}` : text); });
      return;
    }
    const attachment = tutor.claimAttachment(activeIsWorking || externalWorking);
    if (attachment.blocked) { setInput(current => current ? `${current}\n${text}` : text); return; }
    if (screenAutoAttach && !attachment.image) {
      // Reuse exact-query capture, busy checks and error handling; voice remains
      // a draft until submission rather than silently dropping context.
      setInput(current => current ? `${current}\n${text}` : text);
      void handleSend(text, true);
      return;
    }
    if (isTyping) {
      speech.stopCurrentSpeech();
      conversation.send(tutor.decorate(text), 'speech', { image: attachment.image });
    } else {
      conversation.send(tutor.decorate(text), 'speech', { image: attachment.image });
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
    setShowModelSelector(false);
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

  const openMeetingChat = () => {
    const session = perception.status?.session;
    if (!session) return;
    const linked = chats.chats.find(chat => chat.agent?.provider === session.provider && chat.agent.sessionId === session.sessionId);
    if (linked) selectChat(linked.id);
    else void conversation.openSession({ id: session.sessionId, provider: session.provider, title: session.title, cwd: session.cwd, updatedAt: Date.now() });
  };

  // Circle to Ask: the overlay hands back a cropped screenshot + prompt
  // (a new circle interrupts a reply in progress, like voice barge-in)
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const circleTarget = useRef({ chatId: activeChat?.id, agent: activeChat?.agent, tutor });
  circleTarget.current = { chatId: activeChat?.id, agent: activeChat?.agent, tutor };
  useEffect(() => window.pip?.circle.onAsk(async ({ imagePath, thumbnail, prompt, chatId, tutorCaptureId, attachOnly }) => {
    if (chatId && circleTarget.current.chatId !== chatId) return;
    if (attachOnly && tutorCaptureId && chatId) {
      await circleTarget.current.tutor.attach(tutorCaptureId, chatId);
      (document.getElementById('quick-input') ?? inputRef.current)?.focus();
      return;
    }
    const meeting = perceptionRef.current.status?.session;
    const agent = circleTarget.current.agent;
    const sameMeeting = meeting?.state === 'running' && meeting.provider === agent?.provider && meeting.sessionId === agent?.sessionId;
    const live = sameMeeting ? await perceptionRef.current.api?.context(30_000).catch(() => '') : '';
    if (!chatId || circleTarget.current.chatId !== chatId) return;
    const question = live ? `${prompt}\n\n[Recent context from this chat's meeting]\n${live}` : prompt;
    const ask = () => {
      if (circleTarget.current.chatId !== chatId) return;
      if (tutorCaptureId) return circleTarget.current.tutor.start(question, undefined, tutorCaptureId, chatId);
      return conversationRef.current.send(question, 'circle', { image: { path: imagePath, thumbnail } });
    };
    if (conversationRef.current.isTyping) { conversationRef.current.stop(); setTimeout(() => void ask(), 300); }
    else void ask();
  }), []);


  // Switching the selected chat leaves each originating run intact.
  useEffect(() => window.pip?.chatsMcp?.onOpenChat(req => {
    void conversationRef.current.openSession({ provider: req.provider, id: req.sessionId, title: req.title, cwd: req.cwd, updatedAt: Date.now() });
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
  // Header padding is 8px above and 12px below. Content grows down from the pill.
  let collapsedHeight = Math.max(COLLAPSED.baseHeight, collapsedBodyHeight + 20);
  // Portals still live inside the native window; make room for the agent picker.
  if (showModelSelector) collapsedHeight = Math.max(collapsedHeight, 440);
  if (showSettings) collapsedHeight = Math.max(collapsedHeight, 600);

  const sidebarWidth = state.collapsed ? 0 : sidebarCollapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;
  const contentWidth = Math.min(
    manualSize ? manualSize.width - padding * 2 : state.collapsed ? COLLAPSED.widthBySize[state.size] ?? 360 : sizePx[state.size].w + sidebarWidth,
    MAX_CONTENT.width - padding * 2,
  );
  const contentHeight = manualSize ? manualSize.height - padding * 2 : Math.min(state.collapsed ? collapsedHeight : sizePx[state.size].h, MAX_CONTENT.height - padding * 2);

  // The expanded sidebar doesn't fit next to the largest chat area
  useEffect(() => {
    if (!state.collapsed && (sizePx[state.size].w + SIDEBAR_WIDTH.expanded > MAX_CONTENT.width - padding * 2 || (manualSize && manualSize.width < SIDEBAR_WIDTH.expanded + 280))) {
      setSidebarCollapsed(true);
    }
  }, [state.size, state.collapsed, padding, manualSize?.width]);

  useWindowSizing(contentWidth + padding * 2, contentHeight + padding * 2, state.collapsed, setIsResizing);

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
      style={{ width: '100vw', height: '100vh', padding, boxSizing: 'border-box', zIndex: 50 }}
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
        style={{ width: '100%', height: '100%' }}
      >
        <FlowField state={backdropState} />
        <PendingDecisionOverlay excludeChatId={sessionKey}/>
        {/* Orbit Mary's panel glow: while the agent works and while you type */}
        <WindowGlow agentWorking={isTyping || externalWorking} userTyping={!!(state.collapsed ? quickInput : input).trim()} />

        {!state.collapsed && (
          <div className={cn('chat-sidebar', sidebarCollapsed && 'collapsed')}>
            <ChatSidebar
              homeCwd={conversation.homeCwd}
              runningChatId={runningChatId ?? (externalWorking ? activeChat?.id : null)}
              workingStatus={runningChatId ? workingStatus : externalStatus}
              onStop={conversation.canStop ? conversation.stop : undefined}
              onResume={conversation.canResume ? () => void conversation.resume() : undefined}
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
              discoveryError={external.error || selectionError}
              hasMoreSessions={external.hasMore}
              loadingSessions={external.loading}
              onLoadMoreSessions={() => void external.loadMore()}
              onOpenAgentSession={session => void conversation.openSession(session).then(external.refresh)}
            />
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0 min-w-0 chat-main-area">
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
                readerChatId={activeChat?.id}
                onOpenAgent={async row => {
                  const sessionId = row.sessionId ?? row.id.replace(/^(codex|claude):/, '');
                  const saved = chats.chats.find(c => c.agent?.provider === row.provider && (c.agent.sessionId === sessionId || c.agent.originalSessionId === sessionId));
                  if (saved) selectChat(saved.id);
                  else await conversation.openSession({ id: sessionId, provider: row.provider, title: row.title, createdAt: row.createdAt, updatedAt: row.updatedAt });
                }}
                decisionControls={pendingDecisions.length ? decisionCards : undefined}
                decisions={decisions.rows}
                onAnswerDecision={decisions.answer}
                platform={platform}
                theme={theme}
                key={activeChat?.id ?? 'empty'}
                chatTitle={activeChat?.title}
                workingStatus={conversation.inputStatus || liveStudy?.activity || (activeIsWorking ? workingStatus : meetingWorking ? (meetingTurn?.text ? 'Writing meeting notes…' : 'Working on meeting notes…') : externalWorking ? externalStatus : workingStatus)}
                stopDisabledReason={externalWorking && !meetingWorking && !conversation.canStop ? `Live in ${externalApp} · Stop there` : undefined}
                sendFailure={activeChat?.sendFailure?.message || screenNotice}
                onHeightChange={setCollapsedBodyHeight}
                heightConstrained={!!manualSize}
                isTyping={activeIsWorking || externalWorking || meetingWorking}
                messages={messages}
                quickInput={quickInput}
                setQuickInput={setQuickInput}
                onSend={(text, _quick, mode) => handleSend(text, true, mode)}
                onResume={conversation.canResume ? () => void conversation.resume() : undefined}
                onStop={activeIsWorking || !meetingWorking ? conversation.stop : () => void perception.api?.stopTurn()}
                onCollapseToggle={toggleCollapse}
                onSizeChange={win.handleSizeChange}
                onHide={win.handleHide}
                onCopyMessage={messageHandlers.onCopy}
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
                currentResponse={currentResponse || liveStudy?.text || (externalWorking && lastMessage?.role === 'assistant' ? lastMessage.content : '') || meetingTurn?.text}
                currentQuestion={liveStudy?.question}
                liveResponseId={liveStudy?.id}
                responseSegments={currentResponse ? streamingSegments : undefined}
                meetingControls={<MessageQueueStack chatId={activeChat?.agent?.sessionId ? `${activeChat.agent.provider}:${activeChat.agent.sessionId}` : undefined} />}
                drawingControls={<><CircleSelectionControls /><VisualTutorControls compact tutor={tutor} disabled={!activeChat || activeIsWorking || externalWorking} /></>}
                screenAutoAttach={screenAutoAttach}
                onScreenAutoAttachToggle={() => setScreenAutoAttach(value => !value)}
                onClipboardAutoAttachToggle={() => context.setContextToggleEnabled(!context.contextToggleEnabled)}
                menuControls={<PerceptionBar perception={perception} chat={activeChat} onOpenSession={openMeetingChat} />}
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
          <ExpandedChatSurface
            key={activeChat?.id ?? 'empty'}
            collapsed={state.collapsed}
            transcript={<>
                {/* Transcript (AI Elements): sticks to the bottom while the agent streams */}
                <ContextCards perception={perception} chat={activeChat} />
                <Conversation className="flex-1 select-text">
                  <ConversationContent className={cn('px-3 py-3', { compact: 'gap-3', normal: 'gap-5', comfortable: 'gap-7' }[appSettings.ui.messageSpacing])}>
                    {timeline.length === 0 && !activeIsWorking && !pendingDecisions.length ? (
                      <ConversationEmptyState
                        title={conversation.providerLabel}
                        description="Ask anything, or circle something on screen."
                        className="[&_h3]:font-tanker [&_h3]:text-2xl [&_h3]:tracking-wide"
                      />
                    ) : (
                      timeline.map(row => {
                        if (row.kind === 'interaction') return <ChatInteractionCard key={`decision-${row.request.id}`} request={row.request} onAnswer={decisions.answer} />;
                        const message = row.message;
                        return (
                        <div key={message.id} data-ally-reply-reader={message.role === 'assistant' && message.id === messages.at(-1)?.id ? 'true' : undefined}><ChatMessage
                          message={message}
                          onAnswerRequest={decisions.answer}
                          sessionWorking={externalWorking && message.id === messages.at(-1)?.id}
                          onEdit={messageHandlers.onEdit}
                          onFork={messageHandlers.onFork}
                          onDelete={messageHandlers.onDelete}
                          onRetry={messageHandlers.onRecompute}
                        /></div>
                        );
                      })
                    )}
                    {activeIsWorking && (
                      <Message from="assistant">
                        <MessageContent>
                          <AgentReply text={currentResponse} thinking={thinkingText} segments={streamingSegments} streaming requests={pendingDecisions} onAnswerRequest={decisions.answer}/>
                        </MessageContent>
                      </Message>
                    )}

                  </ConversationContent>
                  <ConversationScrollButton />
                </Conversation>
            </>}
          >

                {activeChat?.sendFailure && <div role="alert" className="border-t border-border px-3 py-2 text-xs text-amber-200">
                  <p>{activeChat.sendFailure.message}</p>
                  <div className="mt-1 flex gap-3">
                    {!input.trim() && <button type="button" className="underline" onClick={() => setInput(activeChat.sendFailure!.text)}>Restore message</button>}
                    <button type="button" className="underline" onClick={() => chats.setSendFailure(activeChat.id)}>Dismiss</button>
                  </div>
                </div>}
                <CircleSelectionControls />
                <VisualTutorControls tutor={tutor} disabled={!activeChat || activeIsWorking || externalWorking} />
                <PerceptionBar perception={perception} chat={activeChat} onOpenSession={openMeetingChat} />
                <MessageQueueStack chatId={activeChat?.agent?.sessionId ? `${activeChat.agent.provider}:${activeChat.agent.sessionId}` : undefined} />
                {screenNotice && <div role="status" className="border-t border-border px-3 py-2 text-xs text-foreground/80">{screenNotice}</div>}
                <ChatInput
                  accountControls={conversation.provider === 'codex' && <CodexAccountControl key={activeChat?.id}
                  accountId={activeChat?.agent?.codexAccountId} hasSession={!!activeChat?.agent?.sessionId}
                  disabled={activeIsWorking || externalWorking}
                  onChoose={id => {
                    if (activeIsWorking || externalWorking) return;
                    const target = activeChat?.agent?.sessionId ? chats.create() : activeChat ?? chats.create();
                    chats.setAgent(target.id, { provider: 'codex', codexAccountId: id, cwd: conversation.cwd });
                    if (activeChat?.agent?.sessionId) chats.rename(target.id, `Handoff from ${activeChat.title}`);
                  }} />}
                  ref={inputRef}
                  input={input}
                  setInput={setInput}
                  onSend={(mode) => handleSend(undefined, false, mode)}
                  isTyping={isTyping || externalWorking}
                  workingStatus={conversation.inputStatus || (externalWorking ? externalStatus : activeIsWorking ? workingStatus : `${workingStatus} · ${runningChatTitle}`)}
                  stopDisabledReason={externalWorking && !conversation.canStop ? `Running in the ${externalApp} app. Stop it there.` : undefined}
                  onStop={conversation.stop}
                  onResume={conversation.canResume ? () => void conversation.resume() : undefined}
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
          </ExpandedChatSurface>
        </div>
      </motion.div>

      <ClaudeLoginDialog />
      <HandoffHalo />
      <PerceptionDebug open={perceptionDebug} onOpenChange={setPerceptionDebug} perception={perception} />

      <SettingsModal
        onMeetingSettings={() => { setShowSettings(false); setPerceptionDebug(true); }}
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
