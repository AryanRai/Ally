/**
 * Unified Chat Sync Manager
 * 
 * Coordinates bidirectional chat sync and real-time streaming
 * Provides a single interface for all chat synchronization features
 */

import { BidirectionalChatSync, ChatSyncConfig, SyncStatus, LocalChatSession, LocalChatMessage } from './bidirectionalChatSync';
import { RealTimeStreamingService, StreamingStatus, StreamChunk } from './realTimeStreamingService';
import { UnifiedMessage } from '../../shared-types';

export interface UnifiedSyncConfig {
  systemId: string;
  systemName: string;
  syncInterval: number;
  realTimeEnabled: boolean;
  batchSize: number;
  streamingEnabled: boolean;
}

export interface UnifiedSyncStatus {
  sync: SyncStatus;
  streaming: StreamingStatus;
  isFullyActive: boolean;
  lastActivity: number;
}

export interface ChatSyncEvents {
  // Sync events
  onRemoteMessageReceived?: (message: UnifiedMessage) => void;
  onSyncStatusChanged?: (status: SyncStatus) => void;
  
  // Streaming events
  onStreamStart?: (messageId: string, content: string) => void;
  onStreamChunk?: (messageId: string, chunk: StreamChunk) => void;
  onStreamComplete?: (messageId: string, finalContent: string) => void;
  onStreamError?: (messageId: string, error: string) => void;
  onStreamingStatusChanged?: (status: StreamingStatus) => void;
  
  // Combined events
  onUnifiedStatusChanged?: (status: UnifiedSyncStatus) => void;
}

export class UnifiedChatSyncManager {
  private bidirectionalSync: BidirectionalChatSync;
  private streamingService: RealTimeStreamingService;
  private config: UnifiedSyncConfig;
  private isActive = false;
  private events: ChatSyncEvents = {};

  constructor(config: UnifiedSyncConfig) {
    this.config = config;
    
    // Initialize services
    const syncConfig: ChatSyncConfig = {
      systemId: config.systemId,
      systemName: config.systemName,
      syncInterval: config.syncInterval,
      realTimeEnabled: config.realTimeEnabled,
      batchSize: config.batchSize
    };
    
    this.bidirectionalSync = new BidirectionalChatSync(syncConfig);
    this.streamingService = new RealTimeStreamingService();
    
    this.setupEventHandlers();
  }

  /**
   * Start unified sync manager
   */
  async start(): Promise<void> {
    if (this.isActive) {
      console.log('🔄 UnifiedChatSyncManager: Already active');
      return;
    }

    console.log('🚀 UnifiedChatSyncManager: Starting unified chat sync manager');
    
    try {
      this.isActive = true;
      
      // Start bidirectional sync
      await this.bidirectionalSync.start();
      console.log('✅ UnifiedChatSyncManager: Bidirectional sync started');
      
      // Start streaming service if enabled
      if (this.config.streamingEnabled) {
        await this.streamingService.start();
        console.log('✅ UnifiedChatSyncManager: Streaming service started');
      }
      
      console.log('🎉 UnifiedChatSyncManager: All services started successfully');
      this.notifyUnifiedStatusChange();
      
    } catch (error) {
      console.error('❌ UnifiedChatSyncManager: Failed to start:', error);
      this.isActive = false;
      throw error;
    }
  }

  /**
   * Stop unified sync manager
   */
  async stop(): Promise<void> {
    console.log('🛑 UnifiedChatSyncManager: Stopping unified chat sync manager');
    
    this.isActive = false;
    
    // Stop services
    await Promise.all([
      this.bidirectionalSync.stop(),
      this.streamingService.stop()
    ]);
    
    console.log('✅ UnifiedChatSyncManager: All services stopped');
    this.notifyUnifiedStatusChange();
  }

  /**
   * Set event handlers
   */
  setEventHandlers(events: ChatSyncEvents): void {
    this.events = events;
    
    // Update service event handlers
    this.bidirectionalSync.setEventHandlers({
      onRemoteMessageReceived: events.onRemoteMessageReceived,
      onSyncStatusChanged: (status) => {
        events.onSyncStatusChanged?.(status);
        this.notifyUnifiedStatusChange();
      }
    });
    
    this.streamingService.setEventHandlers({
      onStreamStart: events.onStreamStart,
      onStreamChunk: events.onStreamChunk,
      onStreamComplete: events.onStreamComplete,
      onStreamError: events.onStreamError,
      onStatusChange: (status) => {
        events.onStreamingStatusChanged?.(status);
        this.notifyUnifiedStatusChange();
      }
    });
  }

  /**
   * Add local chat session for syncing
   */
  addLocalSession(session: LocalChatSession): void {
    console.log(`📝 UnifiedChatSyncManager: Adding local session: ${session.id}`);
    this.bidirectionalSync.addLocalSession(session);
  }

  /**
   * Update local session
   */
  updateLocalSession(sessionId: string, messages: LocalChatMessage[]): void {
    console.log(`🔄 UnifiedChatSyncManager: Updating local session: ${sessionId}`);
    this.bidirectionalSync.updateLocalSession(sessionId, messages);
  }

  /**
   * Force sync now
   */
  async forceSyncNow(): Promise<void> {
    console.log('⚡ UnifiedChatSyncManager: Forcing immediate sync');
    await this.bidirectionalSync.forceSyncNow();
  }

  /**
   * Simulate streaming for testing
   */
  async simulateStream(messageId: string, content: string): Promise<void> {
    console.log('🎭 UnifiedChatSyncManager: Simulating stream');
    await this.streamingService.simulateStream(messageId, content);
  }

  /**
   * Get unified status
   */
  getStatus(): UnifiedSyncStatus {
    const syncStatus = this.bidirectionalSync.getStatus();
    const streamingStatus = this.streamingService.getStatus();
    
    return {
      sync: syncStatus,
      streaming: streamingStatus,
      isFullyActive: this.isActive && syncStatus.isActive && 
                    (!this.config.streamingEnabled || streamingStatus.isConnected),
      lastActivity: Math.max(
        syncStatus.lastSyncTime,
        streamingStatus.lastActivity
      )
    };
  }

  /**
   * Get local sessions
   */
  getLocalSessions(): LocalChatSession[] {
    return this.bidirectionalSync.getLocalSessions();
  }

  /**
   * Get active streams
   */
  getActiveStreams() {
    return this.streamingService.getActiveStreams();
  }

  /**
   * Setup internal event handlers
   */
  private setupEventHandlers(): void {
    // Handle streaming events to enhance sync
    this.streamingService.setEventHandlers({
      onStreamStart: (messageId, content) => {
        console.log(`🎬 UnifiedChatSyncManager: Stream started for message ${messageId}`);
        this.events.onStreamStart?.(messageId, content);
      },
      
      onStreamChunk: (messageId, chunk) => {
        console.log(`📝 UnifiedChatSyncManager: Stream chunk for message ${messageId}: ${chunk.content.substring(0, 50)}`);
        this.events.onStreamChunk?.(messageId, chunk);
      },
      
      onStreamComplete: (messageId, finalContent) => {
        console.log(`🏁 UnifiedChatSyncManager: Stream completed for message ${messageId}`);
        this.events.onStreamComplete?.(messageId, finalContent);
        
        // Trigger sync after stream completion to ensure data consistency
        this.bidirectionalSync.forceSyncNow().catch(error => {
          console.error('Failed to sync after stream completion:', error);
        });
      },
      
      onStreamError: (messageId, error) => {
        console.log(`❌ UnifiedChatSyncManager: Stream error for message ${messageId}: ${error}`);
        this.events.onStreamError?.(messageId, error);
      }
    });
  }

  /**
   * Notify unified status change
   */
  private notifyUnifiedStatusChange(): void {
    const status = this.getStatus();
    this.events.onUnifiedStatusChanged?.(status);
  }

  /**
   * Create a local session from messages
   */
  createLocalSessionFromMessages(
    sessionId: string,
    title: string,
    messages: { role: 'user' | 'assistant'; content: string; timestamp?: number }[]
  ): LocalChatSession {
    const localMessages: LocalChatMessage[] = messages.map((msg, index) => ({
      id: `${sessionId}-msg-${index}`,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp || Date.now() - (messages.length - index) * 1000,
      metadata: {
        source: 'local',
        index
      }
    }));

    const session: LocalChatSession = {
      id: sessionId,
      title,
      messages: localMessages,
      createdAt: localMessages[0]?.timestamp || Date.now(),
      updatedAt: Date.now()
    };

    this.addLocalSession(session);
    return session;
  }

  /**
   * Convert glass-pip-chat messages to local session format
   */
  convertGlassPipChatToLocalSession(
    sessionId: string,
    title: string,
    glassPipMessages: Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: number;
      metadata?: Record<string, any>;
    }>
  ): LocalChatSession {
    const localMessages: LocalChatMessage[] = glassPipMessages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: {
        ...msg.metadata,
        source: 'glass-pip-chat',
        originalId: msg.id
      }
    }));

    const session: LocalChatSession = {
      id: sessionId,
      title,
      messages: localMessages,
      createdAt: Math.min(...localMessages.map(m => m.timestamp)),
      updatedAt: Math.max(...localMessages.map(m => m.timestamp))
    };

    this.addLocalSession(session);
    return session;
  }

  /**
   * Get sync statistics
   */
  getSyncStatistics(): {
    totalLocalSessions: number;
    totalMessagesSynced: number;
    activeStreams: number;
    totalStreamsProcessed: number;
    syncErrors: number;
    streamingErrors: number;
    lastSyncTime: number;
    lastStreamActivity: number;
  } {
    const syncStatus = this.bidirectionalSync.getStatus();
    const streamingStatus = this.streamingService.getStatus();
    
    return {
      totalLocalSessions: this.getLocalSessions().length,
      totalMessagesSynced: syncStatus.totalMessagesSynced,
      activeStreams: streamingStatus.activeStreams,
      totalStreamsProcessed: streamingStatus.totalStreamsProcessed,
      syncErrors: syncStatus.errors.length,
      streamingErrors: streamingStatus.errors.length,
      lastSyncTime: syncStatus.lastSyncTime,
      lastStreamActivity: streamingStatus.lastActivity
    };
  }

  /**
   * Clear sync errors
   */
  clearErrors(): void {
    // Reset error arrays (this would need to be implemented in the individual services)
    console.log('🧹 UnifiedChatSyncManager: Clearing sync errors');
  }

  /**
   * Test connectivity
   */
  async testConnectivity(): Promise<{
    syncConnected: boolean;
    streamingConnected: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    let syncConnected = false;
    let streamingConnected = false;

    try {
      // Test sync connectivity by attempting a force sync
      await this.bidirectionalSync.forceSyncNow();
      syncConnected = true;
    } catch (error) {
      errors.push(`Sync connectivity failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      // Test streaming connectivity by checking status
      const streamingStatus = this.streamingService.getStatus();
      streamingConnected = streamingStatus.isConnected;
      
      if (!streamingConnected) {
        errors.push('Streaming service not connected');
      }
    } catch (error) {
      errors.push(`Streaming connectivity failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      syncConnected,
      streamingConnected,
      errors
    };
  }
}