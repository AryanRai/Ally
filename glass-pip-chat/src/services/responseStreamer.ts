/**
 * Response Streaming Service
 * Requirements: 3.5, 8.4, 8.5
 * 
 * Handles word-by-word streaming of responses back to Supabase
 * Implements atomic updates and completion status handling
 * Provides error handling and recovery mechanisms
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabase';

export interface StreamingConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  batchSize: number;
  flushInterval: number;
  maxRetries: number;
  retryDelay: number;
}

export interface StreamChunk {
  messageId: string;
  content: string;
  timestamp: Date;
  sequenceNumber: number;
}

export interface StreamingMetrics {
  totalChunks: number;
  totalCharacters: number;
  averageChunkSize: number;
  streamingDuration: number;
  errorCount: number;
  retryCount: number;
}

export class ResponseStreamer {
  private supabaseClient: SupabaseClient;
  private config: StreamingConfig;
  private pendingChunks: Map<string, StreamChunk[]> = new Map();
  private flushTimers: Map<string, NodeJS.Timeout> = new Map();
  private sequenceCounters: Map<string, number> = new Map();
  private streamingMetrics: Map<string, StreamingMetrics> = new Map();
  private messageAccumulators: Map<string, string> = new Map();

  constructor(config: StreamingConfig) {
    this.config = config;
    // Use the regular (publishable key) client with the user's auth session.
    // The secret key must NOT be used in the browser — Supabase blocks it.
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase client not available — cannot start response streamer');
    }
    this.supabaseClient = client;
  }

  /**
   * Start streaming for a message
   */
  startStreaming(messageId: string): void {
    console.log(`Starting response streaming for message: ${messageId}`);
    
    // Initialize tracking
    this.pendingChunks.set(messageId, []);
    this.sequenceCounters.set(messageId, 0);
    this.messageAccumulators.set(messageId, ''); // Initialize accumulator
    this.streamingMetrics.set(messageId, {
      totalChunks: 0,
      totalCharacters: 0,
      averageChunkSize: 0,
      streamingDuration: 0,
      errorCount: 0,
      retryCount: 0
    });

    // Clear any existing response content
    this.clearMessageResponse(messageId);
  }

  /**
   * Stream a chunk of response content
   */
  async streamChunk(messageId: string, content: string): Promise<void> {
    if (!content || content.length === 0) return;

    const sequenceNumber = this.getNextSequenceNumber(messageId);
    const chunk: StreamChunk = {
      messageId,
      content,
      timestamp: new Date(),
      sequenceNumber
    };

    // Add to pending chunks
    const pending = this.pendingChunks.get(messageId) || [];
    pending.push(chunk);
    this.pendingChunks.set(messageId, pending);

    // Update metrics
    this.updateMetrics(messageId, content);

    // Check if we should flush immediately or batch
    if (pending.length >= this.config.batchSize) {
      await this.flushChunks(messageId);
    } else {
      this.scheduleFlush(messageId);
    }
  }

  /**
   * Complete streaming for a message
   */
  async completeStreaming(messageId: string): Promise<void> {
    console.log(`Completing response streaming for message: ${messageId}`);
    
    try {
      // Flush any remaining chunks
      await this.flushChunks(messageId);
      
      // Update message status to completed
      await this.updateMessageStatus(messageId, 'completed');
      
      // Clean up tracking data
      this.cleanup(messageId);
      
      console.log(`Response streaming completed for message: ${messageId}`);
      
    } catch (error) {
      console.error(`Failed to complete streaming for message ${messageId}:`, error);
      await this.handleStreamingError(messageId, error as Error);
    }
  }

  /**
   * Handle streaming error
   */
  async errorStreaming(messageId: string, error: Error): Promise<void> {
    console.error(`Response streaming error for message ${messageId}:`, error);
    
    try {
      // Flush any remaining chunks
      await this.flushChunks(messageId);
      
      // Update message status to error
      await this.updateMessageStatus(messageId, 'error');
      await this.logMessageError(messageId, error);
      
      // Clean up tracking data
      this.cleanup(messageId);
      
    } catch (cleanupError) {
      console.error(`Failed to handle streaming error for message ${messageId}:`, cleanupError);
    }
  }

  /**
   * Flush pending chunks to Supabase
   */
  private async flushChunks(messageId: string): Promise<void> {
    const pending = this.pendingChunks.get(messageId);
    if (!pending || pending.length === 0) return;

    try {
      // Sort chunks by sequence number to ensure order
      pending.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      
      // Combine all pending content
      const combinedContent = pending.map(chunk => chunk.content).join('');
      
      // Append to message response using atomic operation
      await this.appendToMessageResponse(messageId, combinedContent);
      
      // Clear pending chunks
      this.pendingChunks.set(messageId, []);
      
      // Clear flush timer
      const timer = this.flushTimers.get(messageId);
      if (timer) {
        clearTimeout(timer);
        this.flushTimers.delete(messageId);
      }
      
    } catch (error) {
      console.error(`Failed to flush chunks for message ${messageId}:`, error);
      await this.retryFlush(messageId, pending, error as Error);
    }
  }

  /**
   * Retry flushing with exponential backoff
   */
  private async retryFlush(messageId: string, chunks: StreamChunk[], error: Error): Promise<void> {
    const metrics = this.streamingMetrics.get(messageId);
    if (!metrics) return;

    metrics.errorCount++;
    metrics.retryCount++;

    if (metrics.retryCount <= this.config.maxRetries) {
      const delay = this.config.retryDelay * Math.pow(2, metrics.retryCount - 1);
      console.log(`Retrying flush for message ${messageId} in ${delay}ms (attempt ${metrics.retryCount})`);
      
      setTimeout(async () => {
        try {
          const combinedContent = chunks.map(chunk => chunk.content).join('');
          await this.appendToMessageResponse(messageId, combinedContent);
          this.pendingChunks.set(messageId, []);
        } catch (retryError) {
          console.error(`Retry failed for message ${messageId}:`, retryError);
          if (metrics.retryCount < this.config.maxRetries) {
            await this.retryFlush(messageId, chunks, retryError as Error);
          } else {
            await this.handleStreamingError(messageId, retryError as Error);
          }
        }
      }, delay);
    } else {
      console.error(`Max retries exceeded for message ${messageId}`);
      await this.handleStreamingError(messageId, error);
    }
  }

  /**
   * Schedule a flush operation
   */
  private scheduleFlush(messageId: string): void {
    // Clear existing timer
    const existingTimer = this.flushTimers.get(messageId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new flush
    const timer = setTimeout(async () => {
      await this.flushChunks(messageId);
    }, this.config.flushInterval);

    this.flushTimers.set(messageId, timer);
  }

  /**
   * Get next sequence number for a message
   */
  private getNextSequenceNumber(messageId: string): number {
    const current = this.sequenceCounters.get(messageId) || 0;
    const next = current + 1;
    this.sequenceCounters.set(messageId, next);
    return next;
  }

  /**
   * Update streaming metrics
   */
  private updateMetrics(messageId: string, content: string): void {
    const metrics = this.streamingMetrics.get(messageId);
    if (!metrics) return;

    metrics.totalChunks++;
    metrics.totalCharacters += content.length;
    metrics.averageChunkSize = metrics.totalCharacters / metrics.totalChunks;
  }

  /**
   * Clear message response content
   */
  private async clearMessageResponse(messageId: string): Promise<void> {
    try {
      await this.supabaseClient
        .from('chat_messages')
        .update({ 
          response: '',
          updated_at: new Date().toISOString()
        })
        .eq('id', messageId);
    } catch (error) {
      console.error(`Failed to clear message response for ${messageId}:`, error);
    }
  }

  /**
   * Update message response with cumulative content (for streaming)
   */
  private async appendToMessageResponse(messageId: string, content: string): Promise<void> {
    console.log('📝 ResponseStreamer: Updating message response:', messageId, 'Length:', content.length);
    
    // Store the content directly (Ollama sends cumulative content, not incremental)
    this.messageAccumulators.set(messageId, content);
    
    console.log('💾 ResponseStreamer: Setting message response, length:', content.length);

    // Update the message with the new response content
    const { error: updateError } = await this.supabaseClient
      .from('chat_messages')
      .update({ 
        response: content,
        updated_at: new Date().toISOString()
      })
      .eq('id', messageId);

    if (updateError) {
      console.error('❌ ResponseStreamer: Failed to update message response:', updateError);
      throw new Error(`Failed to update response content: ${updateError.message}`);
    }

    console.log('✅ ResponseStreamer: Successfully updated message response:', messageId);
  }

  /**
   * Update message status
   */
  private async updateMessageStatus(
    messageId: string, 
    status: 'processing' | 'completed' | 'error'
  ): Promise<void> {
    const updateData: any = { 
      status,
      updated_at: new Date().toISOString()
    };
    
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { error } = await this.supabaseClient
      .from('chat_messages')
      .update(updateData)
      .eq('id', messageId);

    if (error) {
      console.error(`Failed to update message status to ${status}:`, error);
    }
  }

  /**
   * Log message error
   */
  private async logMessageError(messageId: string, error: Error): Promise<void> {
    const { error: updateError } = await this.supabaseClient
      .from('chat_messages')
      .update({ 
        error_message: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', messageId);

    if (updateError) {
      console.error('Failed to log message error:', updateError);
    }
  }

  /**
   * Handle streaming error
   */
  private async handleStreamingError(messageId: string, error: Error): Promise<void> {
    const metrics = this.streamingMetrics.get(messageId);
    if (metrics) {
      metrics.errorCount++;
    }

    await this.logMessageError(messageId, error);
    this.cleanup(messageId);
  }

  /**
   * Clean up tracking data for a message
   */
  private cleanup(messageId: string): void {
    // Clear pending chunks
    this.pendingChunks.delete(messageId);
    
    // Clear flush timer
    const timer = this.flushTimers.get(messageId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(messageId);
    }
    
    // Clear sequence counter
    this.sequenceCounters.delete(messageId);
    
    // Clear message accumulator
    this.messageAccumulators.delete(messageId);
    
    // Keep metrics for a while for debugging
    setTimeout(() => {
      this.streamingMetrics.delete(messageId);
    }, 60000); // Keep for 1 minute
  }

  /**
   * Get streaming metrics for a message
   */
  getMetrics(messageId: string): StreamingMetrics | undefined {
    return this.streamingMetrics.get(messageId);
  }

  /**
   * Get all active streaming sessions
   */
  getActiveStreams(): string[] {
    return Array.from(this.pendingChunks.keys());
  }

  /**
   * Force flush all pending chunks
   */
  async flushAll(): Promise<void> {
    const messageIds = Array.from(this.pendingChunks.keys());
    
    await Promise.all(
      messageIds.map(messageId => this.flushChunks(messageId))
    );
  }

  /**
   * Shutdown the streamer and clean up all resources
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down response streamer...');
    
    // Flush all pending chunks
    await this.flushAll();
    
    // Clear all timers
    for (const timer of this.flushTimers.values()) {
      clearTimeout(timer);
    }
    
    // Clear all tracking data
    this.pendingChunks.clear();
    this.flushTimers.clear();
    this.sequenceCounters.clear();
    this.streamingMetrics.clear();
    
    console.log('Response streamer shutdown complete');
  }
}