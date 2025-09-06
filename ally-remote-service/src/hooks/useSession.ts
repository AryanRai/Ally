'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface ChatSession {
  id: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
  last_activity: string
}

export function useSession() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  // Load user's chat sessions
  const loadSessions = async () => {
    if (!user) return

    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select(`
          id,
          title,
          created_at,
          updated_at,
          chat_messages(count)
        `)
        .eq('user_id', user.id)
        .eq('is_remote', true)
        .order('updated_at', { ascending: false })

      if (error) throw error

      const sessionsWithCount = data?.map(session => ({
        id: session.id,
        title: session.title,
        created_at: session.created_at,
        updated_at: session.updated_at,
        message_count: session.chat_messages?.[0]?.count || 0,
        last_activity: session.updated_at
      })) || []

      setSessions(sessionsWithCount)
    } catch (error: any) {
      setError(error.message)
      console.error('Error loading sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  // Create a new chat session
  const createSession = async (title?: string) => {
    if (!user) return null

    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title: title || `Chat ${new Date().toLocaleDateString()}`,
          is_remote: true,
          metadata: {
            created_from: 'web-interface',
            user_agent: navigator.userAgent
          }
        })
        .select()
        .single()

      if (error) throw error

      const newSession: ChatSession = {
        id: data.id,
        title: data.title,
        created_at: data.created_at,
        updated_at: data.updated_at,
        message_count: 0,
        last_activity: data.created_at
      }

      setSessions(prev => [newSession, ...prev])
      setCurrentSession(newSession)
      
      return newSession
    } catch (error: any) {
      setError(error.message)
      console.error('Error creating session:', error)
      return null
    }
  }

  // Update session title
  const updateSessionTitle = async (sessionId: string, title: string) => {
    try {
      const { error } = await supabase
        .from('chat_sessions')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('user_id', user?.id)

      if (error) throw error

      setSessions(prev => 
        prev.map(session => 
          session.id === sessionId 
            ? { ...session, title, updated_at: new Date().toISOString() }
            : session
        )
      )

      if (currentSession?.id === sessionId) {
        setCurrentSession(prev => prev ? { ...prev, title } : null)
      }
    } catch (error: any) {
      setError(error.message)
      console.error('Error updating session title:', error)
    }
  }

  // Delete a session
  const deleteSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', user?.id)

      if (error) throw error

      setSessions(prev => prev.filter(session => session.id !== sessionId))
      
      if (currentSession?.id === sessionId) {
        setCurrentSession(null)
      }
    } catch (error: any) {
      setError(error.message)
      console.error('Error deleting session:', error)
    }
  }

  // Set current session
  const selectSession = (session: ChatSession) => {
    setCurrentSession(session)
  }

  // Load sessions when user changes
  useEffect(() => {
    if (user) {
      loadSessions()
    } else {
      setSessions([])
      setCurrentSession(null)
    }
  }, [user])

  return {
    sessions,
    currentSession,
    loading,
    error,
    createSession,
    updateSessionTitle,
    deleteSession,
    selectSession,
    loadSessions
  }
}