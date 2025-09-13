/**
 * Remote Chat Synchronization Service
 * 
 * Provides bidirectional chat synchronization between glass-pip-chat and ally-remote-service
 * Handles real-time message sync, status updates, and processing visibility
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabase';
import { Message } from '../types/chat';
import { getUnifiedMessageService } from '../../unified-message-service';
import { getUnifiedAuthService } from '../../unified-auth-service';

export interface RemoteChatSyncConfig {
  systemId: string;
  systemName: string;
  onRemoteMessage: (message: Message) => void;
  onRemoteResponse: (message: Message) => void;
  onStatusChange: (status: RemoteSyncStatus) => void;
  onProcessingUpdate: (update: ProcessingUpdate) => void;
}

export interface RemoteSyncStatus {
  type: 'connected' | 'disconnected' | 'syncing' | 'error';
  message: string;
  timestamp: number;
  details?: any;
}

export interface ProcessingUpdate {
  messageId: string;
  status: 'pending' | 'processing' | 'streaming' | 'completed' | 'error';
  progress?: number;
  currentResponse?: string;
  toolExecutions?: ToolExecutionInfo[];
  timestamp: number;
}

export interface ToolExecutionInfo {
  id: string;
  toolName: string;
  status: 'started' | 'running' | 'completed' | 'failed';
  parameters?: any;
  result?: any;
  error?: string;
  executionTime?: number;
}

export interface RemoteMessage {
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

export class RemoteChatSyncService {
  private supabaseClient: SupabaseClient;
  private unifiedMessageService: any;
  private config: RemoteChatSyncConfig;
  private isActive = false;
  private realtimeSubscription: any = null;
  private syncedSessions: Set<string> = new Set();
  private processingMessages: Map<string, ProcessingUpdate> = new Map();
  private lastSyncTimestamp = 0;

  constructor(config: RemoteChatSyncConfig) {
    this.config = config;
    this.supabaseClient = getSupabaseClient();
    this.unifiedMessageService = getUnifiedMessageService();
  }

  /**
   * Start the chat synchronization service
   */
  async start(): Promise<void> {
    if (this.isActive) return;

    console.log('🔄 RemoteChatSync: Starting chat synchronization service');
    
    try {
      // Verify authentication
      const authService = getUnifiedAuthService();
      const authState = authService.getAuthState();
      
      if (!authState?.isAuthenticated) {
        throw new Error('Must be authenticated to start chat sync');
      }

      this.isActive = true;
      
      // Setup real-time subscriptions
      await this.setupRealtimeSubscriptions();
      
      // Perform initial sync
      await this.performInitialSync();
      
      // Register system for remote processing
      await this.registerForRemoteProcessing();
      
      this.config.onStatusChange({
        type: 'connected',
        message: 'Chat synchronization active',
        timestamp: Date.now()
      });

      console.log('✅ RemoteChatSync: Chat synchronization started successfully');
    } catch (error) {
      console.error('❌ RemoteChatSync: Failed to start chat sync:', error);
      this.config.onStatusChange({
        type: 'error',
        message: `Failed to start sync: ${(error as Error).message}`,
        timestamp: Date.now(),
        details: error
      });
      throw error;
    }
  }

  /**
   * Stop the chat synchronization service
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;

    console.log('🛑 RemoteChatSync: Stopping chat synchronization service');
    
    this.isActive = false;
    
    // Clean up subscriptions
    if (this.realtimeSubscription) {
      this.realtimeSubscription.unsubscribe();
      this.realtimeSubscription = null;
    }
    
    // Clear state
    this.syncedSessions.clear();
    this.processingMessages.clear();
    
    this.config.onStatusChange({
      type: 'disconnected',
      message: 'Chat synchronization stopped',
      timestamp: Date.now()
    });

    console.log('✅ RemoteChatSync: Chat synchronization stopped');
  }

  /**
   * Setup real-time subscriptions for message sync
   */
  private async setupRealtimeSubscriptions(): Promise<void> {
    const authService = getUnifiedAuthService();
    const authState = authService.getAuthState();
    
    if (!authState?.user) {
      throw new Error('No authenticated user for subscriptions');
    }

    console.log('📡 RemoteChatSync: Setting up real-time subscriptions for user:', authState.user.id);

    this.realtimeSubscription = this.supabaseClient
      .channel(`chat-sync-${authState.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `user_id=eq.${authState.user.id}`
        },
        (payload) => {
          this.handleRealtimeMessage(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_sessions',
          filter: `user_id=eq.${authState.user.id}`
        },
        (payload) => {
          this.handleRealtimeSession(payload);
        }
      )
      .subscribe();

    console.log('✅ RemoteChatSync: Real-time subscriptions established');
  }

  /**
   * Handle real-time message updates
   */
  private handleRealtimeMessage(payload: any): void {
    if (!this.isActive) return;

    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      
      console.log('📨 RemoteChatSync: Real-time message event:', eventType, newRecord?.id);

      if (eventType === 'INSERT' && newRecord) {
        this.handleNewMessage(newRecord);
      } else if (eventType === 'UPDATE' && newRecord) {
        this.handleMessageUpdate(newRecord, oldRecord);
      } else if (eventType === 'DELETE' && oldRecord) {
        this.handleMessageDelete(oldRecord);
      }
    } catch (error) {
      console.error('❌ RemoteChatSync: Error handling real-time message:', error);
    }
  }

  /**
   * Handle real-time session updates
   */
  private handleRealtimeSession(payload: any): void {
    if (!this.isActive) return;

    try {
      const { eventType, new: newRecord } = payload;
      
      console.log('📋 RemoteChatSync: Real-time session event:', eventType, newRecord?.id);

      if (eventType === 'INSERT' && newRecord) {
        this.syncedSessions.add(newRecord.id);
      }
    } catch (error) {
      console.error('❌ RemoteChatSync: Error handling real-time session:', error);
    }
  }

  /**
   * Handle new message from remote
   */
  private handleNewMessage(messageRecord: RemoteMessage): void {
    // Convert to local message format
    const message: Message = {
      id: messageRecord.id,
      role: messageRecord.content ? 'user' : 'assistant',
      content: messageRecord.content || messageRecord.response,
      timestamp: new Date(messageRecord.created_at).getTime(),
      isRemote: messageRecord.is_remote,
      metadata: {
        sessionId: messageRecord.session_id,
        status: messageRecord.status,
        ...messageRecord.metadata
      }
    };

    // Determine if this is a message from remote web interface
    if (messageRecord.is_remote && messageRecord.status === 'pending') {
      console.log('🌐 RemoteChatSync: New remote message received:', message.id);
      this.config.onRemoteMessage(message);
      
      // Start tracking processing
      this.startProcessingTracking(messageRecord);
    } else if (messageRecord.response && messageRecord.status === 'completed') {
      console.log('✅ RemoteChatSync: Remote response completed:', message.id);
      this.config.onRemoteResponse(message);
      
      // Stop tracking processing
      this.stopProcessingTracking(messageRecord.id);
    }
  }

  /**
   * Handle message updates (status changes, streaming responses)
   */
  private handleMessageUpdate(newRecord: RemoteMessage, oldRecord?: RemoteMessage): void {
    const messageId = newRecord.id;
    
    // Check if this is a status change
    if (oldRecord && newRecord.status !== oldRecord.status) {
      console.log(`🔄 RemoteChatSync: Message ${messageId} status changed: ${oldRecord.status} → ${newRecord.status}`);
      
      this.updateProcessingStatus(messageId, newRecord.status);
    }

    // Check if this is a streaming response update
    if (newRecord.response && newRecord.response !== (oldRecord?.response || '')) {
      console.log(`📝 RemoteChatSync: Message ${messageId} response updated (length: ${newRecord.response.length})`);
      
      this.updateProcessingResponse(messageId, newRecord.response);
      
      // Notify about streaming response
      const streamingMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: newRecord.response,
        timestamp: new Date(newRecord.updated_at).getTime(),
        isRemote: true,
        metadata: {
          sessionId: newRecord.session_id,
          status: newRecord.status,
          isStreaming: newRecord.status === 'processing'
        }
      };
      
      this.config.onRemoteResponse(streamingMessage);
    }
  }

  /**
   * Handle message deletion
   */
  private handleMessageDelete(messageRecord: RemoteMessage): void {
    console.log('🗑️ RemoteChatSync: Message deleted:', messageRecord.id);
    this.stopProcessingTracking(messageRecord.id);
  }

  /**
   * Start tracking processing for a message
   */
  private startProcessingTracking(message: RemoteMessage): void {
    const update: ProcessingUpdate = {
      messageId: message.id,
      status: 'pending',
      progress: 0,
      currentResponse: '',
      toolExecutions: [],
      timestamp: Date.now()
    };

    this.processingMessages.set(message.id, update);
    this.config.onProcessingUpdate(update);
  }

  /**
   * Update processing status
   */
  private updateProcessingStatus(messageId: string, status: RemoteMessage['status']): void {
    const existing = this.processingMessages.get(messageId);
    if (!existing) return;

    const update: ProcessingUpdate = {
      ...existing,
      status: status as ProcessingUpdate['status'],
      progress: this.getProgressForStatus(status),
      timestamp: Date.now()
    };

    this.processingMessages.set(messageId, update);
    this.config.onProcessingUpdate(update);
  }

  /**
   * Update processing response (streaming)
   */
  private updateProcessingResponse(messageId: string, response: string): void {
    const existing = this.processingMessages.get(messageId);
    if (!existing) return;

    const update: ProcessingUpdate = {
      ...existing,
      status: 'streaming',
      currentResponse: response,
      progress: Math.min(95, (response.length / 1000) * 100), // Rough progress based on length
      timestamp: Date.now()
    };

    this.processingMessages.set(messageId, update);
    this.config.onProcessingUpdate(update);
  }

  /**
   * Stop tracking processing for a message
   */
  private stopProcessingTracking(messageId: string): void {
    const existing = this.processingMessages.get(messageId);
    if (!existing) return;

    const update: ProcessingUpdate = {
      ...existing,
      status: 'completed',
      progress: 100,
      timestamp: Date.now()
    };

    this.config.onProcessingUpdate(update);
    
    // Remove from tracking after a delay
    setTimeout(() => {
      this.processingMessages.delete(messageId);
    }, 5000);
  }

  /**
   * Get progress percentage for status
   */
  private getProgressForStatus(status: RemoteMessage['status']): number {
    switch (status) {
      case 'pending': return 10;
      case 'processing': return 50;
      case 'completed': return 100;
      case 'error': return 0;
      default: return 0;
    }
  }

  /**
   * Perform initial sync of recent messages
   */
  private async performInitialSync(): Promise<void> {
    try {
      console.log('🔄 RemoteChatSync: Performing initial sync');
      
      const authService = getUnifiedAuthService();
      const authState = authService.getAuthState();
      
      if (!authState?.user) return;

      // Get recent sessions
      const { data: sessions, error: sessionsError } = await this.supabaseClient
        .from('chat_sessions')
        .select('id, title, updated_at')
        .eq('user_id', authState.user.id)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (sessionsError) {
        console.error('❌ RemoteChatSync: Failed to fetch sessions:', sessionsError);
        return;
      }

      // Track synced sessions
      sessions?.forEach(session => {
        this.syncedSessions.add(session.id);
      });

      // Get recent messages that might be processing
      const { data: messages, error: messagesError } = await this.supabaseClient
        .from('chat_messages')
        .select('*')
        .eq('user_id', authState.user.id)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(20);

      if (messagesError) {
        console.error('❌ RemoteChatSync: Failed to fetch messages:', messagesError);
        return;
      }

      // Start tracking any processing messages
      messages?.forEach(message => {
        if (message.status === 'pending' || message.status === 'processing') {
          this.startProcessingTracking(message);
        }
      });

      this.lastSyncTimestamp = Date.now();
      console.log(`✅ RemoteChatSync: Initial sync completed (${sessions?.length || 0} sessions, ${messages?.length || 0} processing messages)`);
    } catch (error) {
      console.error('❌ RemoteChatSync: Initial sync failed:', error);
    }
  }

  /**
   * Register system for remote processing
   */
  private async registerForRemoteProcessing(): Promise<void> {
    try {
      const authService = getUnifiedAuthService();
      const authState = authService.getAuthState();
      
      if (!authState?.user) return;

      const systemData = {
        id: this.config.systemId,
        user_id: authState.user.id,
        name: this.config.systemName,
        status: 'online',
        capabilities: {
          models: ['llama3.2', 'llama3.1'],
          tools: ['file_operations', 'system_commands', 'web_search'],
          features: ['streaming', 'tool_calling', 'chat_sync']
        },
        metadata: {
          version: '1.0.0',
          platform: 'electron',
          sync_enabled: true
        },
        last_heartbeat: new Date().toISOString()
      };

      const { error } = await this.supabaseClient
        .from('local_systems')
        .upsert(systemData, { onConflict: 'id' });

      if (error) {
        console.error('❌ RemoteChatSync: Failed to register system:', error);
      } else {
        console.log('✅ RemoteChatSync: System registered for remote processing');
      }
    } catch (error) {
      console.error('❌ RemoteChatSync: System registration failed:', error);
    }
  }

  /**
   * Send a message to remote (when in remote mode)
   */
  async sendToRemote(content: string, sessionId?: string): Promise<{ messageId: string; sessionId: string }> {
    if (!this.isActive) {
      throw new Error('Chat sync not active');
    }

    try {
      const result = await this.unifiedMessageService.sendMessage({
        content,
        sessionId,
        source: 'desktop',
        metadata: {
          systemId: this.config.systemId,
          timestamp: Date.now()
        }
      });

      console.log('📤 RemoteChatSync: Message sent to remote:', result.messageId);
      return result;
    } catch (error) {
      console.error('❌ RemoteChatSync: Failed to send to remote:', error);
      throw error;
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): {
    isActive: boolean;
    syncedSessions: number;
    processingMessages: number;
    lastSyncTimestamp: number;
  } {
    return {
      isActive: this.isActive,
      syncedSessions: this.syncedSessions.size,
      processingMessages: this.processingMessages.size,
      lastSyncTimestamp: this.lastSyncTimestamp
    };
  }

  /**
   * Get processing updates for all messages
   */
  getProcessingUpdates(): ProcessingUpdate[] {
    return Array.from(this.processingMessages.values());
  }

  /**
   * Get processing update for specific message
   */
  getProcessingUpdate(messageId: string): ProcessingUpdate | undefined {
    return this.processingMessages.get(messageId);
  }
}

// Singleton instance
let remoteChatSyncService: RemoteChatSyncService | null = null;

export function createRemoteChatSyncService(config: RemoteChatSyncConfig): RemoteChatSyncService {
  if (remoteChatSyncService) {
    remoteChatSyncService.stop();
  }
  
  remoteChatSyncService = new RemoteChatSyncService(config);
  return remoteChatSyncService;
}

export function getRemoteChatSyncService(): RemoteChatSyncService | null {
  return remoteChatSyncService;
}