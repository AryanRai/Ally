import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  MessageSquare, 
  MoreHorizontal, 
  Edit3, 
  Trash2, 
  Check, 
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Chat } from '../types/chat';

interface ChatSidebarProps {
  chats: Chat[];
  activeChat: string | null;
  onChatSelect: (chatId: string) => void;
  onChatCreate: () => void;
  onChatDelete: (chatId: string) => void;
  onChatRename: (chatId: string, newTitle: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  theme: 'light' | 'dark';
  platform: string;
}

export default function ChatSidebar({
  chats,
  activeChat,
  onChatSelect,
  onChatCreate,
  onChatDelete,
  onChatRename,
  isCollapsed,
  onToggleCollapse,
  theme,
  platform
}: ChatSidebarProps) {
  const [editingChat, setEditingChat] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showMenu, setShowMenu] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingChat && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingChat]);

  const handleStartEdit = (chat: Chat) => {
    setEditingChat(chat.id);
    setEditTitle(chat.title);
    setShowMenu(null);
  };

  const handleSaveEdit = () => {
    if (editingChat && editTitle.trim()) {
      onChatRename(editingChat, editTitle.trim());
    }
    setEditingChat(null);
    setEditTitle('');
  };

  const handleCancelEdit = () => {
    setEditingChat(null);
    setEditTitle('');
  };

  const handleDeleteChat = (chatId: string) => {
    onChatDelete(chatId);
    setShowMenu(null);
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getLastMessage = (chat: Chat) => {
    const lastMessage = chat.messages[chat.messages.length - 1];
    if (!lastMessage) return 'No messages';
    
    let content = lastMessage.content;
    // Remove markdown and clean up
    content = content.replace(/[#*`]/g, '').replace(/\n/g, ' ');
    return content.length > 40 ? content.substring(0, 37) + '...' : content;
  };

  return (
    <motion.div
      initial={false}
      animate={{ width: isCollapsed ? 48 : 280 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={cn(
        "flex flex-col border-r h-full",
        platform === 'win32'
          ? "border-white/10 bg-black/20"
          : theme === 'dark' 
            ? "border-white/10 bg-black/20"
            : "border-black/10 bg-white/20"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-inherit">
        <AnimatePresence mode="wait">
          {!isCollapsed && (
            <motion.h2
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className={cn(
                "text-sm font-medium",
                platform === 'win32'
                  ? "text-white/80"
                  : theme === 'dark' ? "text-white/80" : "text-black/80"
              )}
            >
              Chats
            </motion.h2>
          )}
        </AnimatePresence>
        
        <div className="flex items-center gap-1">
          {!isCollapsed && (
            <button
              onClick={onChatCreate}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                platform === 'win32' 
                  ? "hover:bg-white/10"
                  : theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10"
              )}
              title="New chat"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          
          <button
            onClick={onToggleCollapse}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              platform === 'win32' 
                ? "hover:bg-white/10"
                : theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10"
            )}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence>
          {chats.map((chat) => (
            <motion.div
              key={chat.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="relative"
            >
              <button
                onClick={() => onChatSelect(chat.id)}
                className={cn(
                  "w-full text-left transition-colors relative group",
                  isCollapsed ? "p-3" : "p-3",
                  activeChat === chat.id
                    ? platform === 'win32'
                      ? "bg-blue-500/20 border-r-2 border-blue-400"
                      : theme === 'dark'
                        ? "bg-blue-500/20 border-r-2 border-blue-400"
                        : "bg-blue-500/20 border-r-2 border-blue-600"
                    : platform === 'win32'
                      ? "hover:bg-white/5"
                      : theme === 'dark'
                        ? "hover:bg-white/5"
                        : "hover:bg-black/5"
                )}
              >
                <div className="flex items-center gap-3">
                  <MessageSquare className={cn(
                    "w-4 h-4 flex-shrink-0",
                    activeChat === chat.id
                      ? "text-blue-400"
                      : platform === 'win32'
                        ? "text-white/60"
                        : theme === 'dark' ? "text-white/60" : "text-black/60"
                  )} />
                  
                  <AnimatePresence mode="wait">
                    {!isCollapsed && (
                      <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="flex-1 min-w-0"
                      >
                        {editingChat === chat.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              ref={editInputRef}
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit();
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                              className={cn(
                                "flex-1 bg-transparent border rounded px-2 py-1 text-xs",
                                platform === 'win32'
                                  ? "border-white/20 text-white"
                                  : theme === 'dark' 
                                    ? "border-white/20 text-white"
                                    : "border-black/20 text-black"
                              )}
                            />
                            <button
                              onClick={handleSaveEdit}
                              className="p-1 hover:bg-green-500/20 rounded"
                            >
                              <Check className="w-3 h-3 text-green-400" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1 hover:bg-red-500/20 rounded"
                            >
                              <X className="w-3 h-3 text-red-400" />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <h3 className={cn(
                                "text-sm font-medium truncate",
                                activeChat === chat.id
                                  ? "text-blue-400"
                                  : platform === 'win32'
                                    ? "text-white/90"
                                    : theme === 'dark' ? "text-white/90" : "text-black/90"
                              )}>
                                {chat.title}
                              </h3>
                              <span className={cn(
                                "text-xs flex-shrink-0 ml-2",
                                platform === 'win32'
                                  ? "text-white/50"
                                  : theme === 'dark' ? "text-white/50" : "text-black/50"
                              )}>
                                {formatTime(chat.updatedAt)}
                              </span>
                            </div>
                            <p className={cn(
                              "text-xs truncate",
                              platform === 'win32'
                                ? "text-white/60"
                                : theme === 'dark' ? "text-white/60" : "text-black/60"
                            )}>
                              {getLastMessage(chat)}
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Menu button */}
                {!isCollapsed && editingChat !== chat.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(showMenu === chat.id ? null : chat.id);
                    }}
                    className={cn(
                      "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity",
                      platform === 'win32' 
                        ? "hover:bg-white/10"
                        : theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10"
                    )}
                  >
                    <MoreHorizontal className="w-3 h-3" />
                  </button>
                )}
              </button>

              {/* Context Menu */}
              <AnimatePresence>
                {showMenu === chat.id && !isCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className={cn(
                      "absolute right-2 top-12 z-50 min-w-[120px] rounded-lg border shadow-lg",
                      platform === 'win32'
                        ? "bg-black/90 border-white/20"
                        : theme === 'dark' 
                          ? "bg-gray-900/95 border-white/20"
                          : "bg-white/95 border-black/20"
                    )}
                    style={{
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)'
                    }}
                  >
                    <button
                      onClick={() => handleStartEdit(chat)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-t-lg transition-colors",
                        platform === 'win32' 
                          ? "hover:bg-white/10 text-white/90"
                          : theme === 'dark' 
                            ? "hover:bg-white/10 text-white/90"
                            : "hover:bg-black/10 text-black/90"
                      )}
                    >
                      <Edit3 className="w-3 h-3" />
                      Rename
                    </button>
                    
                    {chats.length > 1 && (
                      <button
                        onClick={() => handleDeleteChat(chat.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-b-lg transition-colors",
                          "hover:bg-red-500/20 text-red-400"
                        )}
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* New chat button when collapsed */}
        {isCollapsed && (
          <div className="p-3">
            <button
              onClick={onChatCreate}
              className={cn(
                "w-full p-3 rounded-lg border-2 border-dashed transition-colors",
                platform === 'win32'
                  ? "border-white/20 hover:border-white/40 hover:bg-white/5"
                  : theme === 'dark' 
                    ? "border-white/20 hover:border-white/40 hover:bg-white/5"
                    : "border-black/20 hover:border-black/40 hover:bg-black/5"
              )}
              title="New chat"
            >
              <Plus className="w-4 h-4 mx-auto" />
            </button>
          </div>
        )}
      </div>

      {/* Click outside to close menu */}
      {showMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowMenu(null)}
        />
      )}
    </motion.div>
  );
}