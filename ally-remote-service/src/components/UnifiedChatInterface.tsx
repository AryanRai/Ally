'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Loader2, Zap, MessageSquare } from 'lucide-react'
import { getUnifiedIntegrationAdapter } from '@/services/unifiedIntegrationAdapter'
import { MessageBubble } from './MessageBubble'
import { useAuth } from '@/contexts/AuthContext'

interface Message {
    id: string
    content: string
    role: 'user' | 'assistant'
    timestamp: number
    isRemote?: boolean
}

export function UnifiedChatInterface() {
    const { user } = useAuth()
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [currentSession, setCurrentSession] = useState<string | null>(null)
    const [connectionStatus, setConnectionStatus] = useState('Connecting...')
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const adapter = getUnifiedIntegrationAdapter()

    useEffect(() => {
        if (!user) {
            setConnectionStatus('Not authenticated')
            setCurrentSession(null)
            setMessages([])
            return
        }

        // Initialize session with delay to ensure auth is fully ready
        const initSession = async () => {
            try {
                setConnectionStatus('Initializing...')

                // Wait a bit for auth to be fully ready
                await new Promise(resolve => setTimeout(resolve, 1000))

                const session = await adapter.createChatSession('Remote Chat Session')
                setCurrentSession(session.id)
                setConnectionStatus('Connected')
            } catch (error) {
                console.error('Failed to create session:', error)
                setConnectionStatus('Connection failed')

                // Retry after a delay
                setTimeout(() => {
                    if (user) {
                        initSession()
                    }
                }, 3000)
            }
        }

        initSession()

        // Listen for incoming messages
        const unsubscribeMessages = adapter.onMessage((message) => {
            setMessages(prev => {
                // Avoid duplicates
                if (prev.some(m => m.id === message.id)) return prev

                const newMessage: Message = {
                    id: message.id,
                    content: message.content,
                    role: message.role || 'assistant',
                    timestamp: message.timestamp || Date.now(),
                    isRemote: message.metadata?.isRemote
                }

                return [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp)
            })
        })

        // Listen for stream events
        const unsubscribeStream = adapter.onStream((event) => {
            if (event.type === 'response_chunk' && event.data.content) {
                setMessages(prev => {
                    const existingIndex = prev.findIndex(m => m.id === event.messageId)
                    if (existingIndex >= 0) {
                        // Update existing message
                        const updated = [...prev]
                        updated[existingIndex] = {
                            ...updated[existingIndex],
                            content: updated[existingIndex].content + event.data.content
                        }
                        return updated
                    } else {
                        // Create new message
                        return [...prev, {
                            id: event.messageId || `stream-${Date.now()}`,
                            content: event.data.content,
                            role: 'assistant',
                            timestamp: Date.now(),
                            isRemote: true
                        }]
                    }
                })
            }
        })

        return () => {
            unsubscribeMessages()
            unsubscribeStream()
        }
    }, [user])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSend = async () => {
        if (!input.trim() || !currentSession || isLoading) return

        const userMessage: Message = {
            id: `user-${Date.now()}`,
            content: input.trim(),
            role: 'user',
            timestamp: Date.now()
        }

        setMessages(prev => [...prev, userMessage])
        setInput('')
        setIsLoading(true)

        try {
            await adapter.sendMessage({
                content: userMessage.content,
                sessionId: currentSession,
                metadata: { source: 'web' }
            })
        } catch (error) {
            console.error('Failed to send message:', error)

            // Add error message
            const errorMessage: Message = {
                id: `error-${Date.now()}`,
                content: 'Failed to send message. Please try again.',
                role: 'assistant',
                timestamp: Date.now()
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
                    <span className="text-sm text-gray-300">Unified Chat</span>
                </div>
                <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${connectionStatus === 'Connected' ? 'bg-green-400' :
                        connectionStatus === 'Connecting...' ? 'bg-yellow-400' : 'bg-red-400'
                        }`} />
                    <span className="text-xs text-gray-400">{connectionStatus}</span>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-400 mt-8">
                        <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Start a conversation with your Ally system</p>
                        <p className="text-sm mt-2">Messages will sync with glass-pip-chat automatically</p>
                    </div>
                ) : (
                    messages.map((message) => (
                        <MessageBubble
                            key={message.id}
                            message={{
                                id: message.id,
                                content: message.content,
                                role: message.role,
                                timestamp: new Date(message.timestamp).toISOString(),
                                isRemote: message.isRemote
                            }}
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
                        disabled={!input.trim() || isLoading}
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
                        <Zap className="w-3 h-3" />
                        <span>Powered by Unified Integration</span>
                    </div>
                </div>
            </div>
        </div>
    )
}