'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ToolExecution } from '@/types'

export function useToolExecutions(sessionId?: string) {
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch tool executions for the session
  const fetchToolExecutions = useCallback(async () => {
    if (!sessionId) return

    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('tool_executions')
        .select(`
          *,
          chat_messages!inner(session_id)
        `)
        .eq('chat_messages.session_id', sessionId)
        .order('created_at', { ascending: true })

      if (error) throw error
      setToolExecutions(data || [])
    } catch (err) {
      console.error('Error fetching tool executions:', err)
      setError('Failed to load tool executions')
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  // Cancel a tool execution
  const cancelToolExecution = useCallback(async (executionId: string) => {
    try {
      const { error } = await supabase
        .from('tool_executions')
        .update({ 
          status: 'failed',
          error_message: 'Cancelled by user',
          completed_at: new Date().toISOString()
        })
        .eq('id', executionId)

      if (error) throw error
    } catch (err) {
      console.error('Error cancelling tool execution:', err)
      setError('Failed to cancel tool execution')
    }
  }, [])

  // Set up real-time subscriptions for tool executions
  useEffect(() => {
    if (!sessionId) return

    const subscription = supabase
      .channel(`tool_executions:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tool_executions'
        },
        async (payload) => {
          // Check if this tool execution belongs to our session
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const { data: messageData } = await supabase
              .from('chat_messages')
              .select('session_id')
              .eq('id', payload.new.message_id)
              .single()

            if (messageData?.session_id === sessionId) {
              if (payload.eventType === 'INSERT') {
                setToolExecutions(prev => [...prev, payload.new as ToolExecution])
              } else if (payload.eventType === 'UPDATE') {
                setToolExecutions(prev =>
                  prev.map(execution =>
                    execution.id === payload.new.id ? payload.new as ToolExecution : execution
                  )
                )
              }
            }
          } else if (payload.eventType === 'DELETE') {
            setToolExecutions(prev =>
              prev.filter(execution => execution.id !== payload.old.id)
            )
          }
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [sessionId])

  // Initial fetch
  useEffect(() => {
    fetchToolExecutions()
  }, [fetchToolExecutions])

  return {
    toolExecutions,
    isLoading,
    error,
    cancelToolExecution,
    refetch: fetchToolExecutions
  }
}