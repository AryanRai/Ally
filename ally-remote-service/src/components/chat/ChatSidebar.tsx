'use client';

import { useState } from 'react';
import { ChatSession } from '@/hooks/useMessages';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { formatTimestamp, truncateText } from '@/lib/utils';
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  MoreVertical,
  Calendar,
  Hash
} from 'lucide-react';
import { motion } from 'framer-motion';

interface ChatSidebarProps {
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  onSessionSelect: (session: ChatSession) => void;
  onSessionDelete: (sessionId: string) => void;
  onNewChat: () => void;
  loading: boolean;
}

export function ChatSidebar({
  sessions,
  currentSession,
  onSessionSelect,
  onSessionDelete,
  onNewChat,
  loading,
}: ChatSidebarProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (deletingId) return;
    
    setDeletingId(sessionId);
    try {
      await onSessionDelete(sessionId);
    } catch (error) {
      console.error('Failed to delete session:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const groupSessionsByDate = (sessions: ChatSession[]) => {
    const groups: { [key: string]: ChatSession[] } = {};
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString();

    sessions.forEach(session => {
      const sessionDate = new Date(session.updated_at).toDateString();
      let groupKey: string;

      if (sessionDate === today) {
        groupKey = 'Today';
      } else if (sessionDate === yesterday) {
        groupKey = 'Yesterday';
      } else {
        groupKey = new Date(session.updated_at).toLocaleDateString();
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(session);
    });

    return groups;
  };

  const sessionGroups = groupSessionsByDate(sessions);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <Button
          onClick={onNewChat}
          className="w-full justify-start"
          disabled={loading}
        >
          <Plus className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading && sessions.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <LoadingSpinner size="md" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No chats yet</p>
            <p className="text-xs mt-1">Start a new conversation</p>
          </div>
        ) : (
          <div className="p-2">
            {Object.entries(sessionGroups).map(([groupName, groupSessions]) => (
              <div key={groupName} className="mb-4">
                <div className="flex items-center px-2 py-1 mb-2">
                  <Calendar className="w-3 h-3 mr-2 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {groupName}
                  </span>
                </div>
                
                <div className="space-y-1">
                  {groupSessions.map((session) => (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`group relative rounded-lg p-3 cursor-pointer transition-colors hover:bg-accent ${
                        currentSession?.id === session.id
                          ? 'bg-accent border border-border'
                          : ''
                      }`}
                      onClick={() => onSessionSelect(session)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center mb-1">
                            <MessageSquare className="w-3 h-3 mr-2 text-muted-foreground flex-shrink-0" />
                            <h3 className="text-sm font-medium truncate">
                              {truncateText(session.title, 30)}
                            </h3>
                          </div>
                          
                          <div className="flex items-center text-xs text-muted-foreground">
                            <Hash className="w-3 h-3 mr-1" />
                            <span className="mr-3">
                              {session.message_count || 0} messages
                            </span>
                            <span>
                              {formatTimestamp(session.updated_at)}
                            </span>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 ml-2 flex-shrink-0"
                          onClick={(e) => handleDelete(session.id, e)}
                          disabled={deletingId === session.id}
                        >
                          {deletingId === session.id ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <Trash2 className="w-3 h-3 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t">
        <div className="text-xs text-muted-foreground text-center">
          <p>Connected to Ally Remote</p>
          <p className="mt-1">
            {sessions.length} chat{sessions.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}