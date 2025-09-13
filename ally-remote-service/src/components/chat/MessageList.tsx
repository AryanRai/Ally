'use client';

import { Message } from '@/hooks/useMessages';
import { MessageBubble } from './MessageBubble';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Bot, User } from 'lucide-react';
import { motion } from 'framer-motion';

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  isTyping?: boolean;
}

export function MessageList({ messages, loading, isTyping }: MessageListProps) {
  if (loading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <LoadingSpinner size="lg" className="mb-4" />
          <p className="text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {messages.map((message, index) => (
        <motion.div
          key={message.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
        >
          <MessageBubble message={message} />
        </motion.div>
      ))}
      
      {isTyping && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start space-x-3"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="bg-muted rounded-lg p-3 max-w-xs">
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}