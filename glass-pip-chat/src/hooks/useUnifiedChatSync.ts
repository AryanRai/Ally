/**
 * Unified Chat Sync Hook
 * 
 * React hook for managing bidirectional chat sync and real-time streaming
 * Integrates with glass-pip-chat UI components
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { UnifiedChatSyncManager, UnifiedSyncConfig, UnifiedSyncStatus, ChatSyncEvents } from '../services/unifiedChatSyncManager';
import { LocalChatSession, LocalChatMessage } from '../services/bidirectionalChatSync';
import { StreamChunk } from '../services/realTimeStreamingService';
import { UnifiedMessage } from '../../../shared-types';
import { useRemoteConnection } from './useRemoteConnection';

export interface ChatSyncHookState {
  isActive: boolean;
  status: UnifiedSyncStatus | null;
  localSessions: LocalChatSession[];
  activeStreams: any[];
  statistics: any;
  errors: string[];
  isLoading: boolean;
}

export interface StreamingMessage {
  messageId: string;
  content: string;
  chunks: StreamChunk[];
  isComplete: boolean;
  startTime: number;
  endTime?: number;
}

export interface ChatSyncHookActions {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  addLocalSession: (session: LocalChatSession) => void;
  updateLocalSession: (sessionId: string, messages: LocalChatMessage[]) => void;
  forceSyncNow: () => Promise<void>;
  simulateStream: (messageId: string, content: string) => Promise<void>;
  testConnectivity: () => Promise<any>;
  clearErrors: () => void;
  convertGlassPipChatSession: (sessionId: string, title: string, messages: any[]) => LocalChatSession;
}

export function useUnifiedChatSync(
  config?: Partial<UnifiedSyncConfig>
): ChatSyncHookState & ChatSyncHookActions {
  const { mode, isConnected, isAuthenticated } = useRemoteConnection();
  
  const [state, setState] = useState<ChatSyncHookState>({
    isActive: false,
    status: null,
    localSessions: [],
    activeStreams: [],
    statistics: null,
    errors: [],
    isLoading: false
  });

  const [streamingMessages, setStreamingMessages] = useState<Map<string, StreamingMessage>>(new Map());
  const syncManagerRef = useRef<UnifiedChatSyncManager | null>(null);

  // Default config
  const defaultConfig: UnifiedSyncConfig = {
    systemId: `glass-pip-chat-${Date.now()}`,
    systemName: 'Glass PiP Chat Desktop',
    syncInterval: 30000, // 30 seconds
    realTimeEnabled: true,
    batchSize: 50,
    streamingEnabled: true,
    ...config
  };

  // Initialize sync manager
  useEffect(() => {
    if (!syncManagerRef.current) {
      console.log('🔧 useUnifiedChatSync: Initializing sync manager with config:', defaultConfig);
      syncManagerRef.current = new UnifiedChatSyncManager(defaultConfig);
      
      // Set up event handlers
      syncManagerRef.current.setEventHandlers({
        onRemoteMessageReceived: (message: UnifiedMessage) => {
          console.log('📨 useUnifiedChatSync: Remote message received:', message);
        },
        
        onSyncStatusChanged: (syncStatus) => {
          console.log('🔄 useUnifiedChatSync: Sync status changed:', syncStatus);
          updateStatus();
        },
        
        onStreamStart: (messageId: string, content: string) => {
          console.log('🎬 useUnifiedChatSync: Stream started:', messageId);
          setStreamingMessages(prev => {
            const newMap = new Map(prev);
            newMap.set(messageId, {
              messageId,
              content,
              chunks: [],
              isComplete: false,
              startTime: Date.now()
            });
            return newMap;
          });
        },
        
        onStreamChunk: (messageId: string, chunk: StreamChunk) => {
          console.log('📝 useUnifiedChatSync: Stream chunk:', messageId, chunk.content.substring(0, 50));
          setStreamingMessages(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(messageId);
            if (existing) {
              existing.chunks.push(chunk);
              newMap.set(messageId, { ...existing });
            }
            return newMap;
          });
        },
        
        onStreamComplete: (messageId: string, finalContent: string) => {
          console.log('🏁 useUnifiedChatSync: Stream completed:', messageId);
          setStreamingMessages(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(messageId);
            if (existing) {
              existing.isComplete = true;
              existing.endTime = Date.now();
              newMap.set(messageId, { ...existing });
            }
            return newMap;
          });
          
          // Remove completed stream after a delay
          setTimeout(() => {
            setStreamingMessages(prev => {
              const newMap = new Map(prev);
              newMap.delete(messageId);
              return newMap;
            });
          }, 5000);
        },
        
        onStreamError: (messageId: string, error: string) => {
          console.log('❌ useUnifiedChatSync: Stream error:', messageId, error);
          setState(prev => ({
            ...prev,
            errors: [...prev.errors, `Stream error for ${messageId}: ${error}`]
          }));
        },
        
        onUnifiedStatusChanged: (status: UnifiedSyncStatus) => {
          console.log('📊 useUnifiedChatSync: Unified status changed:', status);
          setState(prev => ({
            ...prev,
            status,
            localSessions: syncManagerRef.current?.getLocalSessions() || [],
            activeStreams: syncManagerRef.current?.getActiveStreams() || [],
            statistics: syncManagerRef.current?.getSyncStatistics() || null
          }));
        }
      });
    }
  }, []);

  // Update status helper
  const updateStatus = useCallback(() => {
    if (syncManagerRef.current) {
      const status = syncManagerRef.current.getStatus();
      const localSessions = syncManagerRef.current.getLocalSessions();
      const activeStreams = syncManagerRef.current.getActiveStreams();
      const statistics = syncManagerRef.current.getSyncStatistics();
      
      setState(prev => ({
        ...prev,
        status,
        localSessions,
        activeStreams,
        statistics
      }));
    }
  }, []);

  // Auto-start when in remote mode and authenticated
  useEffect(() => {
    if (mode === 'remote' && isAuthenticated && isConnected && !state.isActive) {
      console.log('🚀 useUnifiedChatSync: Auto-starting sync in remote mode');
      start().catch(error => {
        console.error('Failed to auto-start sync:', error);
      });
    } else if (mode === 'local' && state.isActive) {
      console.log('🛑 useUnifiedChatSync: Auto-stopping sync in local mode');
      stop().catch(error => {
        console.error('Failed to auto-stop sync:', error);
      });
    }
  }, [mode, isAuthenticated, isConnected]);

  // Actions
  const start = useCallback(async () => {
    if (!syncManagerRef.current || state.isActive) return;
    
    console.log('🚀 useUnifiedChatSync: Starting unified chat sync');
    setState(prev => ({ ...prev, isLoading: true, errors: [] }));
    
    try {
      await syncManagerRef.current.start();
      setState(prev => ({ 
        ...prev, 
        isActive: true, 
        isLoading: false 
      }));
      updateStatus();
      console.log('✅ useUnifiedChatSync: Started successfully');
    } catch (error) {
      console.error('❌ useUnifiedChatSync: Failed to start:', error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        errors: [...prev.errors, `Start failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      }));
      throw error;
    }
  }, [state.isActive, updateStatus]);

  const stop = useCallback(async () => {
    if (!syncManagerRef.current || !state.isActive) return;
    
    console.log('🛑 useUnifiedChatSync: Stopping unified chat sync');
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      await syncManagerRef.current.stop();
      setState(prev => ({ 
        ...prev, 
        isActive: false, 
        isLoading: false,
        status: null,
        activeStreams: [],
        statistics: null
      }));
      setStreamingMessages(new Map());
      console.log('✅ useUnifiedChatSync: Stopped successfully');
    } catch (error) {
      console.error('❌ useUnifiedChatSync: Failed to stop:', error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        errors: [...prev.errors, `Stop failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      }));
    }
  }, [state.isActive]);

  const addLocalSession = useCallback((session: LocalChatSession) => {
    if (!syncManagerRef.current) return;
    
    console.log('📝 useUnifiedChatSync: Adding local session:', session.id);
    syncManagerRef.current.addLocalSession(session);
    updateStatus();
  }, [updateStatus]);

  const updateLocalSession = useCallback((sessionId: string, messages: LocalChatMessage[]) => {
    if (!syncManagerRef.current) return;
    
    console.log('🔄 useUnifiedChatSync: Updating local session:', sessionId);
    syncManagerRef.current.updateLocalSession(sessionId, messages);
    updateStatus();
  }, [updateStatus]);

  const forceSyncNow = useCallback(async () => {
    if (!syncManagerRef.current) return;
    
    console.log('⚡ useUnifiedChatSync: Forcing immediate sync');
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      await syncManagerRef.current.forceSyncNow();
      updateStatus();
      setState(prev => ({ ...prev, isLoading: false }));
      console.log('✅ useUnifiedChatSync: Force sync completed');
    } catch (error) {
      console.error('❌ useUnifiedChatSync: Force sync failed:', error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        errors: [...prev.errors, `Force sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      }));
    }
  }, [updateStatus]);

  const simulateStream = useCallback(async (messageId: string, content: string) => {
    if (!syncManagerRef.current) return;
    
    console.log('🎭 useUnifiedChatSync: Simulating stream:', messageId);
    await syncManagerRef.current.simulateStream(messageId, content);
  }, []);

  const testConnectivity = useCallback(async () => {
    if (!syncManagerRef.current) return null;
    
    console.log('🔍 useUnifiedChatSync: Testing connectivity');
    return await syncManagerRef.current.testConnectivity();
  }, []);

  const clearErrors = useCallback(() => {
    console.log('🧹 useUnifiedChatSync: Clearing errors');
    setState(prev => ({ ...prev, errors: [] }));
    if (syncManagerRef.current) {
      syncManagerRef.current.clearErrors();
    }
  }, []);

  const convertGlassPipChatSession = useCallback((
    sessionId: string, 
    title: string, 
    messages: any[]
  ): LocalChatSession => {
    if (!syncManagerRef.current) {
      throw new Error('Sync manager not initialized');
    }
    
    console.log('🔄 useUnifiedChatSync: Converting glass-pip-chat session:', sessionId);
    const session = syncManagerRef.current.convertGlassPipChatToLocalSession(sessionId, title, messages);
    updateStatus();
    return session;
  }, [updateStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncManagerRef.current && state.isActive) {
        syncManagerRef.current.stop().catch(error => {
          console.error('Failed to stop sync manager on unmount:', error);
        });
      }
    };
  }, []);

  return {
    // State
    ...state,
    
    // Actions
    start,
    stop,
    addLocalSession,
    updateLocalSession,
    forceSyncNow,
    simulateStream,
    testConnectivity,
    clearErrors,
    convertGlassPipChatSession,
    
    // Additional computed state
    streamingMessages: Array.from(streamingMessages.values()),
    isRemoteMode: mode === 'remote',
    canSync: mode === 'remote' && isAuthenticated && isConnected
  };
}