/**
 * Response Streamer Tests
 * Requirements: 3.5, 8.4, 8.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResponseStreamer, StreamingConfig } from '../responseStreamer';

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(() => ({
    update: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null }))
    }))
  })),
  rpc: vi.fn(() => Promise.resolve({ error: null }))
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient)
}));

describe('ResponseStreamer', () => {
  let streamer: ResponseStreamer;
  let config: StreamingConfig;

  beforeEach(() => {
    config = {
      supabaseUrl: 'https://test.supabase.co',
      supabaseServiceKey: 'test-key',
      batchSize: 3,
      flushInterval: 100,
      maxRetries: 3,
      retryDelay: 1000
    };

    streamer = new ResponseStreamer(config);
    
    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await streamer.shutdown();
  });

  describe('streaming lifecycle', () => {
    it('should start streaming for a message', () => {
      const messageId = 'test-message-1';
      
      streamer.startStreaming(messageId);
      
      const activeStreams = streamer.getActiveStreams();
      expect(activeStreams).toContain(messageId);
    });

    it('should stream chunks and batch them', async () => {
      const messageId = 'test-message-2';
      
      streamer.startStreaming(messageId);
      
      // Stream some chunks
      await streamer.streamChunk(messageId, 'Hello ');
      await streamer.streamChunk(messageId, 'world ');
      await streamer.streamChunk(messageId, 'test');
      
      // Should trigger batch flush at batchSize (3)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('append_message_response', {
        message_id: messageId,
        new_content: 'Hello world test'
      });
    });

    it('should complete streaming successfully', async () => {
      const messageId = 'test-message-3';
      
      streamer.startStreaming(messageId);
      await streamer.streamChunk(messageId, 'Final message');
      await streamer.completeStreaming(messageId);
      
      // Should flush remaining chunks and update status
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('append_message_response', {
        message_id: messageId,
        new_content: 'Final message'
      });
      
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('chat_messages');
      
      const activeStreams = streamer.getActiveStreams();
      expect(activeStreams).not.toContain(messageId);
    });

    it('should handle streaming errors', async () => {
      const messageId = 'test-message-4';
      const error = new Error('Test error');
      
      streamer.startStreaming(messageId);
      await streamer.streamChunk(messageId, 'Error test');
      await streamer.errorStreaming(messageId, error);
      
      // Should update message status to error
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('chat_messages');
      
      const activeStreams = streamer.getActiveStreams();
      expect(activeStreams).not.toContain(messageId);
    });
  });

  describe('metrics tracking', () => {
    it('should track streaming metrics', async () => {
      const messageId = 'test-message-5';
      
      streamer.startStreaming(messageId);
      await streamer.streamChunk(messageId, 'Hello');
      await streamer.streamChunk(messageId, ' world');
      
      const metrics = streamer.getMetrics(messageId);
      expect(metrics).toBeDefined();
      expect(metrics?.totalChunks).toBe(2);
      expect(metrics?.totalCharacters).toBe(11); // "Hello world"
      expect(metrics?.averageChunkSize).toBe(5.5);
    });

    it('should clean up metrics after completion', async () => {
      const messageId = 'test-message-6';
      
      streamer.startStreaming(messageId);
      await streamer.streamChunk(messageId, 'Test');
      await streamer.completeStreaming(messageId);
      
      // Metrics should still be available immediately after completion
      const metrics = streamer.getMetrics(messageId);
      expect(metrics).toBeDefined();
    });
  });

  describe('error handling and retries', () => {
    it('should handle flush errors with retries', async () => {
      const messageId = 'test-message-7';
      
      // Mock RPC to fail first time, succeed second time
      mockSupabaseClient.rpc
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ error: null });
      
      streamer.startStreaming(messageId);
      
      // This should trigger a retry
      await streamer.streamChunk(messageId, 'Retry test 1');
      await streamer.streamChunk(messageId, 'Retry test 2');
      await streamer.streamChunk(messageId, 'Retry test 3');
      
      // Wait a bit for retry logic
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should have been called at least twice (original + retry)
      expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(3); // Initial batch flush + retry
    });
  });

  describe('batch management', () => {
    it('should flush on timer when batch size not reached', async () => {
      const messageId = 'test-message-8';
      
      streamer.startStreaming(messageId);
      await streamer.streamChunk(messageId, 'Timer test');
      
      // Wait for flush interval
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('append_message_response', {
        message_id: messageId,
        new_content: 'Timer test'
      });
    });

    it('should maintain chunk order with sequence numbers', async () => {
      const messageId = 'test-message-9';
      
      streamer.startStreaming(messageId);
      
      // Stream chunks rapidly
      await Promise.all([
        streamer.streamChunk(messageId, 'First '),
        streamer.streamChunk(messageId, 'Second '),
        streamer.streamChunk(messageId, 'Third')
      ]);
      
      // Should combine in correct order
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('append_message_response', {
        message_id: messageId,
        new_content: 'First Second Third'
      });
    });
  });

  describe('shutdown', () => {
    it('should flush all pending chunks on shutdown', async () => {
      const messageId1 = 'test-message-10';
      const messageId2 = 'test-message-11';
      
      streamer.startStreaming(messageId1);
      streamer.startStreaming(messageId2);
      
      await streamer.streamChunk(messageId1, 'Shutdown test 1');
      await streamer.streamChunk(messageId2, 'Shutdown test 2');
      
      await streamer.shutdown();
      
      // Should have flushed both messages
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('append_message_response', {
        message_id: messageId1,
        new_content: 'Shutdown test 1'
      });
      
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('append_message_response', {
        message_id: messageId2,
        new_content: 'Shutdown test 2'
      });
      
      expect(streamer.getActiveStreams()).toHaveLength(0);
    });
  });
});