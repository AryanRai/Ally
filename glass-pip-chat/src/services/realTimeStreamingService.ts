/**
 * Real-Time Streaming Service
 * 
 * Provides real-time visualization of remote message processing
 * Shows live streaming of AI responses as they're generated on remote systems
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabase';

export interface StreamingMessage {
  id: string;
  sessionId: string;
  content: string;
  isComplete: boolean;
  chunks: StreamChunk[];
  startTime: number;
  endTime?: number;
  metadata?: Record<string, any>;
}

export interface StreamChunk {
  id: string;
  content: string;
  timestamp: number;
  type: 'text' | 'tool_call' | 'tool_result' | 'status';
  metadata?: Record<string, any>;
}

export interface StreamingStatus {
  isConnected: boolean;
  activeStreams: number;
  totalStreamsProcessed: number;
  lastActivity: number;
  errors: string[];
}

export class RealTimeStreamingService {
  private supabaseClient: SupabaseClient;
  private isActive = false;
  private streamingChannel?: any;
  private activeStreams: Map<string, StreamingMessage> = new Map();
  private status: StreamingStatus;
  
  // Event handlers
  private onStreamStart?: (messageId: string, content: string) => void;
  private onStreamChunk?: (messageId: string, chunk: StreamChunk) => void;
  private onStreamComplete?: (messageId: string, finalContent: string) => void;
  private onStreamError?: (messageId: string, error: string) => void;
  private onStatusChange?: (status: StreamingStatus) => void;

  constructor() {
    this.supabaseClient = getSupabaseClient();
    
    this.status = {
      isConnected: false,
      activeStreams: 0,
      totalStreamsProcessed: 0,
      lastActivity: 0,
      errors: []
    };
  }

  /**
   * Start real-time streaming service
   */
  async start(): Promise<void> {
    if (this.isActive) {
      console.log('🔴 RealTimeStreamingService: Already active');
      return;
    }

    console.log('🚀 RealTimeStreamingService: Starting real-time streaming service');
    
    try {
      // Verify authentication
      const { data: { session }, error } = await this.supabaseClient.auth.getSession();
      if (error || !session) {
        throw new Error('Authentication required for streaming service');
      }

      this.isActive = true;
      
      // Start real-time subscriptions
      await this.startStreamingSubscriptions(session.user.id);
      
      console.log('✅ RealTimeStreamingService: Started successfully');
      this.updateStatus({ isConnected: true });
      
    } catch (error) {
      console.error('❌ RealTimeStreamingService: Failed to start:', error);
      this.status.errors.push(`Start failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.isActive = false;
      throw error;
    }
  }

  /**
   * Stop streaming service
   */
  async stop(): Promise<void> {
    console.log('🛑 RealTimeStreamingService: Stopping streaming service');
    
    this.isActive = false;
    
    if (this.streamingChannel) {
      await this.supabaseClient.removeChannel(this.streamingChannel);
      this.streamingChannel = undefined;
    }
    
    this.activeStreams.clear();
    this.updateStatus({ 
      isConnected: false, 
      activeStreams: 0 
    });
    
    console.log('✅ RealTimeStreamingService: Stopped');
  }

  /**
   * Set event handlers
   */
  setEventHandlers(handlers: {
    onStreamStart?: (messageId: string, content: string) => void;
    onStreamChunk?: (messageId: string, chunk: StreamChunk) => void;
    onStreamComplete?: (messageId: string, finalContent: string) => void;
    onStreamError?: (messageId: string, error: string) => void;
    onStatusChange?: (status: StreamingStatus) => void;
  }): void {
    this.onStreamStart = handlers.onStreamStart;
    this.onStreamChunk = handlers.onStreamChunk;
    this.onStreamComplete = handlers.onStreamComplete;
    this.onStreamError = handlers.onStreamError;
    this.onStatusChange = handlers.onStatusChange;
  }

  /**
   * Start streaming subscriptions
   */
  private async startStreamingSubscriptions(userId: string): Promise<void> {
    console.log('🔴 RealTimeStreamingService: Setting up streaming subscriptions for user:', userId);

    // Subscribe to message updates for streaming
    this.streamingChannel = this.supabaseClient
      .channel(`streaming-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => this.handleMessageUpdate(payload)
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_streams',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => this.handleStreamChunk(payload)
      )
      .subscribe((status) => {
        console.log('🔴 RealTimeStreamingService: Subscription status:', status);
        this.updateStatus({ isConnected: status === 'SUBSCRIBED' });
      });
  }

  /**
   * Handle message updates for streaming detection
   */
  private handleMessageUpdate(payload: any): void {
    const { new: newRecord, old: oldRecord } = payload;
    
    if (!newRecord || !oldRecord) return;

    console.log('📡 RealTimeStreamingService: Message update:', {
      id: newRecord.id,
      oldStatus: oldRecord.status,
      newStatus: newRecord.status,
      hasResponse: !!newRecord.response
    });

    // Detect start of processing
    if (oldRecord.status === 'pending' && newRecord.status === 'processing') {
      this.handleStreamStart(newRecord);
    }
    
    // Detect completion
    if (oldRecord.status === 'processing' && newRecord.status === 'completed') {
      this.handleStreamComplete(newRecord);
    }
    
    // Detect error
    if (newRecord.status === 'error') {
      this.handleStreamError(newRecord);
    }

    // Handle partial response updates (streaming)
    if (newRecord.status === 'processing' && newRecord.response && 
        newRecord.response !== oldRecord.response) {
      this.handleStreamingUpdate(newRecord, oldRecord);
    }
  }

  /**
   * Handle stream chunk from message_streams table
   */
  private handleStreamChunk(payload: any): void {
    const { new: newRecord } = payload;
    
    if (!newRecord) return;

    console.log('📡 RealTimeStreamingService: Stream chunk:', newRecord);

    const chunk: StreamChunk = {
      id: newRecord.id,
      content: newRecord.content,
      timestamp: new Date(newRecord.created_at).getTime(),
      type: newRecord.chunk_type || 'text',
      metadata: newRecord.metadata
    };

    const messageId = newRecord.message_id;
    const stream = this.activeStreams.get(messageId);
    
    if (stream) {
      stream.chunks.push(chunk);
      this.onStreamChunk?.(messageId, chunk);
    }

    this.updateStatus({ lastActivity: Date.now() });
  }

  /**
   * Handle stream start
   */
  private handleStreamStart(messageRecord: any): void {
    console.log('🎬 RealTimeStreamingService: Stream starting for message:', messageRecord.id);

    const streamingMessage: StreamingMessage = {
      id: messageRecord.id,
      sessionId: messageRecord.session_id,
      content: messageRecord.content,
      isComplete: false,
      chunks: [],
      startTime: Date.now(),
      metadata: messageRecord.metadata
    };

    this.activeStreams.set(messageRecord.id, streamingMessage);
    this.updateStatus({ 
      activeStreams: this.activeStreams.size,
      lastActivity: Date.now()
    });

    this.onStreamStart?.(messageRecord.id, messageRecord.content);
  }

  /**
   * Handle streaming updates (partial responses)
   */
  private handleStreamingUpdate(newRecord: any, oldRecord: any): void {
    const messageId = newRecord.id;
    const newContent = newRecord.response || '';
    const oldContent = oldRecord.response || '';
    
    // Extract the new chunk
    const newChunk = newContent.slice(oldContent.length);
    
    if (newChunk) {
      console.log('📝 RealTimeStreamingService: Streaming update for message:', messageId, 'chunk:', newChunk.substring(0, 50));

      const chunk: StreamChunk = {
        id: `${messageId}-${Date.now()}`,
        content: newChunk,
        timestamp: Date.now(),
        type: 'text',
        metadata: { source: 'response_update' }
      };

      const stream = this.activeStreams.get(messageId);
      if (stream) {
        stream.chunks.push(chunk);
      }

      this.onStreamChunk?.(messageId, chunk);
      this.updateStatus({ lastActivity: Date.now() });
    }
  }

  /**
   * Handle stream completion
   */
  private handleStreamComplete(messageRecord: any): void {
    console.log('🏁 RealTimeStreamingService: Stream completed for message:', messageRecord.id);

    const stream = this.activeStreams.get(messageRecord.id);
    if (stream) {
      stream.isComplete = true;
      stream.endTime = Date.now();
      
      // Remove from active streams
      this.activeStreams.delete(messageRecord.id);
    }

    this.updateStatus({ 
      activeStreams: this.activeStreams.size,
      totalStreamsProcessed: this.status.totalStreamsProcessed + 1,
      lastActivity: Date.now()
    });

    this.onStreamComplete?.(messageRecord.id, messageRecord.response || '');
  }

  /**
   * Handle stream error
   */
  private handleStreamError(messageRecord: any): void {
    console.log('❌ RealTimeStreamingService: Stream error for message:', messageRecord.id);

    const stream = this.activeStreams.get(messageRecord.id);
    if (stream) {
      stream.isComplete = true;
      stream.endTime = Date.now();
      
      // Remove from active streams
      this.activeStreams.delete(messageRecord.id);
    }

    this.updateStatus({ 
      activeStreams: this.activeStreams.size,
      lastActivity: Date.now()
    });

    this.onStreamError?.(messageRecord.id, messageRecord.error_message || 'Unknown error');
  }

  /**
   * Update status and notify
   */
  private updateStatus(updates: Partial<StreamingStatus>): void {
    this.status = { ...this.status, ...updates };
    this.onStatusChange?.(this.status);
  }

  /**
   * Get current streaming status
   */
  getStatus(): StreamingStatus {
    return { ...this.status };
  }

  /**
   * Get active streams
   */
  getActiveStreams(): StreamingMessage[] {
    return Array.from(this.activeStreams.values());
  }

  /**
   * Get stream by message ID
   */
  getStream(messageId: string): StreamingMessage | undefined {
    return this.activeStreams.get(messageId);
  }

  /**
   * Simulate streaming for testing
   */
  async simulateStream(messageId: string, content: string): Promise<void> {
    if (!this.isActive) return;

    console.log('🎭 RealTimeStreamingService: Simulating stream for message:', messageId);

    // Start stream
    this.handleStreamStart({
      id: messageId,
      session_id: 'test-session',
      content: 'Test message',
      metadata: { simulated: true }
    });

    // Simulate chunks
    const words = content.split(' ');
    let accumulatedContent = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      accumulatedContent += (i > 0 ? ' ' : '') + word;

      const chunk: StreamChunk = {
        id: `${messageId}-chunk-${i}`,
        content: word + (i < words.length - 1 ? ' ' : ''),
        timestamp: Date.now(),
        type: 'text',
        metadata: { simulated: true, chunkIndex: i }
      };

      this.onStreamChunk?.(messageId, chunk);

      // Simulate delay between chunks
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Complete stream
    this.handleStreamComplete({
      id: messageId,
      response: accumulatedContent,
      status: 'completed'
    });
  }
}