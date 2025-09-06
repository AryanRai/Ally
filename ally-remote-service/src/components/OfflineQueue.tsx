'use client'

import { useState, useEffect } from 'react'
import { Wifi, Send, Trash2, AlertCircle } from 'lucide-react'

interface QueuedMessage {
  id: string
  content: string
  timestamp: string
  retryCount: number
}

interface OfflineQueueProps {
  isOnline: boolean
  onSendQueuedMessages: (messages: QueuedMessage[]) => Promise<void>
}

export function OfflineQueue({ isOnline, onSendQueuedMessages }: OfflineQueueProps) {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([])
  const [isSending, setIsSending] = useState(false)

  // Load queued messages from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('ally-queued-messages')
    if (stored) {
      try {
        setQueuedMessages(JSON.parse(stored))
      } catch (error) {
        console.error('Error loading queued messages:', error)
        localStorage.removeItem('ally-queued-messages')
      }
    }
  }, [])

  // Save queued messages to localStorage whenever they change
  useEffect(() => {
    if (queuedMessages.length > 0) {
      localStorage.setItem('ally-queued-messages', JSON.stringify(queuedMessages))
    } else {
      localStorage.removeItem('ally-queued-messages')
    }
  }, [queuedMessages])

  // Auto-send queued messages when coming back online
  useEffect(() => {
    if (isOnline && queuedMessages.length > 0 && !isSending) {
      handleSendAll()
    }
  }, [isOnline, queuedMessages.length, isSending])

  const addToQueue = (content: string) => {
    const newMessage: QueuedMessage = {
      id: Date.now().toString(),
      content,
      timestamp: new Date().toISOString(),
      retryCount: 0
    }
    setQueuedMessages(prev => [...prev, newMessage])
  }

  const removeFromQueue = (id: string) => {
    setQueuedMessages(prev => prev.filter(msg => msg.id !== id))
  }

  const clearQueue = () => {
    setQueuedMessages([])
  }

  const handleSendAll = async () => {
    if (queuedMessages.length === 0 || isSending) return

    setIsSending(true)
    try {
      await onSendQueuedMessages(queuedMessages)
      clearQueue()
    } catch (error) {
      console.error('Error sending queued messages:', error)
      // Increment retry count for failed messages
      setQueuedMessages(prev => 
        prev.map(msg => ({ ...msg, retryCount: msg.retryCount + 1 }))
      )
    } finally {
      setIsSending(false)
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Don't show if no queued messages
  if (queuedMessages.length === 0) return null

  return (
    <div className="glass-card border border-yellow-500/20 bg-yellow-500/5 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 text-yellow-400" />
          <h3 className="text-sm font-medium text-yellow-400">
            {queuedMessages.length} Message{queuedMessages.length !== 1 ? 's' : ''} Queued
          </h3>
        </div>
        
        <div className="flex items-center space-x-2">
          {isOnline && (
            <button
              onClick={handleSendAll}
              disabled={isSending}
              className="flex items-center space-x-1 px-3 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <Send className="w-3 h-3" />
              <span>{isSending ? 'Sending...' : 'Send All'}</span>
            </button>
          )}
          
          <button
            onClick={clearQueue}
            className="flex items-center space-x-1 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-32 overflow-y-auto">
        {queuedMessages.map((message) => (
          <div key={message.id} className="flex items-start justify-between p-2 bg-white/5 rounded-lg">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-300 truncate">
                {message.content}
              </p>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-xs text-gray-500">
                  {formatTimestamp(message.timestamp)}
                </span>
                {message.retryCount > 0 && (
                  <span className="text-xs text-yellow-400">
                    Retry {message.retryCount}
                  </span>
                )}
              </div>
            </div>
            
            <button
              onClick={() => removeFromQueue(message.id)}
              className="ml-2 p-1 hover:bg-red-500/20 text-red-400 rounded transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {!isOnline && (
        <div className="flex items-center space-x-2 mt-3 pt-3 border-t border-yellow-500/20">
          <Wifi className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-400">
            Messages will be sent automatically when connection is restored
          </span>
        </div>
      )}
    </div>
  )
}

// Hook to use the offline queue functionality
export function useOfflineQueue() {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([])

  const addToQueue = (content: string) => {
    const newMessage: QueuedMessage = {
      id: Date.now().toString(),
      content,
      timestamp: new Date().toISOString(),
      retryCount: 0
    }
    setQueuedMessages(prev => [...prev, newMessage])
  }

  const clearQueue = () => {
    setQueuedMessages([])
  }

  return {
    queuedMessages,
    addToQueue,
    clearQueue
  }
}