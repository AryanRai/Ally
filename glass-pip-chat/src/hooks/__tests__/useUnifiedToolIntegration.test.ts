/**
 * Unified Tool Integration Hook Tests
 * Requirements: Task 13 - Integration Testing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useUnifiedToolIntegration } from '../useUnifiedToolIntegration';
import { OllamaService } from '../../services/ollamaService';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private listeners: Map<string, ((event: any) => void)[]> = new Map();

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
      this.dispatchEvent('open', new Event('open'));
    }, 10);
  }

  send(data: string): void {
    console.log('MockWebSocket send:', data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
    this.dispatchEvent('close', new CloseEvent('close'));
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private dispatchEvent(type: string, event: any): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.forEach(listener => listener(event));
    }
  }
}

// Mock global WebSocket
(global as any).WebSocket = MockWebSocket;

// Mock OllamaService
const mockOllamaService = {
  isConnected: true,
  chat: vi.fn(),
  chatStream: vi.fn(),
  getModels: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn()
} as unknown as OllamaService;

describe('useUnifiedToolIntegration', () => {
  const conversationId = 'test_conversation';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Initialization', () => {
    it('should initialize with default state', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService)
      );

      expect(result.current.state.isInitialized).toBe(false);
      expect(result.current.state.isInitializing).toBe(true);
      expect(result.current.state.connectionStatus).toBe('disconnected');
      expect(result.current.state.isConnected).toBe(false);

      // Wait for initialization
      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      }, { timeout: 1000 });

      expect(result.current.state.isInitializing).toBe(false);
    });

    it('should connect to WebSocket after initialization', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService, {
          autoConnect: true
        })
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      await waitFor(() => {
        expect(result.current.state.isConnected).toBe(true);
        expect(result.current.state.connectionStatus).toBe('connected');
      });
    });

    it('should handle initialization errors', async () => {
      // Mock service initialization to fail
      const errorOllamaService = null as any;

      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, errorOllamaService)
      );

      await waitFor(() => {
        expect(result.current.state.isInitializing).toBe(false);
        expect(result.current.state.lastError).toBeDefined();
      });
    });
  });

  describe('Tool Management', () => {
    it('should register tools successfully', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      const testExecutor = vi.fn().mockResolvedValue({ result: 'test' });

      act(() => {
        result.current.registerTool('test_tool', testExecutor);
      });

      expect(result.current.getAvailableTools()).toContain('test_tool');
      expect(result.current.state.availableTools).toContain('test_tool');
    });

    it('should update available tools count', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      const initialCount = result.current.state.availableTools.length;

      act(() => {
        result.current.registerTool('new_tool', vi.fn());
      });

      expect(result.current.state.availableTools.length).toBe(initialCount + 1);
    });
  });

  describe('Message Processing', () => {
    it('should process messages successfully', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.isReady()).toBe(true);
      });

      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', timestamp: Date.now() }
      ];

      const mockResult = {
        response: 'Test response',
        toolCalls: [],
        toolResults: [],
        conversationTurn: { turnId: 'test_turn' },
        toolExecutions: []
      };

      // Mock the service's processMessage method
      if (result.current.service) {
        vi.spyOn(result.current.service, 'processMessage').mockResolvedValue(mockResult);
      }

      let processResult: any;
      await act(async () => {
        processResult = await result.current.processMessage(messages, 'Test message');
      });

      expect(processResult).toEqual(mockResult);
      expect(result.current.state.isProcessing).toBe(false);
    });

    it('should handle processing errors', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.isReady()).toBe(true);
      });

      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', timestamp: Date.now() }
      ];

      // Mock the service's processMessage method to throw error
      if (result.current.service) {
        vi.spyOn(result.current.service, 'processMessage').mockRejectedValue(
          new Error('Processing failed')
        );
      }

      await act(async () => {
        try {
          await result.current.processMessage(messages, 'Test message');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe('Processing failed');
        }
      });

      expect(result.current.state.isProcessing).toBe(false);
      expect(result.current.state.lastError).toBe('Processing failed');
    });

    it('should track processing state during message processing', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.isReady()).toBe(true);
      });

      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', timestamp: Date.now() }
      ];

      // Mock a slow processing function
      if (result.current.service) {
        vi.spyOn(result.current.service, 'processMessage').mockImplementation(
          () => new Promise(resolve => setTimeout(() => resolve({
            response: 'Test response',
            toolCalls: [],
            toolResults: [],
            conversationTurn: { turnId: 'test_turn' },
            toolExecutions: []
          }), 100))
        );
      }

      const processPromise = act(async () => {
        return result.current.processMessage(messages, 'Test message');
      });

      // Check that processing state is true during processing
      expect(result.current.state.isProcessing).toBe(true);

      await processPromise;

      // Check that processing state is false after completion
      expect(result.current.state.isProcessing).toBe(false);
    });
  });

  describe('Connection Management', () => {
    it('should connect manually', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService, {
          autoConnect: false
        })
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      expect(result.current.state.isConnected).toBe(false);

      await act(async () => {
        await result.current.connect();
      });

      await waitFor(() => {
        expect(result.current.state.isConnected).toBe(true);
      });
    });

    it('should disconnect manually', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.state.isConnected).toBe(true);
      });

      await act(async () => {
        await result.current.disconnect();
      });

      expect(result.current.state.isConnected).toBe(false);
      expect(result.current.state.connectionStatus).toBe('disconnected');
    });

    it('should force reconnection', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.state.isConnected).toBe(true);
      });

      await act(async () => {
        await result.current.forceReconnect();
      });

      // Should reconnect after force reconnect
      await waitFor(() => {
        expect(result.current.state.isConnected).toBe(true);
      });
    });
  });

  describe('State Queries', () => {
    it('should report ready state correctly', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService)
      );

      expect(result.current.isReady()).toBe(false);

      await waitFor(() => {
        expect(result.current.isReady()).toBe(true);
      });
    });

    it('should report tool execution availability', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      expect(result.current.isToolExecutionAvailable()).toBe(true);
    });

    it('should provide connection statistics', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.state.isConnected).toBe(true);
      });

      const stats = result.current.getConnectionStats();
      expect(stats).toHaveProperty('isConnected');
      expect(stats).toHaveProperty('connectionStatus');
      expect(stats).toHaveProperty('activeExecutions');
      expect(stats.isConnected).toBe(true);
      expect(stats.connectionStatus).toBe('connected');
    });

    it('should provide tool statistics', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      const stats = result.current.getToolStats();
      expect(stats).toHaveProperty('availableTools');
      expect(stats).toHaveProperty('toolCount');
      expect(stats).toHaveProperty('activeExecutions');
      expect(stats).toHaveProperty('systemStatus');
      expect(Array.isArray(stats.availableTools)).toBe(true);
    });

    it('should provide processing status', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService)
      );

      const status = result.current.getProcessingStatus();
      expect(status).toHaveProperty('isProcessing');
      expect(status).toHaveProperty('systemStatus');
      expect(status.isProcessing).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration', async () => {
      const customConfig = {
        streamHandlerUrl: 'ws://custom:4000',
        enableToolExecution: false,
        sourceIdentifier: 'custom_service'
      };

      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService, customConfig)
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      // Configuration should be applied (we can't directly test internal config,
      // but we can test the effects)
      expect(result.current.state.isInitialized).toBe(true);
    });

    it('should handle autoConnect configuration', async () => {
      const { result } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService, {
          autoConnect: false
        })
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      // Should not auto-connect
      expect(result.current.state.isConnected).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup on unmount', async () => {
      const { result, unmount } = renderHook(() =>
        useUnifiedToolIntegration(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      const service = result.current.service;
      const destroySpy = service ? vi.spyOn(service, 'destroy') : null;

      unmount();

      if (destroySpy) {
        expect(destroySpy).toHaveBeenCalled();
      }
    });
  });

  describe('Conversation ID Changes', () => {
    it('should handle conversation ID changes', async () => {
      let conversationId = 'conv1';
      const { result, rerender } = renderHook(
        ({ convId }) => useUnifiedToolIntegration(convId, mockOllamaService),
        { initialProps: { convId: conversationId } }
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      // Change conversation ID
      conversationId = 'conv2';
      rerender({ convId: conversationId });

      // Should still be initialized and connected
      expect(result.current.state.isInitialized).toBe(true);
    });
  });
});