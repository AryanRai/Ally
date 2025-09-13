/**
 * Remote Chat Sync Hook
 * 
 * React hook for managing remote chat synchronization
 * Provides real-time sync between glass-pip-chat and ally-remote-service
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  RemoteChatSyncService, 
  createRemoteChatSyncService,
  RemoteSyncStatus,
  ProcessingUpdate
} from '../services/remoteChatSyncService';
import { Message } from '../types/chat';

export interface RemoteChatSyncConfig {
  systemId?: string;
  systemName?: string;
  enabled?: boolean;
  autoStart?: boolean;
}

export interface RemoteChatSyncState {
  isActive: boolean;
  status: RemoteSyncStatus | null;
  processingUpdates: ProcessingUpdate[];
  syncedSessions: number;
  lastSyncTime: number | null;
  error: string | null;
}

export interface RemoteChatSyncActions {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  sendToRemote: (content: string, sessionId?: string) => Promise<{ messageId: string; sessionId: string }>;
  getProcessingUpdate: (messageId: string) => ProcessingUpdate | undefined;
  clearError: () => void;
}

export function useRemoteChatSync(
  config: RemoteChatSyncConfig = {},
  onRemoteMessage?: (message: Message) => void,
  onRemoteResponse?: (message: Message) => void
): [RemoteChatSyncState, RemoteChatSyncActions] {
  
  // Configuration with defaults
  const finalConfig = {
    systemId: config.systemId || `glass-pip-${Date.now()}`,
    systemName: config.systemName || 'Glass PiP Chat',
    enabled: config.enabled ?? true,
    autoStart: config.autoStart ?? true
  };

  // State
  const [state, setState] = useState<RemoteChatSyncState>({
    isActive: false,
    status: null,
    processingUpdates: [],
    syncedSessions: 0,
    lastSyncTime: null,
    error: null
  });

  // Service reference
  const serviceRef = useRef<RemoteChatSyncService | null>(null);
  const configRef = useRef(finalConfig);

  // Update config ref when config changes
  useEffect(() => {
    configRef.current = finalConfig;
  }, [finalConfig.systemId, finalConfig.systemName, finalConfig.enabled]);

  // Initialize service
  useEffect(() => {
    if (!finalConfig.enabled) return;

    console.log('🔧 useRemoteChatSync: Initializing service with config:', finalConfig);

    try {
      serviceRef.current = createRemoteChatSyncService({
        systemId: finalConfig.systemId,
        systemName: finalConfig.systemName,
        onRemoteMessage: (message: Message) => {
          console.log('📨 useRemoteChatSync: Remote message received:', message.id);
          onRemoteMessage?.(message);
        },
        onRemoteResponse: (message: Message) => {
          console.log('📝 useRemoteChatSync: Remote response received:', message.id);
          onRemoteResponse?.(message);
        },
        onStatusChange: (status: RemoteSyncStatus) => {
          console.log('🔄 useRemoteChatSync: Status changed:', status.type, status.message);
          setState(prev => ({
            ...prev,
            status,
            error: status.type === 'error' ? status.message : null
          }));
        },
        onProcessingUpdate: (update: ProcessingUpdate) => {
          console.log('⚙️ useRemoteChatSync: Processing update:', update.messageId, update.status);
          setState(prev => {
            const existingIndex = prev.processingUpdates.findIndex(u => u.messageId === update.messageId);
            const newUpdates = [...prev.processingUpdates];
            
            if (existingIndex >= 0) {
              newUpdates[existingIndex] = update;
            } else {
              newUpdates.push(update);
            }
            
            // Remove completed updates after a delay
            const activeUpdates = newUpdates.filter(u => 
              u.status !== 'completed' || (Date.now() - u.timestamp) < 5000
            );
            
            return {
              ...prev,
              processingUpdates: activeUpdates
            };
          });
        }
      });

      console.log('✅ useRemoteChatSync: Service initialized');
    } catch (error) {
      console.error('❌ useRemoteChatSync: Failed to initialize service:', error);
      setState(prev => ({
        ...prev,
        error: `Failed to initialize: ${(error as Error).message}`
      }));
    }

    return () => {
      if (serviceRef.current) {
        serviceRef.current.stop();
        serviceRef.current = null;
      }
    };
  }, [finalConfig.enabled, finalConfig.systemId, finalConfig.systemName, onRemoteMessage, onRemoteResponse]);

  // Auto-start if enabled
  useEffect(() => {
    if (finalConfig.enabled && finalConfig.autoStart && serviceRef.current && !state.isActive) {
      console.log('🚀 useRemoteChatSync: Auto-starting service');
      start();
    }
  }, [finalConfig.enabled, finalConfig.autoStart, state.isActive]);

  // Update state from service status
  useEffect(() => {
    if (!serviceRef.current) return;

    const updateStateFromService = () => {
      const serviceStatus = serviceRef.current?.getStatus();
      if (serviceStatus) {
        setState(prev => ({
          ...prev,
          isActive: serviceStatus.isActive,
          syncedSessions: serviceStatus.syncedSessions,
          lastSyncTime: serviceStatus.lastSyncTimestamp || null
        }));
      }
    };

    // Update immediately
    updateStateFromService();

    // Update periodically
    const interval = setInterval(updateStateFromService, 2000);

    return () => clearInterval(interval);
  }, [serviceRef.current]);

  // Actions
  const start = useCallback(async () => {
    if (!serviceRef.current) {
      throw new Error('Service not initialized');
    }

    try {
      console.log('🚀 useRemoteChatSync: Starting service');
      await serviceRef.current.start();
      
      setState(prev => ({
        ...prev,
        isActive: true,
        error: null
      }));
      
      console.log('✅ useRemoteChatSync: Service started successfully');
    } catch (error) {
      console.error('❌ useRemoteChatSync: Failed to start service:', error);
      setState(prev => ({
        ...prev,
        error: `Failed to start: ${(error as Error).message}`
      }));
      throw error;
    }
  }, []);

  const stop = useCallback(async () => {
    if (!serviceRef.current) return;

    try {
      console.log('🛑 useRemoteChatSync: Stopping service');
      await serviceRef.current.stop();
      
      setState(prev => ({
        ...prev,
        isActive: false,
        processingUpdates: [],
        error: null
      }));
      
      console.log('✅ useRemoteChatSync: Service stopped successfully');
    } catch (error) {
      console.error('❌ useRemoteChatSync: Failed to stop service:', error);
      setState(prev => ({
        ...prev,
        error: `Failed to stop: ${(error as Error).message}`
      }));
    }
  }, []);

  const sendToRemote = useCallback(async (content: string, sessionId?: string) => {
    if (!serviceRef.current) {
      throw new Error('Service not initialized');
    }

    if (!state.isActive) {
      throw new Error('Service not active');
    }

    try {
      console.log('📤 useRemoteChatSync: Sending message to remote:', content.substring(0, 50));
      const result = await serviceRef.current.sendToRemote(content, sessionId);
      console.log('✅ useRemoteChatSync: Message sent successfully:', result.messageId);
      return result;
    } catch (error) {
      console.error('❌ useRemoteChatSync: Failed to send message:', error);
      throw error;
    }
  }, [state.isActive]);

  const getProcessingUpdate = useCallback((messageId: string) => {
    return serviceRef.current?.getProcessingUpdate(messageId);
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return [
    state,
    {
      start,
      stop,
      sendToRemote,
      getProcessingUpdate,
      clearError
    }
  ];
}

// Helper hook for processing status
export function useProcessingStatus(messageId: string) {
  const [, actions] = useRemoteChatSync({ enabled: false }); // Don't auto-initialize
  
  return actions.getProcessingUpdate(messageId);
}

// Helper hook for remote mode detection
export function useRemoteMode(): boolean {
  const [state] = useRemoteChatSync({ enabled: false }); // Don't auto-initialize
  
  return state.isActive;
}