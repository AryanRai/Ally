import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CornerDownLeft, 
  Minus, 
  X, 
  Maximize2, 
  MessageSquare,
  Settings,
  Grip,
  Clipboard,
  MousePointer,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '../lib/utils';
import SettingsModal from './SettingsModal';

type Size = 'S' | 'M' | 'L';
const sizePx: Record<Size, { w: number; h: number }> = {
  S: { w: 320, h: 420 },
  M: { w: 400, h: 560 },
  L: { w: 520, h: 680 },
};

const STORAGE_KEY = 'glass_pip_state';

interface PiPState {
  x: number;
  y: number;
  size: Size;
  collapsed: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ContextData {
  clipboard: string;
  selectedText: string;
  lastUpdate: number;
}

export default function GlassChatPiP() {
  const [state, setState] = useState<PiPState>({
    x: 24,
    y: 24,
    size: 'M',
    collapsed: false
  });
  
  const [platform, setPlatform] = useState<string>('');
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I'm your glass PiP chat assistant. How can I help you today?",
      timestamp: Date.now()
    }
  ]);
  
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  // Context monitoring state
  const [contextData, setContextData] = useState<ContextData>({
    clipboard: '',
    selectedText: '',
    lastUpdate: 0
  });
  const [showContext, setShowContext] = useState(true);
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  // Theme and settings state
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [showSettings, setShowSettings] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load saved state
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setState(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error('Failed to parse saved state:', e);
      }
    }
  }, []);

  // Save state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Sync window size when size state changes
  useEffect(() => {
    if (!window.pip) {
      console.warn('window.pip not available');
      return;
    }
    
    setIsResizing(true);
    const dims = sizePx[state.size];
    const height = state.collapsed ? 64 : dims.h;
    
    console.log('Resizing window to:', dims.w, 'x', height, 'collapsed:', state.collapsed);
    
    // Use a small delay to ensure state has settled
    const resizeTimeout = setTimeout(() => {
      try {
        window.pip.resizeWindow(dims.w, height);
      } catch (error) {
        console.error('Failed to resize window:', error);
      }
    }, 50);
    
    // Reset resizing state after animation
    const resetTimeout = setTimeout(() => setIsResizing(false), 400);
    
    return () => {
      clearTimeout(resizeTimeout);
      clearTimeout(resetTimeout);
    };
  }, [state.size, state.collapsed]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on custom event
  useEffect(() => {
    const handleFocusInput = () => {
      inputRef.current?.focus();
    };
    window.addEventListener('focus-chat-input', handleFocusInput);
    return () => window.removeEventListener('focus-chat-input', handleFocusInput);
  }, []);

  // Test window.pip API availability and listen for resize completion
  useEffect(() => {
    console.log('window.pip available:', !!window.pip);
    if (window.pip) {
      console.log('window.pip methods:', Object.keys(window.pip));
      
      // Get platform info
      window.pip.getPlatform().then(setPlatform).catch(console.error);
      
      // Get initial theme
      window.pip.getTheme().then(setTheme).catch(console.error);
      
      // Listen for resize completion
      const cleanupResize = window.pip.onResizeComplete?.((size) => {
        console.log('Window resize completed:', size);
        setIsResizing(false);
      });
      
      // Listen for theme changes
      const cleanupTheme = window.pip.onThemeChanged?.((newTheme) => {
        setTheme(newTheme);
      });
      
      return () => {
        cleanupResize?.();
        cleanupTheme?.();
      };
    }
  }, []);

  // Context monitoring setup
  useEffect(() => {
    if (!window.pip) return;

    // Start monitoring when component mounts
    window.pip.startContextMonitoring();
    setIsMonitoring(true);

    // Listen for clipboard changes
    const cleanupClipboard = window.pip.onClipboardChanged((data) => {
      setContextData(prev => ({
        ...prev,
        clipboard: data.text,
        lastUpdate: data.timestamp
      }));
    });

    // Initial context load
    const loadInitialContext = async () => {
      try {
        const [clipboard, selectedText] = await Promise.all([
          window.pip.getClipboard(),
          window.pip.getSelectedText()
        ]);
        
        setContextData({
          clipboard,
          selectedText,
          lastUpdate: Date.now()
        });
      } catch (error) {
        console.error('Failed to load initial context:', error);
      }
    };

    loadInitialContext();

    // Cleanup
    return () => {
      cleanupClipboard();
      window.pip.stopContextMonitoring();
      setIsMonitoring(false);
    };
  }, []);

  // Native Electron dragging handles everything via -webkit-app-region CSS



  const handleSizeChange = () => {
    const nextSize: Size = state.size === 'S' ? 'M' : state.size === 'M' ? 'L' : 'S';
    setState(prev => ({ ...prev, size: nextSize }));
  };

  const handleCollapseToggle = () => {
    const newCollapsed = !state.collapsed;
    console.log('Toggling collapse from', state.collapsed, 'to', newCollapsed);
    
    // Update state - the useEffect will handle the window resize
    setState(prev => ({ ...prev, collapsed: newCollapsed }));
  };

  const handleSend = () => {
    if (!input.trim()) return;
    
    // Build message content with context if available
    let messageContent = input.trim();
    
    if (contextData.clipboard || contextData.selectedText) {
      const contextParts = [];
      if (contextData.clipboard) {
        contextParts.push(`Clipboard: "${contextData.clipboard}"`);
      }
      if (contextData.selectedText && contextData.selectedText !== contextData.clipboard) {
        contextParts.push(`Selected: "${contextData.selectedText}"`);
      }
      
      if (contextParts.length > 0) {
        messageContent = `${messageContent}\n\n[Context: ${contextParts.join(', ')}]`;
      }
    }
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);
    
    // Simulate response (replace with actual Ollama integration later)
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I can see your context! This will be powered by Ollama soon.",
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1000);
  };

  const dims = sizePx[state.size];

  return (
    <motion.div
      ref={containerRef}
      className={cn(
        "fixed transition-all duration-300 select-none",
        isResizing && "shadow-lg"
      )}
      style={{ 
        width: dims.w, 
        height: state.collapsed ? 64 : dims.h,
        zIndex: 50
      } as React.CSSProperties}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ 
        opacity: 1, 
        scale: isResizing ? 1.02 : 1 
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
    >
      <motion.div
        layout
        className={cn(
          "h-full w-full overflow-hidden relative",
          // Enhanced rounded corners for Windows
          platform === 'win32' ? "rounded-3xl" : "rounded-2xl",
          "border",
          theme === 'dark' ? "border-white/20" : "border-black/20",
          "shadow-[0_8px_40px_rgba(0,0,0,0.4)]",
          // Theme-aware background styles
          platform === 'win32' 
            ? theme === 'dark'
              ? "bg-gradient-to-b from-white/[0.03] to-white/[0.01]" 
              : "bg-gradient-to-b from-black/[0.03] to-black/[0.01]"
            : theme === 'dark'
              ? "bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-2xl backdrop-saturate-150"
              : "bg-gradient-to-b from-black/[0.08] to-black/[0.02] backdrop-blur-2xl backdrop-saturate-150",
          theme === 'dark' 
            ? "[background-image:radial-gradient(ellipse_at_top,rgba(255,255,255,0.1),transparent)] text-white/90"
            : "[background-image:radial-gradient(ellipse_at_top,rgba(0,0,0,0.1),transparent)] text-black/90"
        )}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header - Draggable Area */}
        <div 
          className={cn(
            "flex items-center gap-2 px-3 py-2 border-b transition-all duration-200",
            "cursor-grab active:cursor-grabbing",
            "relative z-10 min-h-[44px]",
            theme === 'dark' 
              ? "border-white/10 hover:bg-white/5 hover:border-blue-500/30"
              : "border-black/10 hover:bg-black/5 hover:border-blue-500/30"
          )}
          style={{ 
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
            userSelect: 'none'
          } as React.CSSProperties}
          title="Drag to move window"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Grip className="w-3 h-3 opacity-50 flex-shrink-0" />
            <MessageSquare className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-medium truncate">Chat</span>
            {state.collapsed && (contextData.clipboard || contextData.selectedText) && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 rounded-full flex-shrink-0">
                <Clipboard className="w-2.5 h-2.5" />
                <span className="text-xs">Context</span>
              </div>
            )}
          </div>
          {isResizing && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="px-2 py-0.5 bg-green-500/20 rounded-full text-xs flex-shrink-0"
            >
              Resizing to {state.size}
            </motion.div>
          )}
          
          <div 
            className="flex items-center gap-1 flex-shrink-0" 
            style={{ 
              WebkitAppRegion: 'no-drag',
              WebkitUserSelect: 'none',
              userSelect: 'none'
            } as React.CSSProperties}
          >
            {!state.collapsed && (
              <>
                <button
                  onClick={() => setShowContext(!showContext)}
                  className={cn(
                    "p-1.5 rounded-lg hover:bg-white/10 transition-colors",
                    showContext && (contextData.clipboard || contextData.selectedText) && "bg-blue-500/20"
                  )}
                  title={showContext ? "Hide context" : "Show context"}
                >
                  {showContext ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={handleSizeChange}
                  className={cn(
                    "p-1.5 rounded-lg hover:bg-white/10 transition-all duration-200",
                    isResizing && "bg-blue-500/20 scale-110"
                  )}
                  title={`Change size (${state.size} → ${state.size === 'S' ? 'M' : state.size === 'M' ? 'L' : 'S'})`}
                  disabled={isResizing}
                >
                  <Maximize2 className={cn(
                    "w-3.5 h-3.5 transition-all duration-200",
                    isResizing && "animate-pulse"
                  )} />
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10"
                  )}
                  title="Settings"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              onClick={handleCollapseToggle}
              className={cn(
                "p-1.5 rounded-lg hover:bg-white/10 transition-all duration-200",
                isResizing && "opacity-50"
              )}
              title={state.collapsed ? "Expand" : "Collapse"}
              disabled={isResizing}
            >
              {state.collapsed ? <Maximize2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => window.pip?.hide()}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
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
              {/* Context Display */}
              <AnimatePresence>
                {showContext && (contextData.clipboard || contextData.selectedText) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className={cn(
                      "border-b p-3 space-y-2",
                      "bg-gradient-to-r from-blue-500/10 to-purple-500/10",
                      platform !== 'win32' && "backdrop-blur-sm",
                      theme === 'dark' ? "border-white/10" : "border-black/10"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Eye className="w-3 h-3 opacity-60" />
                        <span className="text-xs font-medium opacity-80">Context</span>
                        {isMonitoring && (
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        )}
                      </div>
                      <button
                        onClick={() => setShowContext(false)}
                        className={cn(
                          "p-1 rounded transition-colors",
                          theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10"
                        )}
                        title="Hide context"
                      >
                        <EyeOff className="w-3 h-3 opacity-60" />
                      </button>
                    </div>
                    
                    {contextData.clipboard && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Clipboard className="w-3 h-3 opacity-50" />
                          <span className="text-xs opacity-70">Clipboard:</span>
                        </div>
                        <div className={cn(
                          "text-xs p-2 rounded-lg max-h-16 overflow-y-auto",
                          "border scrollbar-thin",
                          theme === 'dark' 
                            ? "bg-white/5 border-white/10 scrollbar-thumb-white/10"
                            : "bg-black/5 border-black/10 scrollbar-thumb-black/10"
                        )}>
                          {contextData.clipboard.length > 100 
                            ? `${contextData.clipboard.substring(0, 100)}...` 
                            : contextData.clipboard}
                        </div>
                      </div>
                    )}
                    
                    {contextData.selectedText && contextData.selectedText !== contextData.clipboard && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <MousePointer className="w-3 h-3 opacity-50" />
                          <span className="text-xs opacity-70">Selected:</span>
                        </div>
                        <div className={cn(
                          "text-xs p-2 rounded-lg max-h-16 overflow-y-auto",
                          "border scrollbar-thin",
                          theme === 'dark' 
                            ? "bg-white/5 border-white/10 scrollbar-thumb-white/10"
                            : "bg-black/5 border-black/10 scrollbar-thumb-black/10"
                        )}>
                          {contextData.selectedText.length > 100 
                            ? `${contextData.selectedText.substring(0, 100)}...` 
                            : contextData.selectedText}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Messages */}
              <div className={cn(
                "flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin",
                theme === 'dark' ? "scrollbar-thumb-white/10" : "scrollbar-thumb-black/10"
              )}>
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      message.role === 'user' 
                        ? "ml-auto bg-blue-500/20" + (platform !== 'win32' ? " backdrop-blur-md" : "")
                        : theme === 'dark' 
                          ? "bg-white/10" + (platform !== 'win32' ? " backdrop-blur-md" : "")
                          : "bg-black/10" + (platform !== 'win32' ? " backdrop-blur-md" : "")
                    )}
                  >
                    {message.content}
                  </motion.div>
                ))}
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-1 px-3 py-2"
                  >
                    <div className={cn(
                      "w-2 h-2 rounded-full animate-bounce",
                      theme === 'dark' ? "bg-white/40" : "bg-black/40"
                    )} style={{ animationDelay: '0ms' }} />
                    <div className={cn(
                      "w-2 h-2 rounded-full animate-bounce",
                      theme === 'dark' ? "bg-white/40" : "bg-black/40"
                    )} style={{ animationDelay: '150ms' }} />
                    <div className={cn(
                      "w-2 h-2 rounded-full animate-bounce",
                      theme === 'dark' ? "bg-white/40" : "bg-black/40"
                    )} style={{ animationDelay: '300ms' }} />
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className={cn(
                "border-t p-3",
                theme === 'dark' ? "border-white/10" : "border-black/10"
              )}>
                {/* Quick context actions */}
                {(contextData.clipboard || contextData.selectedText) && (
                  <div className="flex gap-1 mb-2">
                    {contextData.clipboard && (
                      <button
                        onClick={() => setInput(`Explain this: ${contextData.clipboard}`)}
                        className={cn(
                          "px-2 py-1 text-xs rounded-lg",
                          "bg-blue-500/20 hover:bg-blue-500/30",
                          "border border-blue-500/30",
                          "transition-colors"
                        )}
                        title="Ask about clipboard content"
                      >
                        <Clipboard className="w-3 h-3 inline mr-1" />
                        Explain
                      </button>
                    )}
                    {contextData.selectedText && contextData.selectedText !== contextData.clipboard && (
                      <button
                        onClick={() => setInput(`Help with: ${contextData.selectedText}`)}
                        className={cn(
                          "px-2 py-1 text-xs rounded-lg",
                          "bg-purple-500/20 hover:bg-purple-500/30",
                          "border border-purple-500/30",
                          "transition-colors"
                        )}
                        title="Ask about selected text"
                      >
                        <MousePointer className="w-3 h-3 inline mr-1" />
                        Help
                      </button>
                    )}
                  </div>
                )}
                
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type a message..."
                    className={cn(
                      "flex-1 px-3 py-2 rounded-xl text-sm border transition-all",
                      "focus:outline-none focus:ring-2",
                      platform !== 'win32' && "backdrop-blur-md",
                      theme === 'dark' 
                        ? "bg-white/10 border-white/10 placeholder:text-white/40 focus:ring-white/20"
                        : "bg-black/10 border-black/10 placeholder:text-black/40 focus:ring-black/20"
                    )}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className={cn(
                      "p-2 rounded-xl transition-all",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      platform !== 'win32' && "backdrop-blur-md",
                      theme === 'dark' 
                        ? "bg-white/10 hover:bg-white/20"
                        : "bg-black/10 hover:bg-black/20"
                    )}
                  >
                    <CornerDownLeft className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      
      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)}
        platform={platform}
        theme={theme}
      />
    </motion.div>
  );
}