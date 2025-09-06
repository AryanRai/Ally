/**
 * Remote Message Poller Tests
 * Requirements: 3.1, 3.2, 3.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteMessagePoller, MessagePollerConfig } from '../remoteMessagePoller';
import { OllamaService } from '../ollamaService';
import { ToolCallingService } from '../toolCallingService';

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        }))
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null }))
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 'test-id' }, error: null }))
        }))
      }))
    })),
    rpc: vi.fn(() => Promise.resolve({ error: null }))
  }))
}));

describe('RemoteMessagePoller', () => {
  let poller: RemoteMessagePoller;
  let mockOllamaService: OllamaService;
  let mockToolCallingService: ToolCallingService;
  let config: MessagePollerConfig;

  beforeEach(() => {
    config = {
      supabaseUrl: 'https://test.supabase.co',
      supabaseServiceKey: 'test-key',
      systemId: 'test-system',
      systemName: 'Test System',
      pollInterval: 1000,
      batchSize: 5,
      heartbeatInterval: 10000,
      maxRetryAttempts: 3,
      retryDelay: 1000
    };

    mockOllamaService = new OllamaService();
    mockToolCallingService = new ToolCallingService(mockOllamaService, {
      enableToolCalling: true,
      maxToolCalls: 5,
      toolCallTimeout: 30000,
      enableMultiStepReasoning: true,
      toolCallPromptTemplate: 'default'
    });

    poller = new RemoteMessagePoller(config, mockOllamaService, mockToolCallingService);
  });

  afterEach(async () => {
    if (poller) {
      await poller.stopPolling();
    }
  });

  describe('initialization', () => {
    it('should create poller with correct configuration', () => {
      expect(poller).toBeDefined();
      
      const status = poller.getStatus();
      expect(status.systemId).toBe('test-system');
      expect(status.isPolling).toBe(false);
      expect(status.retryCount).toBe(0);
    });
  });

  describe('polling lifecycle', () => {
    it('should start polling successfully', async () => {
      await poller.startPolling();
      
      const status = poller.getStatus();
      expect(status.isPolling).toBe(true);
    });

    it('should stop polling successfully', async () => {
      await poller.startPolling();
      await poller.stopPolling();
      
      const status = poller.getStatus();
      expect(status.isPolling).toBe(false);
    });

    it('should not start polling if already running', async () => {
      await poller.startPolling();
      
      // Should not throw error when starting again
      await expect(poller.startPolling()).resolves.not.toThrow();
      
      const status = poller.getStatus();
      expect(status.isPolling).toBe(true);
    });
  });

  describe('status reporting', () => {
    it('should return correct status when not polling', () => {
      const status = poller.getStatus();
      
      expect(status.isPolling).toBe(false);
      expect(status.systemId).toBe('test-system');
      expect(status.retryCount).toBe(0);
    });

    it('should return correct status when polling', async () => {
      await poller.startPolling();
      
      const status = poller.getStatus();
      expect(status.isPolling).toBe(true);
      expect(status.systemId).toBe('test-system');
    });
  });
});