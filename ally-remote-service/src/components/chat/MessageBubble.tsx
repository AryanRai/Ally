'use client';

import { Message } from '@/hooks/useMessages';
import { formatTimestamp, getStatusBadgeColor } from '@/lib/utils';
import { User, Bot, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.content && !message.response;
  const isAssistant = !!message.response;
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-3 h-3" />;
      case 'processing':
        return <AlertCircle className="w-3 h-3 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="w-3 h-3" />;
      case 'error':
        return <XCircle className="w-3 h-3" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-2">
      {/* User Message */}
      {isUser && (
        <div className="flex items-start space-x-3 justify-end">
          <div className="max-w-xs lg:max-w-md">
            <div className="bg-primary text-primary-foreground rounded-lg p-3">
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
            <div className="flex items-center justify-end mt-1 space-x-2">
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(message.created_at)}
              </span>
              <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${getStatusBadgeColor(message.status)}`}>
                {getStatusIcon(message.status)}
                <span className="ml-1 capitalize">{message.status}</span>
              </div>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-primary-foreground" />
          </div>
        </div>
      )}

      {/* Assistant Response */}
      {isAssistant && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-start space-x-3"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="max-w-xs lg:max-w-md">
            <div className="bg-muted rounded-lg p-3">
              <p className="text-sm whitespace-pre-wrap">{message.response}</p>
            </div>
            <div className="flex items-center mt-1 space-x-2">
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(message.completed_at || message.updated_at)}
              </span>
              {message.metadata?.source === 'remote' && (
                <span className="text-xs text-blue-500">Remote</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {message.status === 'error' && message.error_message && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-start space-x-3"
        >
          <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
            <XCircle className="w-4 h-4 text-white" />
          </div>
          <div className="max-w-xs lg:max-w-md">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-800 dark:text-red-200">
                Error: {message.error_message}
              </p>
            </div>
            <div className="flex items-center mt-1">
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(message.updated_at)}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Tool Execution Results */}
      {message.metadata?.toolResults && message.metadata.toolResults.length > 0 && (
        <div className="ml-11 space-y-2">
          {message.metadata.toolResults.map((result: any, index: number) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-blue-800 dark:text-blue-200">
                  Tool: {result.name}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  result.success 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  {result.success ? 'Success' : 'Failed'}
                </span>
              </div>
              {result.result && (
                <p className="text-xs text-blue-700 dark:text-blue-300 whitespace-pre-wrap">
                  {typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2)}
                </p>
              )}
              {result.error && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  Error: {result.error}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}