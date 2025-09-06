'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { streamingService, type StreamEvent } from '@/services/streamingService'

interface StreamingState {
  content: string
  isStreaming: boolean
  isComplete: boolean
  error?: string
}

export function useStreamingResponse(messageId: string) {
  const [streamingState, setStreamingState] = useState<StreamingState>({
    content: '',
    isStreaming: false,
    isComplete: false
  })
  
  const contentRef = useRef('')
  const isStreamingRef = useRef(false)

  const handleStreamEvent = useCallback((event: StreamEvent) => {
    if (event.messageId !== messageId) return

    switch (event.type) {
      case 'response_chunk':
        if (event.data.content) {
          contentRef.current = event.data.content
          isStreamingRef.current = true
          
          setStreamingState(prev => ({
            ...prev,
            content: event.data.content!,
            isStreaming: true,
            isComplete: false
          }))
        }
        break
        
      case 'status_change':
        if (event.data.status === 'completed') {
          isStreamingRef.current = false
          setStreamingState(prev => ({
            ...prev,
            isStreaming: false,
            isComplete: true
          }))
        } else if (event.data.status === 'processing') {
          setStreamingState(prev => ({
            ...prev,
            isStreaming: true,
            isComplete: false
          }))
        }
        break
        
      case 'error':
        isStreamingRef.current = false
        setStreamingState(prev => ({
          ...prev,
          isStreaming: false,
          isComplete: true,
          error: event.data.error
        }))
        break
    }
  }, [messageId])

  useEffect(() => {
    const unsubscribe = streamingService.subscribeToMessage(messageId, handleStreamEvent)
    
    return () => {
      unsubscribe()
    }
  }, [messageId, handleStreamEvent])

  // Reset state when messageId changes
  useEffect(() => {
    contentRef.current = ''
    isStreamingRef.current = false
    setStreamingState({
      content: '',
      isStreaming: false,
      isComplete: false
    })
  }, [messageId])

  return streamingState
}