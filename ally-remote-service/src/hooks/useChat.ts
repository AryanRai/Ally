'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { streamingService, type StreamEvent } from '@/services/streamingService'
import type { Message, SendMessageRequest, SendMessageResponse } from '@/types'

export function useChat(sessionId?: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [streamingMessages, setStreamingMessages] = useState<Map<string, string>>(new Map())
  const streamingRef = useRef<Map<string, string>>(new Map())

  // Fetch messages for the session
  const fetchMessages = useCallback(async () => {
    if (!sessionId) return

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (error) throw error
      setMessages(data || [])
    } catch (err) {
      console.error('Error fetching messages:', err)
      setError('Failed to load messages')
    }
  }, [sessionId])

  // Send a new message
  const sendMessage = useCallback(async (content: string): Promise<SendMessageResponse> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          sessionId,
          metadata: {}
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send message')
      }

      const result = await response.json()
      return result
    } catch (err) {
      console.error('Error sending message:', err)
      setError(err instanceof Error ? err.message : 'Failed to send message')
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  // Handle streaming events
  const handleStreamEvent = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case 'response_chunk':
        if (event.data.content) {
          // Update streaming content for real-time display
          streamingRef.current.set(event.messageId, event.data.content)
          setStreamingMessages(new Map(streamingRef.current))
        }
        break
        
      case 'status_change':
        setMessages(prev => 
          prev.map(msg => 
            msg.id === event.messageId 
              ? { ...msg, status: event.data.status as any }
              : msg
          )
        )
        
        // Clear streaming content when completed
        if (event.data.status === 'completed') {
          streamingRef.current.delete(event.messageId)
          setStreamingMessages(new Map(streamingRef.current))
        }
        break
        
      case 'error':
        setMessages(prev => 
          prev.map(msg => 
            msg.id === event.messageId 
              ? { ...msg, status: 'error', error_message: event.data.error }
              : msg
          )
        )
        break
    }
  }, [])

  // Set up real-time subscriptions
  useEffect(() => {
    if (!sessionId) return

    // Subscribe to database changes for new messages
    const messageSubscription = supabase
      .channel(`messages:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          const newMessage = payload.new as Message
          setMessages(prev => {
            // Avoid duplicates
            if (prev.some(msg => msg.id === newMessage.id)) {
              return prev
            }
            return [...prev, newMessage]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          const updatedMessage = payload.new as Message
          setMessages(prev => 
            prev.map(msg => 
              msg.id === updatedMessage.id ? updatedMessage : msg
            )
          )
        }
      )
      .subscribe()

    // Subscribe to streaming events
    const unsubscribeStreaming = streamingService.subscribeToSession(
      sessionId,
      handleStreamEvent
    )

    return () => {
      messageSubscription.unsubscribe()
      unsubscribeStreaming()
    }
  }, [sessionId, handleStreamEvent])

  // Check connection status
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const { data, error } = await supabase
          .from('local_systems')
          .select('status')
          .eq('status', 'online')
          .limit(1)

        if (error) throw error
        setIsConnected((data?.length || 0) > 0)
      } catch (err) {
        console.error('Error checking connection:', err)
        setIsConnected(false)
      }
    }

    checkConnection()
    const interval = setInterval(checkConnection, 10000) // Check every 10 seconds

    return () => clearInterval(interval)
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  return {
    messages,
    isLoading,
    error,
    isConnected,
    sendMessage,
    refetch: fetchMessages,
    streamingMessages
  }
}