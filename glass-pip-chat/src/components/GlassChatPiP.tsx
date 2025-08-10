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
  EyeOff,
  Server,
  Monitor
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
      content: "Hello! I'm your glass PiP chat assistant. How can I help you today?\n\n💡 **Available commands:**\n• `/run <command>` - Execute local commands\n• `/run@target <command>` - Execute remote commands\n• `/cmd <command>` - Alternative command syntax\n• `/exec <command>` - Another command syntax\n\n🎯 **Local examples:**\n• `/run cursor .` - Open current directory in Cursor\n• `/run git status` - Check git status\n• `/run npm install` - Install npm packages\n\n🌐 **Remote examples:**\n• `/run@droplet ls -la` - Run on your Digital Ocean droplet\n• `/run@wsl pwd` - Run in Windows Subsystem for Linux\n• `/run@docker ps` - Run in Docker container\n• `/run@myserver uptime` - Run on custom server",
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
  const [hasNewContext, setHasNewContext] = useState(false);
  const [contextToggleEnabled, setContextToggleEnabled] = useState(true);
  
  // Theme and settings state
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [showSettings, setShowSettings] = useState(false);
  
  // Ollama state
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [showModelSelector, setShowModelSelector] = useState(false);
  
  // Server status state
  const [serverStatus, setServerStatus] = useState<any>(null);
  
  // Quick input for minimized mode
  const [quickInput, setQuickInput] = useState('');
  
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

  // Close model selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showModelSelector && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowModelSelector(false);
      }
    };

    if (showModelSelector) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModelSelector]);

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
      
      // Mark as having new context only if app is visible/focused and content changed
      if (data.text.trim() && contextToggleEnabled) {
        setHasNewContext(true);
      }
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

  // Ollama initialization
  useEffect(() => {
    if (!window.pip?.ollama) return;

    const initOllama = async () => {
      try {
        console.log('Checking Ollama availability...');
        const available = await window.pip.ollama.isAvailable();
        console.log('Ollama available:', available);
        setOllamaAvailable(available);
        
        if (available) {
          console.log('Loading Ollama models...');
          const models = await window.pip.ollama.getModels();
          console.log('Available models:', models);
          setAvailableModels(models);
          
          if (models.length > 0) {
            const defaultModel = models.find(m => m.name.includes('llama')) || models[0];
            setCurrentModel(defaultModel.name);
            console.log('Selected default model:', defaultModel.name);
          }
        } else {
          setAvailableModels([]);
          setCurrentModel('');
        }
      } catch (error) {
        console.error('Failed to initialize Ollama:', error);
        setOllamaAvailable(false);
        setAvailableModels([]);
        setCurrentModel('');
      }
    };

    initOllama();
  }, []);

  // Server status monitoring
  useEffect(() => {
    if (!window.pip?.server) return;

    const checkServerStatus = async () => {
      try {
        const status = await window.pip.server.getStatus();
        setServerStatus(status);
      } catch (error) {
        console.error('Failed to get server status:', error);
      }
    };

    checkServerStatus();
    
    // Check server status every 30 seconds
    const interval = setInterval(checkServerStatus, 30000);
    
    return () => clearInterval(interval);
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

  const handleCommandExecution = async (commandText: string, fromQuickInput?: boolean) => {
    // Parse command with potential remote execution syntax
    const commandMatch = commandText.match(/^\/(?:run|cmd|exec)(?:@(\w+))?\s+(.+)$/);
    
    if (!commandMatch) {
      return;
    }
    
    const [, target, command] = commandMatch;
    const actualCommand = command.trim();
    
    if (!actualCommand) {
      return;
    }

    // Add user message showing the command
    const displayCommand = target ? `${actualCommand} (on ${target})` : actualCommand;
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: `🔧 Execute command: \`${displayCommand}\``,
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Clear input
    if (fromQuickInput) {
      setQuickInput('');
    } else {
      setInput('');
    }
    
    setIsTyping(true);
    
    try {
      if (!window.pip?.system) {
        throw new Error('System command execution not available');
      }

      let finalCommand = actualCommand;
      
      // Handle remote execution
      if (target) {
        if (target === 'droplet' && serverStatus?.ip) {
          // Remote execution on Digital Ocean droplet
          finalCommand = `ssh root@${serverStatus.ip} "${actualCommand.replace(/"/g, '\\"')}"`;
        } else if (target === 'wsl') {
          // Windows Subsystem for Linux
          finalCommand = `wsl ${actualCommand}`;
        } else if (target === 'docker') {
          // Docker container execution
          finalCommand = `docker exec -it $(docker ps -q --filter "status=running" | head -1) ${actualCommand}`;
        } else {
          // Custom target - assume it's a hostname/IP
          finalCommand = `ssh ${target} "${actualCommand.replace(/"/g, '\\"')}"`;
        }
      }

      console.log('Executing command:', finalCommand);
      const result = await window.pip.system.executeCommand(finalCommand);
      
      let responseContent = '';
      
      if (result.success) {
        responseContent = `✅ **Command executed successfully**`;
        if (target) {
          responseContent += ` on ${target}`;
        }
        responseContent += `\n\n`;
        
        if (result.stdout && result.stdout.trim()) {
          responseContent += `**Output:**\n\`\`\`\n${result.stdout.trim()}\n\`\`\`\n\n`;
        }
        
        if (result.stderr && result.stderr.trim()) {
          responseContent += `**Warnings/Errors:**\n\`\`\`\n${result.stderr.trim()}\n\`\`\``;
        }
        
        if (!result.stdout?.trim() && !result.stderr?.trim()) {
          responseContent += `Command completed with no output.`;
        }
      } else {
        responseContent = `❌ **Command failed**`;
        if (target) {
          responseContent += ` on ${target}`;
        }
        responseContent += `\n\n`;
        responseContent += `**Error:** ${result.error}\n\n`;
        
        if (result.stderr && result.stderr.trim()) {
          responseContent += `**Details:**\n\`\`\`\n${result.stderr.trim()}\n\`\`\``;
        }
      }
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseContent,
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error executing command:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ **Command execution failed**\n\nError: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = async (messageInput?: string, fromQuickInput?: boolean) => {
    const textToSend = messageInput || input.trim();
    if (!textToSend) return;
    
    // Check if this is a command execution request
    const isCommand = textToSend.startsWith('/run ') || textToSend.startsWith('/cmd ') || textToSend.startsWith('/exec ');
    
    if (isCommand) {
      await handleCommandExecution(textToSend, fromQuickInput);
      return;
    }
    
    // Build message content with context if available
    let messageContent = textToSend;
    
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
    
    // Clear input
    if (fromQuickInput) {
      setQuickInput('');
    } else {
      setInput('');
    }
    
    setIsTyping(true);
    
    try {
      let response = '';
      
      if (ollamaAvailable && window.pip?.ollama && currentModel) {
        console.log('Sending message to Ollama with model:', currentModel);
        
        // Convert our messages to Ollama format
        const chatHistory = messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }));
        
        // Add current message
        chatHistory.push({
          role: 'user',
          content: messageContent
        });
        
        console.log('Chat history:', chatHistory);
        response = await window.pip.ollama.chat(chatHistory, currentModel);
        console.log('Ollama response:', response);
      } else {
        // Fallback response when Ollama is not available
        const reason = !ollamaAvailable 
          ? "Ollama is not running" 
          : !currentModel 
            ? "No model selected" 
            : "Ollama API not available";
            
        response = `⚠️ **Ollama Unavailable**\n\nReason: ${reason}\n\nPlease:\n1. Make sure Ollama is installed and running\n2. Check that you have models installed (\`ollama list\`)\n3. Try refreshing the connection in Settings`;
      }
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error getting Ollama response:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to get response from Ollama'}`,
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
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
          "border border-white/20",
          "shadow-[0_8px_40px_rgba(0,0,0,0.4)]",
          // Platform-specific background handling
          platform === 'win32' 
            ? "bg-transparent" // Let Windows acrylic handle the background
            : theme === 'dark'
              ? "bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-2xl backdrop-saturate-150"
              : "bg-gradient-to-b from-black/[0.08] to-black/[0.02] backdrop-blur-2xl backdrop-saturate-150",
          // Text color based on theme
          theme === 'dark' ? "text-white/90" : "text-black/90"
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
            // Windows: minimal styling to let acrylic show through
            platform === 'win32'
              ? "border-white/10 hover:bg-white/5 hover:border-blue-500/30"
              : theme === 'dark' 
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
            
            {state.collapsed ? (
              /* Quick input for minimized mode */
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend(quickInput, true);
                }}
                className="flex items-center gap-2 flex-1 min-w-0"
                style={{ 
                  WebkitAppRegion: 'no-drag',
                  WebkitUserSelect: 'none',
                  userSelect: 'none'
                } as React.CSSProperties}
              >
                <input
                  type="text"
                  value={quickInput}
                  onChange={(e) => setQuickInput(e.target.value)}
                  placeholder="Quick message..."
                  className={cn(
                    "flex-1 px-2 py-1 text-xs rounded border transition-all min-w-0",
                    "focus:outline-none focus:ring-1",
                    platform !== 'win32' && "backdrop-blur-md",
                    platform === 'win32'
                      ? "bg-white/10 border-white/10 placeholder:text-white/40 focus:ring-white/20"
                      : theme === 'dark' 
                        ? "bg-white/10 border-white/10 placeholder:text-white/40 focus:ring-white/20"
                        : "bg-black/10 border-black/10 placeholder:text-black/40 focus:ring-black/20"
                  )}
                />
                <button
                  type="submit"
                  disabled={!quickInput.trim()}
                  className={cn(
                    "p-1 rounded transition-all flex-shrink-0",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    platform !== 'win32' && "backdrop-blur-md",
                    platform === 'win32'
                      ? "bg-white/10 hover:bg-white/20"
                      : theme === 'dark' 
                        ? "bg-white/10 hover:bg-white/20"
                        : "bg-black/10 hover:bg-black/20"
                  )}
                >
                  <CornerDownLeft className="w-3 h-3" />
                </button>
              </form>
            ) : (
              <span className="text-sm font-medium truncate">Chat</span>
            )}
            
            {/* Status indicators */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Ollama status */}
              <div 
                className={cn(
                  "w-2 h-2 rounded-full",
                  ollamaAvailable ? "bg-green-400" : "bg-red-400"
                )}
                title={ollamaAvailable ? "Ollama connected" : "Ollama offline"}
              />
              
              {/* Server status */}
              {serverStatus && (
                <div 
                  className={cn(
                    "w-2 h-2 rounded-full",
                    serverStatus.status === 'online' ? "bg-green-400" : 
                    serverStatus.status === 'offline' ? "bg-red-400" : "bg-yellow-400"
                  )}
                  title={`Server ${serverStatus.status}: ${serverStatus.domain || serverStatus.ip}`}
                />
              )}
            </div>
            
            {state.collapsed && hasNewContext && (contextData.clipboard || contextData.selectedText) && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 rounded-full flex-shrink-0">
                <Clipboard className="w-2.5 h-2.5" />
                <span className="text-xs">New</span>
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
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
                  {/* Model Selector */}
                  {ollamaAvailable && availableModels.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setShowModelSelector(!showModelSelector)}
                        className={cn(
                          "p-1.5 rounded-lg hover:bg-white/10 transition-colors",
                          showModelSelector && "bg-blue-500/20"
                        )}
                        title={`Current model: ${currentModel}`}
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                      
                      {/* Model dropdown */}
                      {showModelSelector && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -10 }}
                          className={cn(
                            "absolute top-full right-0 mt-2 w-48 z-50",
                            "rounded-lg border shadow-lg overflow-hidden",
                            platform === 'win32'
                              ? "bg-black/90 border-white/20"
                              : theme === 'dark' 
                                ? "bg-gray-900/95 border-white/20 backdrop-blur-lg"
                                : "bg-gray-100/95 border-black/20 backdrop-blur-lg"
                          )}
                        >
                          <div className="p-2">
                            <div className={cn(
                              "text-xs font-medium mb-2 px-2",
                              platform === 'win32'
                                ? "text-white/80"
                                : theme === 'dark' ? "text-white/80" : "text-black/80"
                            )}>
                              Select Model
                            </div>
                            {availableModels.map((model) => (
                              <button
                                key={model.name}
                                onClick={() => {
                                  setCurrentModel(model.name);
                                  setShowModelSelector(false);
                                }}
                                className={cn(
                                  "w-full text-left px-2 py-1.5 text-xs rounded transition-colors",
                                  currentModel === model.name
                                    ? "bg-blue-500/20 text-blue-300"
                                    : platform === 'win32'
                                      ? "hover:bg-white/10 text-white/80"
                                      : theme === 'dark' 
                                        ? "hover:bg-white/10 text-white/80"
                                        : "hover:bg-black/10 text-black/80"
                                )}
                              >
                                <div className="font-medium">{model.name}</div>
                                <div className={cn(
                                  "text-xs opacity-60",
                                  platform === 'win32'
                                    ? "text-white/60"
                                    : theme === 'dark' ? "text-white/60" : "text-black/60"
                                )}>
                                  {(model.size / (1024 * 1024 * 1024)).toFixed(1)}GB
                                </div>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}
                  
                  <button
                    onClick={() => setShowContext(!showContext)}
                    className={cn(
                      "p-1.5 rounded-lg hover:bg-white/10 transition-colors relative",
                      showContext && hasNewContext && (contextData.clipboard || contextData.selectedText) && "bg-blue-500/20"
                    )}
                    title={showContext ? "Hide context" : "Show context"}
                  >
                    {showContext ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {/* Notification dot for new context */}
                    {!showContext && hasNewContext && (contextData.clipboard || contextData.selectedText) && (
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                    )}
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
                {showContext && contextToggleEnabled && hasNewContext && (contextData.clipboard || contextData.selectedText) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className={cn(
                      "border-b p-3 space-y-2",
                      platform === 'win32'
                        ? "bg-blue-500/5 border-white/10" // Minimal overlay on Windows
                        : "bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-sm",
                      platform !== 'win32' && (theme === 'dark' ? "border-white/10" : "border-black/10")
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Eye className="w-3 h-3 opacity-60" />
                        <span className="text-xs font-medium opacity-80">New Context</span>
                        {isMonitoring && (
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setHasNewContext(false)}
                          className={cn(
                            "p-1 rounded transition-colors",
                            theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10"
                          )}
                          title="Dismiss context"
                        >
                          <X className="w-3 h-3 opacity-60" />
                        </button>
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
                          platform === 'win32'
                            ? "bg-white/5 border-white/10 scrollbar-thumb-white/10"
                            : theme === 'dark' 
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
                          platform === 'win32'
                            ? "bg-white/5 border-white/10 scrollbar-thumb-white/10"
                            : theme === 'dark' 
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
                platform === 'win32'
                  ? "scrollbar-thumb-white/10"
                  : theme === 'dark' ? "scrollbar-thumb-white/10" : "scrollbar-thumb-black/10"
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
                        : platform === 'win32'
                          ? "bg-white/10" // Consistent on Windows
                          : theme === 'dark' 
                            ? "bg-white/10 backdrop-blur-md"
                            : "bg-black/10 backdrop-blur-md"
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
                      platform === 'win32' 
                        ? "bg-white/40"
                        : theme === 'dark' ? "bg-white/40" : "bg-black/40"
                    )} style={{ animationDelay: '0ms' }} />
                    <div className={cn(
                      "w-2 h-2 rounded-full animate-bounce",
                      platform === 'win32' 
                        ? "bg-white/40"
                        : theme === 'dark' ? "bg-white/40" : "bg-black/40"
                    )} style={{ animationDelay: '150ms' }} />
                    <div className={cn(
                      "w-2 h-2 rounded-full animate-bounce",
                      platform === 'win32' 
                        ? "bg-white/40"
                        : theme === 'dark' ? "bg-white/40" : "bg-black/40"
                    )} style={{ animationDelay: '300ms' }} />
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className={cn(
                "border-t p-3",
                platform === 'win32'
                  ? "border-white/10"
                  : theme === 'dark' ? "border-white/10" : "border-black/10"
              )}>
                {/* Quick context actions */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {/* Context actions */}
                  {contextData.clipboard && (
                    <button
                      onClick={() => {
                        setInput(`Explain this: ${contextData.clipboard}`);
                        setHasNewContext(false); // Clear new context flag when used
                      }}
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
                      onClick={() => {
                        setInput(`Help with: ${contextData.selectedText}`);
                        setHasNewContext(false); // Clear new context flag when used
                      }}
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
                  
                  {/* Command shortcuts */}
                  <button
                    onClick={() => setInput('/run ')}
                    className={cn(
                      "px-2 py-1 text-xs rounded-lg",
                      "bg-green-500/20 hover:bg-green-500/30",
                      "border border-green-500/30",
                      "transition-colors"
                    )}
                    title="Run a system command"
                  >
                    <CornerDownLeft className="w-3 h-3 inline mr-1" />
                    Run
                  </button>
                  
                  <button
                    onClick={() => setInput('/run cursor .')}
                    className={cn(
                      "px-2 py-1 text-xs rounded-lg",
                      "bg-orange-500/20 hover:bg-orange-500/30",
                      "border border-orange-500/30",
                      "transition-colors"
                    )}
                    title="Open current directory in Cursor"
                  >
                    <Settings className="w-3 h-3 inline mr-1" />
                    Cursor
                  </button>
                  
                  {serverStatus?.ip && (
                    <button
                      onClick={() => setInput(`/run@droplet `)}
                      className={cn(
                        "px-2 py-1 text-xs rounded-lg",
                        "bg-blue-500/20 hover:bg-blue-500/30",
                        "border border-blue-500/30",
                        "transition-colors"
                      )}
                      title={`Run command on droplet (${serverStatus.ip})`}
                    >
                      <Server className="w-3 h-3 inline mr-1" />
                      Droplet
                    </button>
                  )}
                  
                  <button
                    onClick={() => setInput('/run@wsl ')}
                    className={cn(
                      "px-2 py-1 text-xs rounded-lg",
                      "bg-purple-500/20 hover:bg-purple-500/30",
                      "border border-purple-500/30",
                      "transition-colors"
                    )}
                    title="Run command in Windows Subsystem for Linux"
                  >
                    <Monitor className="w-3 h-3 inline mr-1" />
                    WSL
                  </button>
                </div>
                
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
                      platform === 'win32'
                        ? "bg-white/10 border-white/10 placeholder:text-white/40 focus:ring-white/20"
                        : theme === 'dark' 
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
                      platform === 'win32'
                        ? "bg-white/10 hover:bg-white/20"
                        : theme === 'dark' 
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
        contextToggleEnabled={contextToggleEnabled}
        onContextToggleChange={setContextToggleEnabled}
      />
    </motion.div>
  );
}