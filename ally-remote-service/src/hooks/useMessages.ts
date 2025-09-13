'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from './useAuth';

export interface Message {
  id: string;
  session_id: string;
  user_id: string;
  content: string;
  response: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error_message?: string;
  metadata: Record<string, any>;
  is_remote: boolean;
  local_system_id: string;
  created_at: string;
  updated_at: string;
  processed_at?: string;
  completed_at?: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  metadata: Record<string, any>;
  is_remote: boolean;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

interface UseMessagesState {
  messages: Message[];
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  loading: boolean;
  error: string | null;
}

export function useMessages() {
  const { user } = useAuth();
  const supabase = createClient();
  
  const [state, setState] = useState<UseMessagesState>({
    messages: [],
    sessions: [],
    currentSession: null,
    loading: false,
    error: null,
  });

  // Load sessions
  const loadSessions = useCallback(async () => {
    if (!user) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch('/api/sessions');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load sessions');
      }

      setState(prev => ({
        ...prev,
        sessions: data.sessions,
        loading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load sessions',
        loading: false,
      }));
    }
  }, [user]);

  // Load messages for a session
  const loadMessages = useCallback(async (sessionId: string) => {
    if (!user) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(`/api/messages?session_id=${sessionId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load messages');
      }

      setState(prev => ({
        ...prev,
        messages: data.messages,
        loading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load messages',
        loading: false,
      }));
    }
  }, [user]);

  // Send a message
  const sendMessage = useCallback(async (
    content: string,
    sessionId?: string,
    metadata?: Record<string, any>
  ): Promise<{ messageId: string; sessionId: string }> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          session_id: sessionId,
          metadata,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      // Add message to local state immediately
      const newMessage: Message = data.message;
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, newMessage],
      }));

      // Reload sessions to update counts
      loadSessions();

      return {
        messageId: data.message.id,
        sessionId: data.session_id,
      };
    } catch (error) {
      throw error;
    }
  }, [user, loadSessions]);

  // Create a new session
  const createSession = useCallback(async (title: string): Promise<ChatSession> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create session');
      }

      const newSession = data.session;
      setState(prev => ({
        ...prev,
        sessions: [newSession, ...prev.sessions],
        currentSession: newSession,
      }));

      return newSession;
    } catch (error) {
      throw error;
    }
  }, [user]);

  // Delete a session
  const deleteSession = useCallback(async (sessionId: string) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const response = await fetch(`/api/sessions?session_id=${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete session');
      }

      setState(prev => ({
        ...prev,
        sessions: prev.sessions.filter(s => s.id !== sessionId),
        currentSession: prev.currentSession?.id === sessionId ? null : prev.currentSession,
        messages: prev.currentSession?.id === sessionId ? [] : prev.messages,
      }));
    } catch (error) {
      throw error;
    }
  }, [user]);

  // Set current session
  const setCurrentSession = useCallback((session: ChatSession | null) => {
    setState(prev => ({ ...prev, currentSession: session }));
    if (session) {
      loadMessages(session.id);
    } else {
      setState(prev => ({ ...prev, messages: [] }));
    }
  }, [loadMessages]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;
          
          if (eventType === 'INSERT' && newRecord) {
            setState(prev => {
              // Only add if it's for the current session
              if (prev.currentSession?.id === newRecord.session_id) {
                const exists = prev.messages.some(m => m.id === newRecord.id);
                if (!exists) {
                  return {
                    ...prev,
                    messages: [...prev.messages, newRecord as Message],
                  };
                }
              }
              return prev;
            });
          }
          
          if (eventType === 'UPDATE' && newRecord) {
            setState(prev => ({
              ...prev,
              messages: prev.messages.map(m =>
                m.id === newRecord.id ? (newRecord as Message) : m
              ),
            }));
          }
          
          if (eventType === 'DELETE' && oldRecord) {
            setState(prev => ({
              ...prev,
              messages: prev.messages.filter(m => m.id !== oldRecord.id),
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

  // Load initial data
  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user, loadSessions]);

  return {
    ...state,
    loadSessions,
    loadMessages,
    sendMessage,
    createSession,
    deleteSession,
    setCurrentSession,
  };
}