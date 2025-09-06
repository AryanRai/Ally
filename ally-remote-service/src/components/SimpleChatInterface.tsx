'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Loader2, MessageSquare, Wifi, WifiOff } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: string
  isRemote?: boolean
}

export function SimpleChatInterface() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentSession, setCurrentSession] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState('Initializing...')
  const [glassConnected, setGlassConnected] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) {
      setConnectionStatus('Not authenticated')
      setCurrentSession(null)
      setMessages([])
      return
    }

    // Initialize session
    const initSession = async () => {
      try {
        setConnectionStatus('Creating session...')
        
        const sessionId = crypto.randomUUID()
        const { error } = await supabase
          .from('chat_sessions')
          .insert({
            id: sessionId,
            user_id: user.id,
            title: 'Web Chat Session',
            is_remote: true
          })

        if (error) {
          throw new Error(`Session creation failed: ${error.message}`)
        }

        setCurrentSession(sessionId)
        setConnectionStatus('Connected')
        
        // Check for glass-pip-chat connection
        checkGlassConnection()
      } catch (error) {
        console.error('Failed to create session:', error)
        setConnectionStatus('Connection failed')
      }
    }

    initSession()

    // Set up real-time subscription for messages
    const subscription = supabase
      .channel('chat-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages'
        },
        (payload) => {
          const newMessage = payload.new as any
          if (newMessage.user_id === user.id) {
            const message: Message = {
              id: newMessage.id,
              content: newMessage.response || newMessage.content,
              role: newMessage.response ? 'assistant' : 'user',
              timestamp: newMessage.created_at,
              isRemote: newMessage.is_remote
            }
            
            setMessages(prev => {
              if (prev.some(m => m.id === message.id)) return prev
              return [...prev, message].sort((a, b) => 
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
              )
            })
          }
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [user])

  const checkGlassConnection = async () => {
    try {
      const { data: systems } = await supabase
        .from('local_systems')
        .select('*')
        .eq('user_id', user?.id)
        .eq('status', 'online')

      const desktopSystems = systems?.filter(s => 
        s.name?.toLowerCase().includes('glass') || 
        s.name?.toLowerCase().includes('desktop') ||
        s.capabilities?.features?.includes('desktop-interface')
      ) || []

      setGlassConnected(desktopSystems.length > 0)
    } catch (error) {
      console.error('Failed to check glass connection:', error)
      setGlassConnected(false)
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || !currentSession || isLoading || !user) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: input.trim(),
      role: 'user',
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          id: userMessage.id,
          session_id: currentSession,
          user_id: user.id,
          content: userMessage.content,
          response: '',
          status: 'pending',
          is_remote: true,
          local_system_id: 'web-system'
        })

      if (error) {
        throw new Error(`Failed to send message: ${error.message}`)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      
      // Add error message
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        content: 'Failed to send message. Please try again.',
        role: 'assistant',
        timestamp: new Date().toISOString()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Connection Status */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-5 h-5 text-blue-400" />
          <span className="text-sm text-gray-300">Ally Remote Chat</span>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === 'Connected' ? 'bg-green-400' : 
              connectionStatus === 'Initializing...' || connectionStatus === 'Creating session...' ? 'bg-yellow-400' : 'bg-red-400'
            }`} />
            <span className="text-xs text-gray-400">{connectionStatus}</span>
          </div>
          <div className="flex items-center space-x-2">
            {glassConnected ? (
              <Wifi className="w-4 h-4 text-green-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-gray-400" />
            )}
            <span className="text-xs text-gray-400">
              {glassConnected ? 'Glass Connected' : 'Glass Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-8">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Start a conversation with your Ally system</p>
            <p className="text-sm mt-2">
              {glassConnected 
                ? 'Messages will sync with glass-pip-chat automatically' 
                : 'Start glass-pip-chat to enable desktop sync'
              }
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
            />
          ))
        )}

        {isLoading && (
          <div className="flex items-center space-x-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Sending to Ally system...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-end space-x-3">
          <div className="flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={1}
              style={{ minHeight: '44px', maxHeight: '120px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = Math.min(target.scrollHeight, 120) + 'px'
              }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !currentSession}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg p-3 transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>

        <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <div className="flex items-center space-x-1">
            <span>Web Interface v2.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}