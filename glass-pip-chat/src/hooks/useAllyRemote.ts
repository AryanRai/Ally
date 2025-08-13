import { useState, useEffect, useCallback, useRef } from 'react';
import { AllyRemoteClient } from '../services/allyRemoteClient';
import { REMOTE_CONFIG } from '../config/remote';

interface UseAllyRemoteOptions {
  serverUrl?: string;
  allyName?: string;
  autoConnect?: boolean;
}

interface AllyRemoteState {
  connected: boolean;
  status: string;
  token: string | null;
  error: string | null;
}

export const useAllyRemote = (options: UseAllyRemoteOptions = {}) => {
  const [state, setState] = useState<AllyRemoteState>({
    connected: false,
    status: 'Disconnected',
    token: null,
    error: null
  });

  const clientRef = useRef<AllyRemoteClient | null>(null);
  const [incomingMessages, setIncomingMessages] = useState<string[]>([]);

  // Initialize client
  useEffect(() => {
    if (!clientRef.current) {
      clientRef.current = new AllyRemoteClient({
        serverUrl: options.serverUrl,
        name: options.allyName || REMOTE_CONFIG.DEFAULT_ALLY_NAME
      });

      // Set up message handler
      clientRef.current.setMessageHandler((message: string) => {
        setIncomingMessages(prev => [...prev, message]);
      });

      // Set up status handler
      clientRef.current.setStatusHandler((status: string) => {
        setState(prev => ({ ...prev, status }));
      });
    }

    // Auto-connect if enabled
    if (options.autoConnect && !state.connected) {
      connect();
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, [options.serverUrl, options.allyName, options.autoConnect]);

  const connect = useCallback(async () => {
    if (!clientRef.current) return;

    setState(prev => ({ ...prev, status: 'Connecting...', error: null }));

    try {
      const success = await clientRef.current.initialize();
      if (success) {
        const connectionStatus = clientRef.current.getConnectionStatus();
        setState(prev => ({
          ...prev,
          connected: connectionStatus.connected,
          token: connectionStatus.token,
          status: 'Connected',
          error: null
        }));
      } else {
        setState(prev => ({
          ...prev,
          connected: false,
          status: 'Connection failed',
          error: 'Failed to connect to remote server'
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        connected: false,
        status: 'Connection error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      setState(prev => ({
        ...prev,
        connected: false,
        status: 'Disconnected',
        token: null
      }));
    }
  }, []);

  const sendMessage = useCallback((message: string) => {
    if (clientRef.current && state.connected) {
      clientRef.current.sendMessageToRemote(message);
    }
  }, [state.connected]);

  const updateServerUrl = useCallback((url: string) => {
    if (clientRef.current) {
      clientRef.current.updateServerUrl(url);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setIncomingMessages([]);
  }, []);

  return {
    // State
    connected: state.connected,
    status: state.status,
    token: state.token,
    error: state.error,
    incomingMessages,

    // Actions
    connect,
    disconnect,
    sendMessage,
    updateServerUrl,
    clearMessages
  };
};