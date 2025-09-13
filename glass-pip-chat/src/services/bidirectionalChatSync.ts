/**
 * Bidirectional Chat Sync Service
 * 
 * Synchronizes all local chats to ally-remote-service when in remote mode
 * Provides real-time streaming of remote message processing on local machine
 * Handles both directions: local -> remote and remote -> local
 */

import { UnifiedMessage, UnifiedChatSession, UnifiedStreamEvent, convertToUnifiedMessage } from '../../../shared-types';
import { getSupabaseClient, getSupabaseServiceClient } from '../utils/supabase';
import { SupabaseClient } from '@supabase/supabase-js';

export interface ChatSyncConfig {
  systemId: string;
  systemName: string;
  syncInterval: number;
  realTimeEnabled: boolean;
  batchSize: number;
}

export interface SyncStatus {
  isActive: boolean;
  lastSyncTime: number;
  totalMessagesSynced: number;
  pendingUploads: number;
  realTimeConnected: boolean;
  errors: string[];
}

export interface LocalChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface LocalChatSession {
  id: string;
  messages: LocalChatMessage[];
  title: string;
  createdAt: number;
  updatedAt: number;
}

export class BidirectionalChatSync {
  private supabaseClient: SupabaseClient;
  private supabaseServiceClient: SupabaseClient;
  private config: ChatSyncConfig;
  private isActive = false;
  private syncTimer?: NodeJS.Timeout;
  private realTimeChannel?: any;
  private status: SyncStatus;
  private localSessions: Map<string, LocalChatSession> = new Map();
  private syncedMessageIds: Set<string> = new Set();
  
  // Event handlers
  private onRemoteMessageReceived?: (message: UnifiedMessage) => void;
  private onRemoteMessageProcessing?: (messageId: string, chunk: string) => void;
  private onRemoteMessageCompleted?: (messageId: string, response: string) => void;
  private onSyncStatusChanged?: (status: SyncStatus) => void;

  constructor(config: ChatSyncConfig) {
    this.config = config;
    this.supabaseClient = getSupabaseClient();
    this.supabaseServiceClient = getSupabaseServiceClient();
    
    this.status = {
      isActive: false,
      lastSyncTime: 0,
      totalMessagesSynced: 0,
      pendingUploads: 0,
      realTimeConnected: false,
      errors: []
    };
  }

  /**
   * Start bidirectional sync
   */
  async start(): Promise<void> {
    if (this.isActive) {
      console.log('🔄 BidirectionalChatSync: Already active');
      return;
    }

    console.log('🚀 BidirectionalChatSync: Starting bidirectional chat sync');
    
    try {
      // Verify authentication
      const { data: { session }, error } = await this.supabaseClient.auth.getSession();
      if (error || !session) {
        throw new Error('Authentication required for chat sync');
      }

      this.isActive = true;
      this.status.isActive = true;
      
      // Load existing local sessions
      await this.loadLocalSessions();
      
      // Perform initial sync
      await this.performFullSync();
      
      // Start periodic sync
      this.startPeriodicSync();
      
      // Start real-time monitoring
      if (this.config.realTimeEnabled) {
        await this.startRealTimeSync();
      }
      
      console.log('✅ BidirectionalChatSync: Started successfully');
      this.notifyStatusChange();
      
    } catch (error) {
      console.error('❌ BidirectionalChatSync: Failed to start:', error);
      this.status.errors.push(`Start failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.isActive = false;
      this.status.isActive = false;
      throw error;
    }
  }

  /**
   * Stop sync service
   */
  async stop(): Promise<void> {
    console.log('🛑 BidirectionalChatSync: Stopping sync service');
    
    this.isActive = false;
    this.status.isActive = false;
    
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    
    if (this.realTimeChannel) {
      await this.supabaseClient.removeChannel(this.realTimeChannel);
      this.realTimeChannel = undefined;
      this.status.realTimeConnected = false;
    }
    
    console.log('✅ BidirectionalChatSync: Stopped');
    this.notifyStatusChange();
  }

  /**
   * Add local chat session for syncing
   */
  addLocalSession(session: LocalChatSession): void {
    console.log(`📝 BidirectionalChatSync: Adding local session: ${session.id}`);
    this.localSessions.set(session.id, session);
    
    // Trigger immediate sync for new session
    if (this.isActive) {
      this.syncSessionToRemote(session).catch(error => {
        console.error('Failed to sync new session:', error);
        this.status.errors.push(`Sync failed for session ${session.id}: ${error.message}`);
      });
    }
  }

  /**
   * Update local session
   */
  updateLocalSession(sessionId: string, messages: LocalChatMessage[]): void {
    const session = this.localSessions.get(sessionId);
    if (session) {
      session.messages = messages;
      session.updatedAt = Date.now();
      
      // Trigger sync for updated session
      if (this.isActive) {
        this.syncSessionToRemote(session).catch(error => {
          console.error('Failed to sync updated session:', error);
        });
      }
    }
  }

  /**
   * Set event handlers
   */
  setEventHandlers(handlers: {
    onRemoteMessageReceived?: (message: UnifiedMessage) => void;
    onRemoteMessageProcessing?: (messageId: string, chunk: string) => void;
    onRemoteMessageCompleted?: (messageId: string, response: string) => void;
    onSyncStatusChanged?: (status: SyncStatus) => void;
  }): void {
    this.onRemoteMessageReceived = handlers.onRemoteMessageReceived;
    this.onRemoteMessageProcessing = handlers.onRemoteMessageProcessing;
    this.onRemoteMessageCompleted = handlers.onRemoteMessageCompleted;
    this.onSyncStatusChanged = handlers.onSyncStatusChanged;
  }

  /**
   * Load local sessions from storage
   */
  private async loadLocalSessions(): Promise<void> {
    try {
      // Load from localStorage or other storage mechanism
      const stored = localStorage.getItem('ally-chat-sessions');
      if (stored) {
        const sessions: LocalChatSession[] = JSON.parse(stored);
        sessions.forEach(session => {
          this.localSessions.set(session.id, session);
        });
        console.log(`📚 BidirectionalChatSync: Loaded ${sessions.length} local sessions`);
      }
    } catch (error) {
      console.error('Failed to load local sessions:', error);
    }
  }

  /**
   * Save local sessions to storage
   */
  private async saveLocalSessions(): Promise<void> {
    try {
      const sessions = Array.from(this.localSessions.values());
      localStorage.setItem('ally-chat-sessions', JSON.stringify(sessions));
    } catch (error) {
      console.error('Failed to save local sessions:', error);
    }
  }

  /**
   * Perform full bidirectional sync
   */
  private async performFullSync(): Promise<void> {
    console.log('🔄 BidirectionalChatSync: Performing full sync');
    
    try {
      // Sync local sessions to remote
      await this.syncLocalToRemote();
      
      // Sync remote sessions to local
      await this.syncRemoteToLocal();
      
      this.status.lastSyncTime = Date.now();
      console.log('✅ BidirectionalChatSync: Full sync completed');
      
    } catch (error) {
      console.error('❌ BidirectionalChatSync: Full sync failed:', error);
      this.status.errors.push(`Full sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync local sessions to remote
   */
  private async syncLocalToRemote(): Promise<void> {
    console.log('📤 BidirectionalChatSync: Syncing local to remote');
    
    const { data: { session }, error } = await this.supabaseClient.auth.getSession();
    if (error || !session) {
      throw new Error('Authentication required');
    }

    let syncedCount = 0;
    
    for (const [sessionId, localSession] of this.localSessions) {
      try {
        await this.syncSessionToRemote(localSession);
        syncedCount++;
      } catch (error) {
        console.error(`Failed to sync session ${sessionId}:`, error);
        this.status.errors.push(`Session sync failed: ${sessionId}`);
      }
    }
    
    console.log(`📤 BidirectionalChatSync: Synced ${syncedCount} local sessions to remote`);
  }

  /**
   * Sync single session to remote
   */
  private async syncSessionToRemote(localSession: LocalChatSession): Promise<void> {
    const { data: { session }, error } = await this.supabaseClient.auth.getSession();
    if (error || !session) return;

    // Create or update remote session
    const remoteSessionData = {
      id: localSession.id,
      user_id: session.user.id,
      title: localSession.title,
      metadata: {
        source: 'glass-pip-chat',
        synced_at: new Date().toISOString(),
        message_count: localSession.messages.length
      },
      is_remote: false, // This is a local session synced to remote
      created_at: new Date(localSession.createdAt).toISOString(),
      updated_at: new Date(localSession.updatedAt).toISOString()
    };

    await this.supabaseServiceClient
      .from('chat_sessions')
      .upsert(remoteSessionData, { onConflict: 'id' });

    // Sync messages
    for (const message of localSession.messages) {
      if (this.syncedMessageIds.has(message.id)) continue;

      const remoteMessageData = {
        id: message.id,
        session_id: localSession.id,
        user_id: session.user.id,
        content: message.role === 'user' ? message.content : '',
        response: message.role === 'assistant' ? message.content : '',
        status: 'completed' as const,
        metadata: {
          source: 'glass-pip-chat',
          role: message.role,
          synced_at: new Date().toISOString(),
          ...message.metadata
        },
        is_remote: false,
        local_system_id: this.config.systemId,
        created_at: new Date(message.timestamp).toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      };

      await this.supabaseServiceClient
        .from('chat_messages')
        .upsert(remoteMessageData, { onConflict: 'id' });

      this.syncedMessageIds.add(message.id);
      this.status.totalMessagesSynced++;
    }
  }

  /**
   * Sync remote sessions to local
   */
  private async syncRemoteToLocal(): Promise<void> {
    console.log('📥 BidirectionalChatSync: Syncing remote to local');
    
    const { data: { session }, error } = await this.supabaseClient.auth.getSession();
    if (error || !session) return;

    // Fetch remote sessions
    const { data: remoteSessions, error: sessionsError } = await this.supabaseServiceClient
      .from('chat_sessions')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('is_remote', true);

    if (sessionsError) {
      console.error('Failed to fetch remote sessions:', sessionsError);
      return;
    }

    for (const remoteSession of remoteSessions || []) {
      // Fetch messages for this session
      const { data: remoteMessages, error: messagesError } = await this.supabaseServiceClient
        .from('chat_messages')
        .select('*')
        .eq('session_id', remoteSession.id)
        .order('created_at', { ascending: true });

      if (messagesError) {
        console.error(`Failed to fetch messages for session ${remoteSession.id}:`, messagesError);
        continue;
      }

      // Convert to local format
      const localMessages: LocalChatMessage[] = [];
      
      for (const remoteMessage of remoteMessages || []) {
        // Add user message
        if (remoteMessage.content) {
          localMessages.push({
            id: `${remoteMessage.id}-user`,
            role: 'user',
            content: remoteMessage.content,
            timestamp: new Date(remoteMessage.created_at).getTime(),
            metadata: {
              ...remoteMessage.metadata,
              remoteMessageId: remoteMessage.id,
              syncedFromRemote: true
            }
          });
        }

        // Add assistant response
        if (remoteMessage.response) {
          localMessages.push({
            id: `${remoteMessage.id}-assistant`,
            role: 'assistant',
            content: remoteMessage.response,
            timestamp: new Date(remoteMessage.completed_at || remoteMessage.updated_at).getTime(),
            metadata: {
              ...remoteMessage.metadata,
              remoteMessageId: remoteMessage.id,
              syncedFromRemote: true
            }
          });
        }
      }

      // Create local session
      const localSession: LocalChatSession = {
        id: remoteSession.id,
        title: remoteSession.title,
        messages: localMessages,
        createdAt: new Date(remoteSession.created_at).getTime(),
        updatedAt: new Date(remoteSession.updated_at).getTime()
      };

      this.localSessions.set(localSession.id, localSession);
    }

    await this.saveLocalSessions();
    console.log(`📥 BidirectionalChatSync: Synced ${remoteSessions?.length || 0} remote sessions to local`);
  }

  /**
   * Start periodic sync
   */
  private startPeriodicSync(): void {
    this.syncTimer = setInterval(async () => {
      if (this.isActive) {
        await this.performFullSync();
      }
    }, this.config.syncInterval);
  }

  /**
   * Start real-time sync for live updates
   */
  private async startRealTimeSync(): Promise<void> {
    console.log('🔴 BidirectionalChatSync: Starting real-time sync');
    
    const { data: { session }, error } = await this.supabaseClient.auth.getSession();
    if (error || !session) {
      throw new Error('Authentication required for real-time sync');
    }

    this.realTimeChannel = this.supabaseClient
      .channel(`chat-sync-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => this.handleRealTimeMessage(payload)
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_sessions',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => this.handleRealTimeSession(payload)
      )
      .subscribe((status) => {
        console.log('🔴 BidirectionalChatSync: Real-time subscription status:', status);
        this.status.realTimeConnected = status === 'SUBSCRIBED';
        this.notifyStatusChange();
      });
  }

  /**
   * Handle real-time message updates
   */
  private handleRealTimeMessage(payload: any): void {
    console.log('📡 BidirectionalChatSync: Real-time message update:', payload);
    
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    if (eventType === 'INSERT' && newRecord) {
      const unifiedMessage = convertToUnifiedMessage(newRecord, 'web');
      this.onRemoteMessageReceived?.(unifiedMessage);
    }
    
    if (eventType === 'UPDATE' && newRecord) {
      // Handle streaming updates
      if (newRecord.status === 'processing') {
        // Message is being processed
        console.log(`🔄 BidirectionalChatSync: Message ${newRecord.id} is being processed`);
      } else if (newRecord.status === 'completed' && newRecord.response) {
        // Message processing completed
        this.onRemoteMessageCompleted?.(newRecord.id, newRecord.response);
        
        // Convert and notify
        const unifiedMessage = convertToUnifiedMessage(newRecord, 'web');
        this.onRemoteMessageReceived?.(unifiedMessage);
      }
    }
  }

  /**
   * Handle real-time session updates
   */
  private handleRealTimeSession(payload: any): void {
    console.log('📡 BidirectionalChatSync: Real-time session update:', payload);
    // Handle session updates if needed
  }

  /**
   * Notify status change
   */
  private notifyStatusChange(): void {
    this.onSyncStatusChanged?.(this.status);
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Get local sessions
   */
  getLocalSessions(): LocalChatSession[] {
    return Array.from(this.localSessions.values());
  }

  /**
   * Force sync now
   */
  async forceSyncNow(): Promise<void> {
    if (!this.isActive) {
      throw new Error('Sync service not active');
    }
    
    await this.performFullSync();
  }
}