/**
 * Remote Chat Integration Hook
 * 
 * Integrates remote message processing with the local chat interface
 * Handles message routing between local and remote modes
 */

import { useEffect, useCallback, useState } from 'react';
import { useRemoteConnection } from './useRemoteConnection';
import { Message } from '../types/chat';

export interface RemoteChatState {
  isProcessingRemote: boolean;
  remoteMessageCount: number;
  lastRemoteMessage?: Date;
}

export interface RemoteChatActions {
  sendToRemote: (message: string) => Promise<void>;
  getRemoteStatus: () => string;
}

export function useRemoteChat(
  onNewMessage: (message: Message) => void
): RemoteChatState & RemoteChatActions {
  const [state, setState] = useState<RemoteChatState>({
    isProcessingRemote: false,
    remoteMessageCount: 0
  });

  const {
    mode,
    isConnected,
    isAuthenticated,
    serviceStatus
  } = useRemoteConnection();

  // Monitor for remote messages being processed
  useEffect(() => {
    if (mode !== 'remote' || !isConnected) return;

    const checkRemoteActivity = () => {
      if (serviceStatus?.processorStatus.activeStreams.length > 0) {
        setState(prev => ({
          ...prev,
          isProcessingRemote: true
        }));
      } else {
        setState(prev => ({
          ...prev,
          isProcessingRemote: false
        }));
      }
    };

    const interval = setInterval(checkRemoteActivity, 1000);
    return () => clearInterval(interval);
  }, [mode, isConnected, serviceStatus]);

  const sendToRemote = useCallback(async (message: string) => {
    if (mode !== 'remote' || !isConnected || !isAuthenticated) {
      throw new Error('Remote mode not available');
    }

    // In remote mode, messages are handled by the remote web interface
    // The local system will receive them via the polling service
    // For now, we'll add a placeholder message indicating remote processing
    const remoteMessage: Message = {
      id: `remote-outbound-${Date.now()}`,
      content: `🌐 Sent to remote: ${message}`,
      role: 'user',
      timestamp: new Date(),
      isRemote: true
    };

    onNewMessage(remoteMessage);

    setState(prev => ({
      ...prev,
      remoteMessageCount: prev.remoteMessageCount + 1,
      lastRemoteMessage: new Date()
    }));
  }, [mode, isConnected, isAuthenticated, onNewMessage]);

  const getRemoteStatus = useCallback(() => {
    if (mode === 'local') return 'Local Mode';
    if (!isAuthenticated) return 'Not Authenticated';
    if (!isConnected) return 'Disconnected';
    if (state.isProcessingRemote) return 'Processing Remote Message';
    return 'Remote Ready';
  }, [mode, isAuthenticated, isConnected, state.isProcessingRemote]);

  return {
    ...state,
    sendToRemote,
    getRemoteStatus
  };
}