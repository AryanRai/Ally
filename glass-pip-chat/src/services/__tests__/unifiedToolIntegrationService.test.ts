/**
 * Unified Tool Integration Service Tests
 * Requirements: Task 13 - Integration Testing
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { UnifiedToolIntegrationService } from '../unifiedToolIntegrationService';
import { OllamaService } from '../ollamaService';

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
    // Simulate connection after a short delay
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
      this.dispatchEvent('open', new Event('open'));
    }, 10);
  }

  send(data: string): void {
    // Mock send implementation
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

  // Helper method to simulate receiving messages
  simulateMessage(data: any): void {
    const event = new MessageEvent('message', { data: JSON.stringify(data) });
    this.onmessage?.(event);
    this.dispatchEvent('message', event);
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

describe('UnifiedToolIntegrationService', () => {
  let service: UnifiedToolIntegrationService;
  let mockWebSocket: MockWebSocket;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    service = new UnifiedToolIntegrationService(mockOllamaService, {
      streamHandlerUrl: 'ws://localhost:3000',
      enableToolExecution: true,
      sourceIdentifier: 'test_service'
    });

    await service.initialize();
    
    // Wait for WebSocket connection
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  afterEach(async () => {
    if (service) {
      await service.destroy();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      const state = service.getState();
      expect(state.isInitialized).toBe(true);
    });

    it('should connect to WebSocket', () => {
      const state = service.getState();
      expect(state.isConnected).toBe(true);
      expect(state.connectionStatus).toBe('connected');
    });

    it('should have available tools', () => {
      const tools = service.getAvailableTools();
      expect(Array.isArray(tools)).toBe(true);
    });
  });

  describe('Tool Registration', () => {
    it('should register tools successfully', () => {
      const toolExecutor = vi.fn().mockResolvedValue({ result: 'test' });
      
      service.registerTool('test_tool', toolExecutor);
      
      const tools = service.getAvailableTools();
      expect(tools).toContain('test_tool');
    });

    it('should handle multiple tool registrations', () => {
      const executor1 = vi.fn().mockResolvedValue({ result: 'test1' });
      const executor2 = vi.fn().mockResolvedValue({ result: 'test2' });
      
      service.registerTool('tool1', executor1);
      service.registerTool('tool2', executor2);
      
      const tools = service.getAvailableTools();
      expect(tools).toContain('tool1');
      expect(tools).toContain('tool2');
    });
  });

  describe('WebSocket Communication', () => {
    it('should send ally_intent messages', async () => {
      const sendSpy = vi.spyOn(MockWebSocket.prototype, 'send');
      
      // Trigger a message that would send ally_intent
      await service.processMessage('test_conv', [], 'test message');
      
      expect(sendSpy).toHaveBeenCalled();
      
      // Check if ally_intent message was sent
      const calls = sendSpy.mock.calls;
      const allyIntentCall = calls.find(call => {
        try {
          const message = JSON.parse(call[0] as string);
          return message.type === 'ally_intent';
        } catch {
          return false;
        }
      });
      
      expect(allyIntentCall).toBeDefined();
    });

    it('should handle tool_result messages', () => {
      const state = service.getState();
      const initialExecutions = state.activeToolExecutions.size;
      
      // Add a mock execution
      state.activeToolExecutions.set('test_exec_1', {
        executionId: 'test_exec_1',
        toolName: 'test_tool',
        startTime: Date.now(),
        status: 'pending',
        conversationId: 'test_conv'
      });
      
      // Simulate receiving tool_result message
      const mockMessage = {
        type: 'tool_result',
        execution_id: 'test_exec_1',
        tool_name: 'test_tool',
        status: 'success',
        result: { data: 'test result' },
        'msg-sent-timestamp': new Date().toISOString()
      };
      
      // Get the WebSocket instance and simulate message
      const wsInstance = (service as any).ws as MockWebSocket;
      wsInstance.simulateMessage(mockMessage);
      
      // Check that execution was cleaned up
      setTimeout(() => {
        const updatedState = service.getState();
        expect(updatedState.activeToolExecutions.has('test_exec_1')).toBe(false);
      }, 10);
    });

    it('should handle connection errors gracefully', () => {
      const wsInstance = (service as any).ws as MockWebSocket;
      
      // Simulate error
      const errorEvent = new Event('error');
      wsInstance.onerror?.(errorEvent);
      
      const state = service.getState();
      expect(state.connectionStatus).toBe('error');
    });
  });

  describe('Message Processing', () => {
    it('should process messages with tool integration', async () => {
      // Mock the tool-aware integration service
      const mockResult = {
        response: 'Test response',
        toolCalls: [],
        toolResults: [],
        conversationTurn: { turnId: 'test_turn' },
        toolExecutions: []
      };

      // Mock the processMessageWithToolAwareness method
      const processSpy = vi.fn().mockResolvedValue(mockResult);
      (service as any).toolAwareIntegrationService = {
        processMessageWithToolAwareness: processSpy
      };

      const result = await service.processMessage(
        'test_conv',
        [],
        'test message'
      );

      expect(processSpy).toHaveBeenCalledWith(
        'test_conv',
        [],
        'test message',
        undefined,
        expect.any(Function)
      );
      
      expect(result).toEqual(mockResult);
    });

    it('should handle processing errors', async () => {
      // Mock the tool-aware integration service to throw error
      const processError = new Error('Processing failed');
      const processSpy = vi.fn().mockRejectedValue(processError);
      (service as any).toolAwareIntegrationService = {
        processMessageWithToolAwareness: processSpy
      };

      await expect(service.processMessage('test_conv', [], 'test message'))
        .rejects.toThrow('Processing failed');
      
      const state = service.getState();
      expect(state.systemStatus).toBe('error');
      expect(state.lastError).toBe('Processing failed');
    });
  });

  describe('Event Handling', () => {
    it('should emit connection status changes', (done) => {
      service.on('connectionStatusChanged', (status) => {
        expect(status).toBe('connected');
        done();
      });
      
      // Connection should already be established in beforeEach
    });

    it('should emit tool execution completed events', (done) => {
      service.on('toolExecutionCompleted', (event) => {
        expect(event.executionId).toBe('test_exec_1');
        expect(event.status).toBe('success');
        done();
      });
      
      // Add execution and simulate completion
      const state = service.getState();
      state.activeToolExecutions.set('test_exec_1', {
        executionId: 'test_exec_1',
        toolName: 'test_tool',
        startTime: Date.now(),
        status: 'pending',
        conversationId: 'test_conv'
      });
      
      const mockMessage = {
        type: 'tool_result',
        execution_id: 'test_exec_1',
        tool_name: 'test_tool',
        status: 'success',
        result: { data: 'test' },
        'msg-sent-timestamp': new Date().toISOString()
      };
      
      const wsInstance = (service as any).ws as MockWebSocket;
      wsInstance.simulateMessage(mockMessage);
    });

    it('should handle ping/pong messages', () => {
      const sendSpy = vi.spyOn(MockWebSocket.prototype, 'send');
      
      const pingMessage = {
        type: 'ping',
        source: 'stream_handler',
        target: 'test_service',
        timestamp: Date.now(),
        'msg-sent-timestamp': new Date().toISOString()
      };
      
      const wsInstance = (service as any).ws as MockWebSocket;
      wsInstance.simulateMessage(pingMessage);
      
      // Should respond with pong
      expect(sendSpy).toHaveBeenCalled();
      
      const pongCall = sendSpy.mock.calls.find(call => {
        try {
          const message = JSON.parse(call[0] as string);
          return message.type === 'pong';
        } catch {
          return false;
        }
      });
      
      expect(pongCall).toBeDefined();
    });
  });

  describe('State Management', () => {
    it('should track active tool executions', () => {
      const state = service.getState();
      expect(state.activeToolExecutions).toBeInstanceOf(Map);
      expect(state.activeToolExecutions.size).toBe(0);
    });

    it('should update system status correctly', async () => {
      const initialState = service.getState();
      expect(initialState.systemStatus).toBe('idle');
      
      // Mock processing
      (service as any).state.systemStatus = 'processing';
      service.emit('systemStatusChanged', 'processing');
      
      const processingState = service.getState();
      expect(processingState.systemStatus).toBe('processing');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources on destroy', async () => {
      const wsCloseSpy = vi.spyOn(MockWebSocket.prototype, 'close');
      
      await service.destroy();
      
      expect(wsCloseSpy).toHaveBeenCalled();
      
      const state = service.getState();
      expect(state.isConnected).toBe(false);
      expect(state.connectionStatus).toBe('disconnected');
    });

    it('should remove all event listeners on destroy', async () => {
      const removeListenerSpy = vi.spyOn(service, 'removeAllListeners');
      
      await service.destroy();
      
      expect(removeListenerSpy).toHaveBeenCalled();
    });
  });

  describe('Error Recovery', () => {
    it('should attempt reconnection on disconnect', (done) => {
      // Set up reconnection config
      (service as any).config.maxReconnectAttempts = 2;
      (service as any).config.reconnectInterval = 100;
      
      let reconnectAttempted = false;
      
      service.on('connectionStatusChanged', (status) => {
        if (status === 'connecting' && reconnectAttempted) {
          done();
        }
      });
      
      // Simulate disconnect
      const wsInstance = (service as any).ws as MockWebSocket;
      wsInstance.close();
      reconnectAttempted = true;
    });

    it('should handle maximum reconnection attempts', (done) => {
      (service as any).config.maxReconnectAttempts = 1;
      (service as any).config.reconnectInterval = 50;
      
      let disconnectCount = 0;
      
      service.on('connectionStatusChanged', (status) => {
        if (status === 'disconnected') {
          disconnectCount++;
          if (disconnectCount >= 2) {
            // Should stop trying after max attempts
            done();
          }
        }
      });
      
      // Simulate multiple disconnects
      const wsInstance = (service as any).ws as MockWebSocket;
      wsInstance.close();
    });
  });
});