/**
 * Remote Connection Hook
 * 
 * Manages the connection between local glass-pip-chat and remote web interface
 * Handles authentication, connection status, and service management
 */

import { useState, useEffect, useCallback } from 'react';
import { remoteServiceManager, RemoteServiceStatus } from '../services/remoteServiceManager';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabase';

export interface RemoteConnectionState {
  mode: 'local' | 'remote';
  isConnected: boolean;
  isAuthenticated: boolean;
  user: User | null;
  serviceStatus: RemoteServiceStatus | null;
  connectionError: string | null;
  isLoading: boolean;
}

export interface RemoteConnectionActions {
  setMode: (mode: 'local' | 'remote') => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  startRemoteService: () => Promise<void>;
  stopRemoteService: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export function useRemoteConnection(): RemoteConnectionState & RemoteConnectionActions {
  const [state, setState] = useState<RemoteConnectionState>({
    mode: 'local',
    isConnected: false,
    isAuthenticated: false,
    user: null,
    serviceStatus: null,
    connectionError: null,
    isLoading: false
  });

  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(null);

  // Initialize Supabase client
  useEffect(() => {
    const client = getSupabaseClient();
    setSupabaseClient(client);

    // Check for existing session with error handling
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await client.auth.getSession();
        
        if (error) {
          console.warn('Session check error:', error.message);
          
          // Handle refresh token errors
          if (error.message.includes('refresh_token_not_found') || 
              error.message.includes('Invalid Refresh Token')) {
            console.log('Clearing invalid session...');
            await client.auth.signOut({ scope: 'local' });
            setState(prev => ({
              ...prev,
              isAuthenticated: false,
              user: null,
              connectionError: 'Session expired. Please sign in again.'
            }));
            return;
          }
        }
        
        if (session?.user) {
          setState(prev => ({
            ...prev,
            isAuthenticated: true,
            user: session.user,
            connectionError: null
          }));
        }
      } catch (error) {
        console.error('Session check failed:', error);
        setState(prev => ({
          ...prev,
          connectionError: 'Failed to check authentication status'
        }));
      }
    };

    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);
      
      setState(prev => ({
        ...prev,
        isAuthenticated: !!session?.user,
        user: session?.user || null,
        connectionError: event === 'SIGNED_OUT' ? null : prev.connectionError
      }));
      
      // Handle token refresh errors
      if (event === 'TOKEN_REFRESHED' && !session) {
        console.warn('Token refresh failed, signing out...');
        await client.auth.signOut({ scope: 'local' });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Monitor service status when in remote mode
  useEffect(() => {
    if (state.mode !== 'remote') return;

    const updateStatus = () => {
      try {
        const status = remoteServiceManager.getStatus();
        setState(prev => ({
          ...prev,
          serviceStatus: status,
          isConnected: status.isRunning && status.pollerStatus.isPolling
        }));
      } catch (error) {
        console.error('Failed to get service status:', error);
        setState(prev => ({
          ...prev,
          connectionError: 'Failed to get service status'
        }));
      }
    };

    updateStatus();
    const interval = setInterval(updateStatus, 5000);

    return () => clearInterval(interval);
  }, [state.mode]);

  const setMode = useCallback((mode: 'local' | 'remote') => {
    setState(prev => ({
      ...prev,
      mode,
      connectionError: null
    }));

    // Auto-start remote service when switching to remote mode
    if (mode === 'remote' && state.isAuthenticated) {
      startRemoteService();
    }
  }, [state.isAuthenticated]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabaseClient) {
      throw new Error('Supabase client not initialized');
    }

    setState(prev => ({ ...prev, isLoading: true, connectionError: null }));

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      setState(prev => ({
        ...prev,
        isAuthenticated: true,
        user: data.user,
        isLoading: false
      }));

      // Auto-start remote service after successful login
      if (state.mode === 'remote') {
        await startRemoteService();
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        connectionError: error instanceof Error ? error.message : 'Sign in failed',
        isLoading: false
      }));
      throw error;
    }
  }, [supabaseClient, state.mode]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabaseClient) {
      throw new Error('Supabase client not initialized');
    }

    setState(prev => ({ ...prev, isLoading: true, connectionError: null }));

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password
      });

      if (error) throw error;

      setState(prev => ({
        ...prev,
        isLoading: false
      }));

      // Note: User will need to verify email before being authenticated
    } catch (error) {
      setState(prev => ({
        ...prev,
        connectionError: error instanceof Error ? error.message : 'Sign up failed',
        isLoading: false
      }));
      throw error;
    }
  }, [supabaseClient]);

  const signOut = useCallback(async () => {
    if (!supabaseClient) return;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Stop remote service first
      await stopRemoteService();

      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;

      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        isConnected: false,
        serviceStatus: null,
        connectionError: null,
        isLoading: false
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        connectionError: error instanceof Error ? error.message : 'Sign out failed',
        isLoading: false
      }));
    }
  }, [supabaseClient]);

  const startRemoteService = useCallback(async () => {
    if (!state.isAuthenticated) {
      setState(prev => ({
        ...prev,
        connectionError: 'Must be authenticated to start remote service'
      }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, connectionError: null }));

    try {
      await remoteServiceManager.start();
      
      const status = remoteServiceManager.getStatus();
      setState(prev => ({
        ...prev,
        serviceStatus: status,
        isConnected: status.isRunning && status.pollerStatus.isPolling,
        isLoading: false
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        connectionError: error instanceof Error ? error.message : 'Failed to start remote service',
        isLoading: false
      }));
    }
  }, [state.isAuthenticated]);

  const stopRemoteService = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      await remoteServiceManager.stop();
      
      setState(prev => ({
        ...prev,
        serviceStatus: null,
        isConnected: false,
        isLoading: false
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        connectionError: error instanceof Error ? error.message : 'Failed to stop remote service',
        isLoading: false
      }));
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    if (state.mode !== 'remote') return;

    try {
      const health = await remoteServiceManager.healthCheck();
      const status = remoteServiceManager.getStatus();
      
      setState(prev => ({
        ...prev,
        serviceStatus: status,
        isConnected: status.isRunning && status.pollerStatus.isPolling && health.healthy,
        connectionError: health.healthy ? null : health.issues.join(', ')
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        connectionError: error instanceof Error ? error.message : 'Health check failed'
      }));
    }
  }, [state.mode]);

  return {
    ...state,
    setMode,
    signIn,
    signUp,
    signOut,
    startRemoteService,
    stopRemoteService,
    refreshStatus
  };
}