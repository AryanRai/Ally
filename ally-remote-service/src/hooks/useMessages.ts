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

    console.log('📤 useMessages: Sending message:', { content, sessionId, metadata });

    try {
      const requestBody = {
        content,
        session_id: sessionId,
        metadata,
      };

      console.log('📡 useMessages: Making API request to /api/messages with body:', requestBody);

      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('📡 useMessages: API response status:', response.status, response.ok);

      const data = await response.json();
      console.log('📊 useMessages: API response data:', data);

      if (!response.ok) {
        console.error('❌ useMessages: API request failed:', data);
        throw new Error(data.error || 'Failed to send message');
      }

      // Add message to local state immediately
      const newMessage: Message = data.message;
      console.log('✅ useMessages: Adding message to local state:', newMessage);
      
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, newMessage],
      }));

      // Reload sessions to update counts
      loadSessions();

      const result = {
        messageId: data.message.id,
        sessionId: data.session_id,
      };

      console.log('🎉 useMessages: Message sent successfully:', result);
      return result;
    } catch (error) {
      console.error('❌ useMessages: Error sending message:', error);
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

    console.log('🔄 useMessages: Setting up real-time subscription for user:', user.id);

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
          console.log('📡 useMessages: Real-time update received:', payload);
          const { eventType, new: newRecord, old: oldRecord } = payload;
          
          if (eventType === 'INSERT' && newRecord) {
            console.log('➕ useMessages: INSERT event for message:', newRecord.id);
            setState(prev => {
              // Only add if it's for the current session
              if (prev.currentSession?.id === newRecord.session_id) {
                const exists = prev.messages.some(m => m.id === newRecord.id);
                if (!exists) {
                  console.log('✅ useMessages: Adding new message to state:', newRecord.id);
                  return {
                    ...prev,
                    messages: [...prev.messages, newRecord as Message],
                  };
                } else {
                  console.log('⚠️ useMessages: Message already exists, skipping:', newRecord.id);
                }
              } else {
                console.log('⚠️ useMessages: Message not for current session, skipping:', newRecord.session_id);
              }
              return prev;
            });
          }
          
          if (eventType === 'UPDATE' && newRecord) {
            console.log('🔄 useMessages: UPDATE event for message:', newRecord.id);
            setState(prev => {
              const updated = prev.messages.map(m =>
                m.id === newRecord.id ? (newRecord as Message) : m
              );
              console.log('✅ useMessages: Updated message in state:', newRecord.id);
              return {
                ...prev,
                messages: updated,
              };
            });
          }
          
          if (eventType === 'DELETE' && oldRecord) {
            console.log('🗑️ useMessages: DELETE event for message:', oldRecord.id);
            setState(prev => ({
              ...prev,
              messages: prev.messages.filter(m => m.id !== oldRecord.id),
            }));
          }
        }
      )
      .subscribe();

    return () => {
      console.log('🔌 useMessages: Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

  // Add polling for processing messages to ensure updates are received
  useEffect(() => {
    if (!user || !state.currentSession) return;

    const pollForUpdates = async () => {
      try {
        // Check for any processing messages that might need updates
        const processingMessages = state.messages.filter(m => 
          m.status === 'processing' || m.status === 'pending'
        );

        if (processingMessages.length > 0) {
          console.log('🔄 useMessages: Polling for updates on processing messages:', processingMessages.length);
          
          // Reload messages to get latest updates
          const response = await fetch(`/api/messages?session_id=${state.currentSession.id}`);
          if (response.ok) {
            const data = await response.json();
            setState(prev => ({
              ...prev,
              messages: data.messages,
            }));
          }
        }
      } catch (error) {
        console.error('❌ useMessages: Error polling for updates:', error);
      }
    };

    // Poll every 2 seconds when there are processing messages
    const interval = setInterval(pollForUpdates, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [user, state.currentSession, state.messages]);

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