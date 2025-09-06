'use client'

import { useState, useEffect, useRef } from 'react'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { ToolExecutionDisplay } from './ToolExecutionDisplay'
import { OfflineQueue } from './OfflineQueue'
import { useChat } from '@/hooks/useChat'
import { useToolExecutions } from '@/hooks/useToolExecutions'
import { useAuth } from '@/contexts/AuthContext'

export function ChatInterface() {
  const [sessionId, setSessionId] = useState<string>()
  const [isOnline, setIsOnline] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()
  
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    isConnected,
    streamingMessages,
  } = useChat(sessionId)
  
  const { toolExecutions } = useToolExecutions(sessionId)

  // Monitor browser online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async (content: string) => {
    try {
      const result = await sendMessage(content)
      if (!sessionId && result.sessionId) {
        setSessionId(result.sessionId)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }

  const handleSendQueuedMessages = async (queuedMessages: any[]) => {
    for (const message of queuedMessages) {
      try {
        await sendMessage(message.content)
      } catch (error) {
        console.error('Failed to send queued message:', error)
        throw error // Re-throw to keep message in queue
      }
    }
  }

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4">
      {/* Offline message queue */}
      <OfflineQueue 
        isOnline={isOnline && isConnected}
        onSendQueuedMessages={handleSendQueuedMessages}
      />

      {/* Welcome message when no messages */}
      {messages.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center animate-pulse-glow">
              <span className="text-white font-bold text-2xl">A</span>
            </div>
            <h2 className="text-2xl font-semibold text-white">Welcome to Ally Remote Chat</h2>
            <p className="text-gray-400 max-w-md">
              Connect with your local Ally system from anywhere. Send commands, execute tools, 
              and get AI assistance remotely with real-time streaming responses.
            </p>
            {!user && (
              <div className="glass rounded-lg p-4 bg-blue-500/10 border-blue-500/20">
                <p className="text-blue-400 text-sm">
                  🔐 Please sign in to start chatting with your local Ally system.
                </p>
              </div>
            )}
            {user && !isOnline && (
              <div className="glass rounded-lg p-4 bg-red-500/10 border-red-500/20">
                <p className="text-red-400 text-sm">
                  📡 No internet connection. Please check your network.
                </p>
              </div>
            )}
            {user && isOnline && !isConnected && (
              <div className="glass rounded-lg p-4 bg-yellow-500/10 border-yellow-500/20">
                <p className="text-yellow-400 text-sm">
                  ⚠️ Local system is offline. Messages will be queued until connection is restored.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages area */}
      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          <MessageList messages={messages} streamingMessages={streamingMessages} />
          
          {/* Tool executions */}
          {toolExecutions.length > 0 && (
            <ToolExecutionDisplay executions={toolExecutions} />
          )}
          
          {/* Error display */}
          {error && (
            <div className="glass rounded-lg p-4 bg-red-500/10 border-red-500/20">
              <p className="text-red-400 text-sm">
                ❌ {error}
              </p>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input area */}
      <div className="glass-strong rounded-2xl p-4 border-white/20">
        <MessageInput
          onSend={handleSendMessage}
          disabled={isLoading || !user}
          placeholder={
            !user ? "Please sign in to send messages" :
            !isOnline ? "No internet connection" :
            isConnected ? "Type your message..." : "Local system offline - message will be queued"
          }
        />
        
        {isLoading && (
          <div className="mt-3 flex items-center space-x-2 text-sm text-gray-400">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <span>Processing message...</span>
          </div>
        )}
      </div>
    </div>
  )
}