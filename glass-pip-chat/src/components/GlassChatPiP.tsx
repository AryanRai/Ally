import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  Monitor,
  ChevronDown,
  ChevronUp,
  Square,
  Copy,
  Check,
  Edit,
  Play
} from 'lucide-react';
import { cn } from '../lib/utils';
import SettingsModal from './SettingsModal';
import { RemoteMonitoringService } from '../services/remoteMonitoringService';

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

interface Chat {
  id: string;
  name: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
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
  
  const [chats, setChats] = useState<Chat[]>([
    {
      id: '1',
      name: 'Main Chat',
      messages: [
        {
          id: '1',
          role: 'assistant',
          content: "Hello! I'm your glass PiP chat assistant. How can I help you today?\n\n💡 **Available commands:**\n• `/run <command>` - Execute local commands\n• `/run@target <command>` - Execute remote commands\n• `/cmd <command>` - Alternative command syntax\n• `/exec <command>` - Another command syntax\n\n🎯 **Local examples:**\n• `/run git status` - Check git status\n• `/run npm install` - Install npm packages\n• `/run code .` - Open current directory in VS Code\n\n🌐 **Remote examples:**\n• `/run@docker ps` - Run in Docker container\n• `/run@myserver uptime` - Run on custom server\n• `/run@ssh-host ls -la` - Run on SSH server",
          timestamp: Date.now()
        }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: true
    }
  ]);
  
  const [activeChatId, setActiveChatId] = useState<string>('1');
  
  // Get current active chat
  const activeChat = chats.find(chat => chat.id === activeChatId) || chats[0];
  const messages = activeChat?.messages || [];
  
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [streamingResponse, setStreamingResponse] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState('');
  
  // Add new state for collapsed chat improvements
  const [lastAssistantMessage, setLastAssistantMessage] = useState<string>('');
  
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
  const [includeContextInMessage, setIncludeContextInMessage] = useState(false);
  const [recentlySelected, setRecentlySelected] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(true);
  const [showContextPreview, setShowContextPreview] = useState(false);
  
  // Theme and settings state
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [showSettings, setShowSettings] = useState(false);
  
  // Ollama state
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showChatSelector, setShowChatSelector] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  
  // Remote monitoring
  const [remoteMonitoring] = useState(() => new RemoteMonitoringService());
  const [isRemoteRegistered, setIsRemoteRegistered] = useState(false);
  
  // Server status state
  const [serverStatus, setServerStatus] = useState<any>(null);
  
  // Quick input for minimized mode
  const [quickInput, setQuickInput] = useState('');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
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
    const height = state.collapsed ? 120 : dims.h; // Match the UI height for collapsed state
    
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

  // Track last assistant message for preview and update remote monitoring
  useEffect(() => {
    const lastAssistant = messages.filter(m => m.role === 'assistant').slice(-1)[0];
    if (lastAssistant) {
      setLastAssistantMessage(lastAssistant.content);
    }

    // Update remote monitoring with current messages (disabled for now)
    // if (isRemoteRegistered) {
    //   remoteMonitoring.updateStatus({
    //     messages: messages.slice(-10), // Send last 10 messages
    //     currentModel: currentModel
    //   });
    // }
  }, [messages, currentModel]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Manual scroll to bottom function
  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Focus input on custom event
  useEffect(() => {
    const handleFocusInput = () => {
      inputRef.current?.focus();
    };
    window.addEventListener('focus-chat-input', handleFocusInput);
    return () => window.removeEventListener('focus-chat-input', handleFocusInput);
  }, []);

  // Handle escape key to hide window instead of destroying it
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        window.pip?.hide();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close model selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showModelSelector && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowModelSelector(false);
      }
      if (showChatSelector && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowChatSelector(false);
      }
    };

    if (showModelSelector || showChatSelector) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModelSelector, showChatSelector]);

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
        // Reset recently selected flag since this is just clipboard change
        setRecentlySelected(false);
      }
    });

    // Listen for selected text changes
    const cleanupSelection = window.pip.onSelectionChanged?.((data) => {
      setContextData(prev => ({
        ...prev,
        selectedText: data.text,
        lastUpdate: data.timestamp
      }));
      
      // Mark as recently selected when text is actively selected
      if (data.text.trim()) {
        setRecentlySelected(true);
        setHasNewContext(true);
        
        // Clear recently selected flag after 30 seconds
        setTimeout(() => {
          setRecentlySelected(false);
        }, 30000);
      }
    }) || (() => {});

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
      cleanupSelection();
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

  // Initialize remote monitoring (disabled for now)
  // useEffect(() => {
  //   const initRemoteMonitoring = async () => {
  //     try {
  //       const result = await remoteMonitoring.register();
  //       if (result) {
  //         setIsRemoteRegistered(true);
  //         console.log('Remote monitoring enabled');
  //       }
  //     } catch (error) {
  //       console.error('Failed to initialize remote monitoring:', error);
  //     }
  //   };

  //   initRemoteMonitoring();

  //   // Cleanup on unmount
  //   return () => {
  //     remoteMonitoring.unregister();
  //   };
  // }, [remoteMonitoring]);

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

  // Function definitions (moved before useEffects to avoid reference errors)
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

  const handleStop = () => {
    setIsTyping(false);
    setStreamingResponse('');
    // TODO: Add actual API cancellation logic here when implemented
  };

  // Listen for focus and shortcut events from global shortcuts (moved after function definitions)
  useEffect(() => {
    const handleFocusMainInput = () => {
      // Focus the main input in expanded mode
      if (inputRef.current) {
        inputRef.current.focus();
      }
    };

    const handleFocusQuickInput = () => {
      // Focus the quick input in collapsed mode
      const quickInputElement = document.querySelector('input[placeholder="Type your message..."]') as HTMLInputElement;
      if (quickInputElement) {
        quickInputElement.focus();
      }
    };

    const handleShowCollapsedAndFocusQuick = () => {
      // First, ensure we're in collapsed mode
      setState(prev => ({ ...prev, collapsed: true }));
      
      // Then focus the quick input after a brief delay to ensure UI has updated
      setTimeout(() => {
        const quickInputElement = document.querySelector('input[placeholder="Type your message..."]') as HTMLInputElement;
        if (quickInputElement) {
          quickInputElement.focus();
        }
      }, 100);
    };

    const handleToggleCollapse = () => {
      // Toggle between collapsed and expanded
      setState(prev => ({ ...prev, collapsed: !prev.collapsed }));
      
      // Focus appropriate input after state change
      setTimeout(() => {
        if (state.collapsed) {
          // If expanding, focus main input
          if (inputRef.current) {
            inputRef.current.focus();
          }
        } else {
          // If collapsing, focus quick input
          const quickInputElement = document.querySelector('input[placeholder="Type your message..."]') as HTMLInputElement;
          if (quickInputElement) {
            quickInputElement.focus();
          }
        }
      }, 100);
    };

    const handleCycleSize = () => {
      // Cycle through sizes S -> M -> L -> S
      handleSizeChange();
    };

    const handleToggleContext = () => {
      // Toggle context monitoring
      setContextToggleEnabled(prev => !prev);
      
      // Visual feedback - could add a toast notification here
      console.log('Context monitoring:', !contextToggleEnabled ? 'enabled' : 'disabled');
    };

    // Register all event listeners
    window.addEventListener('focus-main-input', handleFocusMainInput);
    window.addEventListener('focus-quick-input', handleFocusQuickInput);
    window.addEventListener('show-collapsed-and-focus-quick', handleShowCollapsedAndFocusQuick);
    window.addEventListener('toggle-collapse', handleToggleCollapse);
    window.addEventListener('cycle-size', handleCycleSize);
    window.addEventListener('toggle-context', handleToggleContext);
    
    return () => {
      window.removeEventListener('focus-main-input', handleFocusMainInput);
      window.removeEventListener('focus-quick-input', handleFocusQuickInput);
      window.removeEventListener('show-collapsed-and-focus-quick', handleShowCollapsedAndFocusQuick);
      window.removeEventListener('toggle-collapse', handleToggleCollapse);
      window.removeEventListener('cycle-size', handleCycleSize);
      window.removeEventListener('toggle-context', handleToggleContext);
    };
  }, [state.collapsed, contextToggleEnabled, handleSizeChange]);

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
    
    setChats(prev => prev.map(chat => 
      chat.id === activeChatId 
        ? { 
            ...chat, 
            messages: [...chat.messages, userMessage],
            updatedAt: Date.now()
          }
        : chat
    ));
    
    // Clear input
    if (fromQuickInput) {
      setQuickInput('');
    } else {
      setInput('');
    }
    
    setIsTyping(true);
    
    // Update remote monitoring typing status (disabled for now)
    // if (isRemoteRegistered) {
    //   remoteMonitoring.updateStatus({ isTyping: true });
    // }
    
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
      
      setChats(prev => prev.map(chat => 
        chat.id === activeChatId 
          ? { 
              ...chat, 
              messages: [...chat.messages, assistantMessage],
              updatedAt: Date.now()
            }
          : chat
      ));
    } catch (error) {
      console.error('Error executing command:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ **Command execution failed**\n\nError: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: Date.now()
      };
      
      setChats(prev => prev.map(chat => 
        chat.id === activeChatId 
          ? { 
              ...chat, 
              messages: [...chat.messages, errorMessage],
              updatedAt: Date.now()
            }
          : chat
      ));
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
    
    // Build message content with context if available and appropriate
    let messageContent = textToSend;
    
    // Only include context if:
    // 1. Context toggle is enabled AND
    // 2. User explicitly wants to include context OR recently selected something OR sending from minimized mode
    const shouldIncludeContext = contextToggleEnabled && 
      (includeContextInMessage || recentlySelected || (fromQuickInput && state.collapsed)) &&
      (contextData.clipboard || contextData.selectedText);
    
    if (shouldIncludeContext) {
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
    
    setChats(prev => prev.map(chat => 
      chat.id === activeChatId 
        ? { 
            ...chat, 
            messages: [...chat.messages, userMessage],
            updatedAt: Date.now()
          }
        : chat
    ));
    
    // Clear context flags if context was included
    if (shouldIncludeContext) {
      setRecentlySelected(false);
      setIncludeContextInMessage(false);
    }
    
    // Auto-maximize if sending from minimized mode
    if (fromQuickInput && state.collapsed) {
      handleCollapseToggle();
      // Scroll to bottom after maximize animation
      setTimeout(() => {
        scrollToBottom();
      }, 300);
    }
    
    // Clear input
    if (fromQuickInput) {
      setQuickInput('');
    } else {
      setInput('');
    }
    
    setIsTyping(true);
    
    // Update remote monitoring typing status (disabled for now)
    // if (isRemoteRegistered) {
    //   remoteMonitoring.updateStatus({ isTyping: true });
    // }
    
    try {
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
        
        // Create a temporary message for streaming
        const tempMessageId = (Date.now() + 1).toString();
        const streamingMessage: Message = {
          id: tempMessageId,
          role: 'assistant',
          content: '',
          timestamp: Date.now()
        };
        
        setChats(prev => prev.map(chat => 
          chat.id === activeChatId 
            ? { 
                ...chat, 
                messages: [...chat.messages, streamingMessage],
                updatedAt: Date.now()
              }
            : chat
        ));
        setStreamingResponse('');
        
        // Handle response
        const response = await window.pip.ollama.chat(chatHistory, currentModel);
        
        console.log('Ollama response:', response);
        
        // Update the streaming message with the complete response
        setChats(prev => prev.map(chat => 
          chat.id === activeChatId 
            ? { 
                ...chat, 
                messages: chat.messages.map(msg => 
                  msg.id === tempMessageId 
                    ? { ...msg, content: response }
                    : msg
                ),
                updatedAt: Date.now()
              }
            : chat
        ));
        
      } else {
        // Fallback response when Ollama is not available
        const reason = !ollamaAvailable 
          ? "Ollama is not running" 
          : !currentModel 
            ? "No model selected" 
            : "Ollama API not available";
            
        const response = `⚠️ **Ollama Unavailable**\n\nReason: ${reason}\n\nPlease:\n1. Make sure Ollama is installed and running\n2. Check that you have models installed (\`ollama list\`)\n3. Try refreshing the connection in Settings`;
        
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response,
          timestamp: Date.now()
        };
        
        setChats(prev => prev.map(chat => 
          chat.id === activeChatId 
            ? { 
                ...chat, 
                messages: [...chat.messages, assistantMessage],
                updatedAt: Date.now()
              }
            : chat
        ));
      }
      
    } catch (error) {
      console.error('Error getting Ollama response:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to get response from Ollama'}`,
        timestamp: Date.now()
      };
      
      setChats(prev => prev.map(chat => 
        chat.id === activeChatId 
          ? { 
              ...chat, 
              messages: [...chat.messages, errorMessage],
              updatedAt: Date.now()
            }
          : chat
      ));
    } finally {
      setIsTyping(false);
      setStreamingResponse('');
      
      // Update remote monitoring typing status (disabled for now)
      // if (isRemoteRegistered) {
      //   remoteMonitoring.updateStatus({ isTyping: false });
      // }
    }
  };

  // State for expandable context in messages
  const [expandedContexts, setExpandedContexts] = useState<Set<string>>(new Set());
  
  // State for copy functionality
  const [copiedCode, setCopiedCode] = useState<Set<string>>(new Set());

  // Chat management functions
  const createNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      name: `Chat ${chats.length + 1}`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: false
    };
    
    setChats(prev => prev.map(chat => ({ ...chat, isActive: false })).concat(newChat));
    setActiveChatId(newChat.id);
  };

  const switchChat = (chatId: string) => {
    setChats(prev => prev.map(chat => ({ 
      ...chat, 
      isActive: chat.id === chatId 
    })));
    setActiveChatId(chatId);
  };

  const deleteChat = (chatId: string) => {
    if (chats.length <= 1) return; // Don't delete the last chat
    
    const newChats = chats.filter(chat => chat.id !== chatId);
    const newActiveChatId = activeChatId === chatId ? newChats[0].id : activeChatId;
    
    setChats(newChats.map(chat => ({ 
      ...chat, 
      isActive: chat.id === newActiveChatId 
    })));
    setActiveChatId(newActiveChatId);
  };

  const renameChat = (chatId: string, newName: string) => {
    setChats(prev => prev.map(chat => 
      chat.id === chatId ? { ...chat, name: newName } : chat
    ));
  };

  // Message editing functions
  const startEditingMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingContent(content);
  };

  const cancelEditingMessage = () => {
    setEditingMessageId(null);
    setEditingContent('');
  };

  const saveEditedMessage = async () => {
    if (!editingMessageId || !editingContent.trim()) return;

    // Find the message to edit
    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;

    const messageIndex = chat.messages.findIndex(m => m.id === editingMessageId);
    if (messageIndex === -1) return;

    const message = chat.messages[messageIndex];
    if (message.role !== 'user') return; // Only edit user messages

    // Update the message content
    setChats(prev => prev.map(chat => 
      chat.id === activeChatId 
        ? {
            ...chat,
            messages: chat.messages.map(msg => 
              msg.id === editingMessageId 
                ? { ...msg, content: editingContent.trim() }
                : msg
            ),
            updatedAt: Date.now()
          }
        : chat
    ));

    // If this was the last user message, regenerate the assistant response
    const updatedChat = chats.find(c => c.id === activeChatId);
    if (updatedChat && messageIndex === updatedChat.messages.length - 2) {
      // This was the last user message, regenerate the assistant response
      const messagesBeforeEdit = updatedChat.messages.slice(0, messageIndex);
      const newUserMessage = { ...message, content: editingContent.trim() };
      
      // Remove the old assistant response and add the new user message
      setChats(prev => prev.map(chat => 
        chat.id === activeChatId 
          ? {
              ...chat,
              messages: [...messagesBeforeEdit, newUserMessage],
              updatedAt: Date.now()
            }
          : chat
      ));

      // Generate new response
      await handleSend(editingContent.trim(), false);
    }

    setEditingMessageId(null);
    setEditingContent('');
  };

  // Thinking indicator component
  const ThinkingIndicator = () => (
    <div className="flex items-center gap-2 text-purple-300/70 text-sm animate-pulse">
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span>{thinkingText || 'Thinking...'}</span>
    </div>
  );

  // Copy to clipboard function
  const copyToClipboard = async (text: string, codeId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(prev => new Set([...prev, codeId]));
      
      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopiedCode(prev => {
          const newSet = new Set(prev);
          newSet.delete(codeId);
          return newSet;
        });
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const runCommand = async (command: string) => {
    try {
      await handleCommandExecution(`/run ${command}`, false);
    } catch (err) {
      console.error('Failed to run command: ', err);
    }
  };

  // Render message content with expandable context
  const renderMessageContent = (content: string, messageId: string) => {
    // Check if the message contains context information
    const contextRegex = /\[Context: ([^\]]+)\]/;
    const contextMatch = content.match(contextRegex);
    
    if (contextMatch) {
      // Split the content into parts
      const beforeContext = content.substring(0, contextMatch.index);
      const afterContext = content.substring(contextMatch.index! + contextMatch[0].length);
      const contextText = contextMatch[1];
      const isExpanded = expandedContexts.has(messageId);
      
      return (
        <>
          <div className="prose prose-sm max-w-none prose-invert">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              code: ({ inline, className, children, ...props }) => {
                const match = /language-(\w+)/.exec(className || '');
                const codeText = String(children);
                const codeId = `${messageId}-${Math.random().toString(36).substr(2, 9)}`;
                const isCopied = copiedCode.has(codeId);
                
                return inline ? (
                  <code className="px-1 py-0.5 bg-white/10 rounded text-xs" {...props}>
                    {children}
                  </code>
                ) : (
                  <div className="relative group my-2">
                    <pre className="bg-black/20 rounded-lg p-3 pr-12 overflow-x-auto">
                      <code className={cn("text-xs", className)} {...props}>
                        {children}
                      </code>
                    </pre>
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200">
                      <button
                        onClick={() => runCommand(codeText)}
                        className={cn(
                          "p-1.5 rounded-md transition-all duration-200",
                          "bg-green-500/20 hover:bg-green-500/30 text-green-300"
                        )}
                        title="Run command"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => copyToClipboard(codeText, codeId)}
                        className={cn(
                          "p-1.5 rounded-md transition-all duration-200",
                          isCopied 
                            ? "bg-green-500/20 text-green-300" 
                            : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
                        )}
                        title={isCopied ? "Copied!" : "Copy code"}
                      >
                        {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                );
              },
              ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
              li: ({ children }) => <li className="mb-1">{children}</li>,
              h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
              h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-white/20 pl-3 my-2 italic opacity-80">
                  {children}
                </blockquote>
              ),
              a: ({ children, href }) => (
                <a href={href} className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {beforeContext.trim()}
          </ReactMarkdown>
          </div>
          {contextText && (
            <div className="mt-2 mb-1">
              {/* Collapsible context header */}
              <button
                onClick={() => {
                  const newExpanded = new Set(expandedContexts);
                  if (isExpanded) {
                    newExpanded.delete(messageId);
                  } else {
                    newExpanded.add(messageId);
                  }
                  setExpandedContexts(newExpanded);
                }}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg transition-all",
                  "hover:bg-white/10 border border-white/20",
                  "text-xs opacity-70"
                )}
              >
                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                <span>Context</span>
              </button>
              
              {/* Context content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className={cn(
                      "mt-2 p-3 rounded-lg text-xs font-mono overflow-x-auto",
                      "bg-black/20 border border-white/10"
                    )}>
                      <pre className="whitespace-pre-wrap break-words">{contextText}</pre>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {afterContext && (
            <div className="prose prose-sm max-w-none prose-invert mt-2">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                code: ({ inline, className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeText = String(children);
                  const codeId = `${messageId}-after-${Math.random().toString(36).substr(2, 9)}`;
                  const isCopied = copiedCode.has(codeId);
                  
                  return inline ? (
                    <code className="px-1 py-0.5 bg-white/10 rounded text-xs" {...props}>
                      {children}
                    </code>
                  ) : (
                    <div className="relative group my-2">
                      <pre className="bg-black/20 rounded-lg p-3 pr-12 overflow-x-auto">
                        <code className={cn("text-xs", className)} {...props}>
                          {children}
                        </code>
                      </pre>
                      <button
                        onClick={() => copyToClipboard(codeText, codeId)}
                        className={cn(
                          "absolute top-2 right-2 p-1.5 rounded-md transition-all duration-200",
                          "opacity-0 group-hover:opacity-100 focus:opacity-100",
                          isCopied 
                            ? "bg-green-500/20 text-green-300" 
                            : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
                        )}
                        title={isCopied ? "Copied!" : "Copy code"}
                      >
                        {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  );
                },
                ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                li: ({ children }) => <li className="mb-1">{children}</li>,
                h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-white/20 pl-3 my-2 italic opacity-80">
                    {children}
                  </blockquote>
                ),
                a: ({ children, href }) => (
                  <a href={href} className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {afterContext.trim()}
            </ReactMarkdown>
            </div>
          )}
        </>
      );
    }
    
    return (
      <div className="prose prose-sm max-w-none prose-invert">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          code: ({ inline, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const codeText = String(children);
            const codeId = `${messageId}-main-${Math.random().toString(36).substr(2, 9)}`;
            const isCopied = copiedCode.has(codeId);
            
            return inline ? (
              <code className="px-1 py-0.5 bg-white/10 rounded text-xs" {...props}>
                {children}
              </code>
            ) : (
              <div className="relative group my-2">
                <pre className="bg-black/20 rounded-lg p-3 pr-12 overflow-x-auto">
                  <code className={cn("text-xs", className)} {...props}>
                    {children}
                  </code>
                </pre>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200">
                  <button
                    onClick={() => runCommand(codeText)}
                    className={cn(
                      "p-1.5 rounded-md transition-all duration-200",
                      "bg-green-500/20 hover:bg-green-500/30 text-green-300"
                    )}
                    title="Run command"
                  >
                    <Play className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => copyToClipboard(codeText, codeId)}
                    className={cn(
                      "p-1.5 rounded-md transition-all duration-200",
                      isCopied 
                        ? "bg-green-500/20 text-green-300" 
                        : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
                    )}
                    title={isCopied ? "Copied!" : "Copy code"}
                  >
                    {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            );
          },
          ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-white/20 pl-3 my-2 italic opacity-80">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
              >
          {content}
        </ReactMarkdown>
      </div>
    );
  };

  const dims = sizePx[state.size];

  // Animated Siri-like orb component
  const AnimatedOrb = () => (
    <div className="relative w-6 h-6 flex items-center justify-center">
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400 to-purple-600"
        animate={{
          scale: isTyping ? [1, 1.2, 1] : 1,
          opacity: isTyping ? [0.7, 1, 0.7] : 0.8,
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      <motion.div
        className="absolute inset-1 rounded-full bg-gradient-to-br from-blue-300 to-purple-500"
        animate={{
          scale: isTyping ? [1.2, 1, 1.2] : 1,
          opacity: isTyping ? [0.5, 0.8, 0.5] : 0.6,
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.3
        }}
      />
      <motion.div
        className="absolute inset-2 rounded-full bg-white/30"
        animate={{
          scale: isTyping ? [1, 1.3, 1] : 1,
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.6
        }}
      />
    </div>
  );

  return (
    <motion.div
      ref={containerRef}
      className={cn(
        "fixed transition-all duration-300",
        isResizing && "shadow-lg"
      )}
      style={{ 
        width: dims.w, 
        height: state.collapsed ? 120 : dims.h,
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
            state.collapsed && "flex-col items-stretch gap-2 pb-3 border-b-0",
            // Windows: minimal styling to let acrylic show through
            platform === 'win32'
              ? "border-white/10 hover:bg-white/5 hover:border-blue-500/30"
              : theme === 'dark' 
                ? "border-white/10 hover:bg-white/5 hover:border-blue-500/30"
                : "border-black/10 hover:bg-black/5 hover:border-blue-500/30"
          )}
          style={{ 
            WebkitAppRegion: state.collapsed ? 'no-drag' : 'drag',
            WebkitUserSelect: 'none',
            userSelect: 'none'
          } as React.CSSProperties}
          title={state.collapsed ? "" : "Drag to move window"}
        >
          {state.collapsed ? (
            <>
              {/* Top row - Orb, thinking indicator, and response preview */}
              <div 
                className="flex items-center gap-2"
                style={{ 
                  WebkitAppRegion: 'drag',
                  WebkitUserSelect: 'none',
                  userSelect: 'none'
                } as React.CSSProperties}
              >
                <Grip className="w-3 h-3 opacity-50 flex-shrink-0" />
                <AnimatedOrb />
                
                {/* Response preview or thinking indicator */}
                <div 
                  className="flex-1 min-w-0 cursor-pointer hover:bg-white/5 rounded-lg p-1 transition-colors"
                  onClick={handleCollapseToggle}
                  title="Click to expand chat"
                  style={{ 
                    WebkitAppRegion: 'no-drag'
                  } as React.CSSProperties}
                >
                  {isTyping ? (
                    <ThinkingIndicator />
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="text-xs opacity-70 truncate flex-1">
                        {lastAssistantMessage ? 
                          lastAssistantMessage.slice(0, 50) + (lastAssistantMessage.length > 50 ? '...' : '') 
                          : 'Ready to chat'}
                      </div>
                      <Maximize2 className="w-3 h-3 opacity-40" />
                    </div>
                  )}
                </div>

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
                  
                  {/* Remote monitoring status (disabled for now) */}
                  {/* <div 
                    className={cn(
                      "w-2 h-2 rounded-full",
                      isRemoteRegistered ? "bg-blue-400" : "bg-gray-400"
                    )}
                    title={isRemoteRegistered ? "Remote monitoring active" : "Remote monitoring offline"}
                  /> */}
                </div>

                {/* Context indicator */}
                {hasNewContext && (contextData.clipboard || contextData.selectedText) && (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 rounded-full flex-shrink-0">
                    <Clipboard className="w-2.5 h-2.5" />
                    <span className="text-xs">New</span>
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                  </div>
                )}
              </div>

              {/* Bottom row - Input and controls */}
              <div className="flex items-center gap-2">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend(quickInput, true);
                  }}
                  className="flex items-center gap-2 flex-1"
                  style={{ 
                    WebkitAppRegion: 'no-drag'
                  } as React.CSSProperties}
                >
                  <input
                    type="text"
                    value={quickInput}
                    onChange={(e) => setQuickInput(e.target.value)}
                    placeholder="Type your message..."
                    className={cn(
                      "flex-1 px-3 py-1.5 text-sm rounded-lg border transition-all",
                      "focus:outline-none focus:ring-2",
                      platform !== 'win32' && "backdrop-blur-md",
                      platform === 'win32'
                        ? "bg-white/10 border-white/10 placeholder:text-white/40 focus:ring-white/20"
                        : theme === 'dark' 
                          ? "bg-white/10 border-white/10 placeholder:text-white/40 focus:ring-white/20"
                          : "bg-black/10 border-black/10 placeholder:text-black/40 focus:ring-black/20"
                    )}
                  />
                  
                  {/* Context indicator */}
                  {(contextData.clipboard || contextData.selectedText) && contextToggleEnabled && (
                    <div 
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-xs flex-shrink-0",
                        "bg-blue-500/20 border border-blue-500/30 text-blue-300"
                      )}
                      title="Context will be auto-attached"
                    >
                      <Clipboard className="w-3 h-3" />
                      <span>Context</span>
                    </div>
                  )}
                  
                  <button
                    type="submit"
                    disabled={!quickInput.trim() && !isTyping}
                    onClick={(e) => {
                      if (isTyping) {
                        e.preventDefault();
                        handleStop();
                      }
                    }}
                    className={cn(
                      "p-1.5 rounded-lg transition-all flex-shrink-0",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      platform !== 'win32' && "backdrop-blur-md",
                      isTyping 
                        ? "bg-red-500/20 hover:bg-red-500/30 text-red-300"
                        : platform === 'win32'
                          ? "bg-white/10 hover:bg-white/20"
                          : theme === 'dark' 
                            ? "bg-white/10 hover:bg-white/20"
                            : "bg-black/10 hover:bg-black/20"
                    )}
                    title={isTyping ? "Stop" : "Send"}
                  >
                    {isTyping ? <Square className="w-3.5 h-3.5" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
                  </button>
                </form>

                {/* Control buttons */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={handleSizeChange}
                    className={cn(
                      "p-1.5 rounded-lg hover:bg-white/10 transition-all duration-200",
                      isResizing && "bg-blue-500/20 scale-110"
                    )}
                    title={`Resize (${state.size} → ${state.size === 'S' ? 'M' : state.size === 'M' ? 'L' : 'S'})`}
                    disabled={isResizing}
                  >
                    <div className="relative">
                      <div className="w-3.5 h-3.5 border border-current rounded-sm" />
                      <div className="absolute -top-0.5 -right-0.5 w-2 h-2 border border-current rounded-sm bg-current/20" />
                    </div>
                  </button>
                  <button
                    onClick={handleCollapseToggle}
                    className={cn(
                      "p-2 rounded-lg transition-all duration-200 border border-white/20",
                      "hover:bg-blue-500/20 hover:border-blue-500/40 hover:scale-105",
                      "bg-white/5 backdrop-blur-sm",
                      isResizing && "opacity-50"
                    )}
                    title="Expand Chat"
                    disabled={isResizing}
                  >
                    <Maximize2 className="w-4 h-4" />
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
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Grip className="w-3 h-3 opacity-50 flex-shrink-0" />
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                
                {/* Chat Selector */}
                <div className="relative flex-1 min-w-0">
                  <button
                    onClick={() => setShowChatSelector(!showChatSelector)}
                    className={cn(
                      "flex items-center gap-2 w-full text-left hover:bg-white/5 rounded px-2 py-1 transition-colors",
                      showChatSelector && "bg-white/10"
                    )}
                    title="Switch chat"
                  >
                    <span className="text-sm font-medium truncate">
                      {activeChat?.name || 'Chat'}
                    </span>
                    <ChevronDown className={cn(
                      "w-3 h-3 opacity-60 transition-transform",
                      showChatSelector && "rotate-180"
                    )} />
                  </button>
                  
                  {/* Chat dropdown */}
                  {showChatSelector && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -10 }}
                      className={cn(
                        "absolute top-full left-0 mt-2 w-64 z-50",
                        "rounded-lg border shadow-lg overflow-hidden",
                        platform === 'win32'
                          ? "bg-black/90 border-white/20"
                          : theme === 'dark' 
                            ? "bg-gray-900/95 border-white/20 backdrop-blur-lg"
                            : "bg-gray-100/95 border-black/20 backdrop-blur-lg"
                      )}
                    >
                      <div className="p-2 space-y-1">
                        {chats.map((chat) => (
                          <div
                            key={chat.id}
                            className={cn(
                              "flex items-center justify-between p-2 rounded cursor-pointer transition-colors",
                              chat.id === activeChatId
                                ? "bg-blue-500/20 text-blue-200"
                                : "hover:bg-white/10"
                            )}
                            onClick={() => {
                              switchChat(chat.id);
                              setShowChatSelector(false);
                            }}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-sm truncate">{chat.name}</span>
                              <span className="text-xs opacity-60">
                                ({chat.messages.length} messages)
                              </span>
                            </div>
                            {chat.id === activeChatId && (
                              <div className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0" />
                            )}
                            {chats.length > 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteChat(chat.id);
                                }}
                                className="p-1 hover:bg-red-500/20 rounded transition-colors"
                                title="Delete chat"
                              >
                                <X className="w-3 h-3 opacity-60 hover:opacity-100" />
                              </button>
                            )}
                          </div>
                        ))}
                        
                        {/* New chat button */}
                        <button
                          onClick={() => {
                            createNewChat();
                            setShowChatSelector(false);
                          }}
                          className="w-full p-2 text-sm text-center hover:bg-green-500/20 rounded transition-colors border border-dashed border-white/20"
                        >
                          + New Chat
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            
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
                        {showModelSelector ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
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
                    onClick={() => setContextToggleEnabled(!contextToggleEnabled)}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors relative",
                      contextToggleEnabled 
                        ? "bg-green-500/20 hover:bg-green-500/30 text-green-300"
                        : "bg-red-500/20 hover:bg-red-500/30 text-red-300"
                    )}
                    title={`Context monitoring: ${contextToggleEnabled ? 'ON' : 'OFF'} (Ctrl+Shift+T)`}
                  >
                    <Clipboard className="w-3.5 h-3.5" />
                    <div className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full",
                      contextToggleEnabled ? "bg-green-400" : "bg-red-400"
                    )} />
                  </button>
                <button
                  onClick={handleSizeChange}
                  className={cn(
                    "p-1.5 rounded-lg hover:bg-white/10 transition-all duration-200",
                    isResizing && "bg-blue-500/20 scale-110"
                  )}
                                      title={`Change size (${state.size} → ${state.size === 'S' ? 'M' : state.size === 'M' ? 'L' : 'S'}) - Ctrl+Shift+S`}
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
              title={`${state.collapsed ? "Expand" : "Collapse"} - Ctrl+Shift+M`}
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
            </>
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
              {/* Context Display */}
              <AnimatePresence>
                {showContext && contextToggleEnabled && hasNewContext && (contextData.clipboard || contextData.selectedText) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className={cn(
                      "border-b space-y-2",
                      platform === 'win32'
                        ? "bg-blue-500/5 border-white/10" // Minimal overlay on Windows
                        : "bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-sm",
                      platform !== 'win32' && (theme === 'dark' ? "border-white/10" : "border-black/10")
                    )}
                  >
                    {/* Header with collapse button */}
                    <div className="flex items-center justify-between p-3 pb-2">
                      <button
                        onClick={() => setContextCollapsed(!contextCollapsed)}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                      >
                        <Clipboard className="w-3 h-3 opacity-60" />
                        <span className="text-xs font-medium opacity-80">
                          {recentlySelected ? 'Recently Selected' : 'Context Available'}
                        </span>
                        <ChevronDown className={cn(
                          "w-3 h-3 opacity-60 transition-transform",
                          !contextCollapsed && "rotate-180"
                        )} />
                        {isMonitoring && (
                          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        )}
                      </button>
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
                      </div>
                    </div>
                    
                    {/* Collapsible content */}
                    <AnimatePresence>
                      {!contextCollapsed && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="px-3 pb-3 space-y-2"
                        >
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
                                {contextData.clipboard.length > 200 
                                  ? `${contextData.clipboard.substring(0, 200)}...` 
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
                                {contextData.selectedText.length > 200 
                                  ? `${contextData.selectedText.substring(0, 200)}...` 
                                  : contextData.selectedText}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    {/* Context inclusion toggle */}
                    <div className="px-3 pb-3 pt-1 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={includeContextInMessage}
                              onChange={(e) => setIncludeContextInMessage(e.target.checked)}
                              className="w-3 h-3 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500 focus:ring-1"
                            />
                            <span className="text-xs opacity-80">Include in messages</span>
                          </label>
                          {recentlySelected && (
                            <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                              Auto-include
                            </span>
                          )}
                        </div>
                        {(includeContextInMessage || recentlySelected) && (
                          <span className="text-xs opacity-60">📋 Will attach</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Messages */}
              <div className={cn(
                "flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin select-text",
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
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm select-text relative group",
                      message.role === 'user' 
                        ? "ml-auto bg-blue-500/20" + (platform !== 'win32' ? " backdrop-blur-md" : "")
                        : platform === 'win32'
                          ? "bg-white/10" // Consistent on Windows
                          : theme === 'dark' 
                            ? "bg-white/10 backdrop-blur-md"
                            : "bg-black/10 backdrop-blur-md"
                    )}
                  >
                    {/* Edit button for user messages */}
                    {message.role === 'user' && (
                      <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEditingMessage(message.id, message.content)}
                          className={cn(
                            "p-1 rounded-full transition-colors",
                            theme === 'dark' ? "hover:bg-white/20" : "hover:bg-black/20"
                          )}
                          title="Edit message"
                        >
                          <Edit className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    
                    {editingMessageId === message.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          className={cn(
                            "w-full p-2 rounded border resize-none",
                            "bg-transparent border-white/20 focus:border-blue-400",
                            "focus:outline-none focus:ring-1 focus:ring-blue-400"
                          )}
                          rows={Math.max(2, editingContent.split('\n').length)}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={saveEditedMessage}
                            className="px-2 py-1 text-xs bg-green-500/20 hover:bg-green-500/30 rounded transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEditingMessage}
                            className="px-2 py-1 text-xs bg-gray-500/20 hover:bg-gray-500/30 rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      renderMessageContent(message.content, message.id)
                    )}
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
                        setRecentlySelected(false); // Clear recently selected flag
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
                        setRecentlySelected(false); // Clear recently selected flag
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
                    disabled={!input.trim() && !isTyping}
                    onClick={(e) => {
                      if (isTyping) {
                        e.preventDefault();
                        handleStop();
                      }
                    }}
                    className={cn(
                      "p-2 rounded-xl transition-all",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      platform !== 'win32' && "backdrop-blur-md",
                      isTyping 
                        ? "bg-red-500/20 hover:bg-red-500/30 text-red-300"
                        : platform === 'win32'
                          ? "bg-white/10 hover:bg-white/20"
                          : theme === 'dark' 
                            ? "bg-white/10 hover:bg-white/20"
                            : "bg-black/10 hover:bg-black/20"
                    )}
                    title={isTyping ? "Stop" : "Send"}
                  >
                    {isTyping ? <Square className="w-4 h-4" /> : <CornerDownLeft className="w-4 h-4" />}
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