import { useEffect, useRef, useState } from 'react';
import { motion, useDragControls, AnimatePresence } from 'framer-motion';
import { 
  CornerDownLeft, 
  Minus, 
  X, 
  Maximize2, 
  MessageSquare,
  Settings,
  Grip
} from 'lucide-react';
import { cn } from '../lib/utils';

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

export default function GlassChatPiP() {
  const [state, setState] = useState<PiPState>({
    x: 24,
    y: 24,
    size: 'M',
    collapsed: false
  });
  
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
  
  const dragControls = useDragControls();
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

  // Calculate snap position
  const snapToCorner = (x: number, y: number) => {
    const gutter = 20;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = sizePx[state.size].w;
    const h = state.collapsed ? 64 : sizePx[state.size].h;
    
    const corners = [
      { x: gutter, y: gutter }, // Top-left
      { x: vw - w - gutter, y: gutter }, // Top-right
      { x: gutter, y: vh - h - gutter }, // Bottom-left
      { x: vw - w - gutter, y: vh - h - gutter }, // Bottom-right
      { x: (vw - w) / 2, y: gutter }, // Top-center
      { x: (vw - w) / 2, y: vh - h - gutter }, // Bottom-center
    ];
    
    let closest = corners[0];
    let minDistance = Infinity;
    
    corners.forEach(corner => {
      const distance = Math.hypot(corner.x - x, corner.y - y);
      if (distance < minDistance) {
        minDistance = distance;
        closest = corner;
      }
    });
    
    return closest;
  };

  const handleSend = () => {
    if (!input.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
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
        content: "I'm a placeholder response. Soon I'll be powered by Ollama!",
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
      className="fixed select-none"
      style={{ 
        left: state.x, 
        top: state.y, 
        width: dims.w, 
        height: state.collapsed ? 64 : dims.h,
        zIndex: 50
      }}
      drag
      dragControls={dragControls}
      dragMomentum={false}
      dragElastic={0.1}
      onDragEnd={(_, info) => {
        const newPos = snapToCorner(info.point.x, info.point.y);
        setState(prev => ({ ...prev, ...newPos }));
      }}
      animate={{ x: state.x, y: state.y }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
    >
      <motion.div
        layout
        className={cn(
          "h-full w-full rounded-2xl overflow-hidden",
          "border border-white/20",
          "shadow-[0_8px_40px_rgba(0,0,0,0.4)]",
          "bg-gradient-to-b from-white/[0.08] to-white/[0.02]",
          "backdrop-blur-2xl backdrop-saturate-150",
          "[background-image:radial-gradient(ellipse_at_top,rgba(255,255,255,0.1),transparent)]",
          "text-white/90"
        )}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div 
          className="flex items-center gap-2 px-3 py-2 border-b border-white/10 cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <Grip className="w-3 h-3 opacity-50" />
          <MessageSquare className="w-4 h-4" />
          <span className="text-sm font-medium">Chat</span>
          
          <div className="ml-auto flex items-center gap-1">
            {!state.collapsed && (
              <>
                <button
                  onClick={() => setState(prev => ({ 
                    ...prev, 
                    size: prev.size === 'S' ? 'M' : prev.size === 'M' ? 'L' : 'S' 
                  }))}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  title="Change size"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  title="Settings"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              onClick={() => setState(prev => ({ ...prev, collapsed: !prev.collapsed }))}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title={state.collapsed ? "Expand" : "Collapse"}
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
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-white/10">
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      message.role === 'user' 
                        ? "ml-auto bg-blue-500/20 backdrop-blur-md" 
                        : "bg-white/10 backdrop-blur-md"
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
                    <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-white/10 p-3">
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
                      "flex-1 px-3 py-2 rounded-xl text-sm",
                      "bg-white/10 backdrop-blur-md",
                      "border border-white/10",
                      "placeholder:text-white/40",
                      "focus:outline-none focus:ring-2 focus:ring-white/20",
                      "transition-all"
                    )}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className={cn(
                      "p-2 rounded-xl",
                      "bg-white/10 backdrop-blur-md",
                      "hover:bg-white/20",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "transition-all"
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
    </motion.div>
  );
}