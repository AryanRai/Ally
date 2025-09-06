'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { User, Bot, Clock, CheckCircle, XCircle } from 'lucide-react'
import { StreamingText } from './StreamingText'
import { useStreamingResponse } from '@/hooks/useStreamingResponse'
import type { Message } from '@/types'

interface MessageBubbleProps {
  message: Message
  streamingContent?: string
}

export function MessageBubble({ message, streamingContent }: MessageBubbleProps) {
  const streamingState = useStreamingResponse(message.id)
  
  // Determine what content to show
  const responseContent = streamingContent || streamingState.content || message.response || ''
  const isActivelyStreaming = message.status === 'processing' && (!!streamingContent || streamingState.isStreaming)
  const isComplete = message.status === 'completed' || streamingState.isComplete

  const getStatusIcon = () => {
    switch (message.status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-400" />
      case 'processing':
        return <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />
      default:
        return null
    }
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-3"
    >
      {/* User message */}
      <div className="flex justify-end">
        <div className="message-user max-w-[80%]">
          <div className="flex items-start space-x-3">
            <div className="flex-1">
              <p className="text-white whitespace-pre-wrap">{message.content}</p>
              <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                <span>{formatTimestamp(message.created_at)}</span>
                <div className="flex items-center space-x-1">
                  {getStatusIcon()}
                </div>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Assistant response */}
      {(responseContent || message.status === 'processing') && (
        <div className="flex justify-start">
          <div className="message-assistant max-w-[80%]">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                {responseContent ? (
                  <StreamingText
                    content={responseContent}
                    isStreaming={isActivelyStreaming}
                    isComplete={isComplete}
                    className="text-white"
                    streamingSpeed={30}
                  />
                ) : message.status === 'processing' ? (
                  <div className="flex items-center space-x-2 text-gray-400">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-sm">Thinking...</span>
                  </div>
                ) : null}

                {message.error_message && (
                  <div className="mt-2 p-2 glass rounded-lg bg-red-500/10 border-red-500/20">
                    <p className="text-red-400 text-sm">❌ {message.error_message}</p>
                  </div>
                )}

                <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                  <span>
                    {message.completed_at 
                      ? formatTimestamp(message.completed_at)
                      : message.processed_at 
                      ? formatTimestamp(message.processed_at)
                      : 'Processing...'
                    }
                  </span>
                  <div className="flex items-center space-x-1">
                    {getStatusIcon()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}