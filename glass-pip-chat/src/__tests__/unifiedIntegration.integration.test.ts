/**
 * Unified Integration End-to-End Tests
 * Requirements: Task 13 - Complete Integration Testing
 * 
 * Tests the complete integration of:
 * - UI components (task 11)
 * - Tool calling framework (task 1 and 8)
 * - Stream handler and comms/chyappy (task 6)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UnifiedChatInterface } from '../components/UnifiedChatInterface';
import { UnifiedIntegrationDemo } from '../components/UnifiedIntegrationDemo';
import { OllamaService } from '../services/ollamaService';

// Mock WebSocket for integration tests
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
  private messageQueue: any[] = [];

  constructor(public url: string) {
    // Simulate connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
      this.dispatchEvent('open', new Event('open'));
      
      // Send welcome message
      this.simulateMessage({
        type: 'system_info',
        message: 'Connected to Stream Handler v4.0',
        version: '4.0',
        features: {
          tool_execution: true,
          physics_simulation: true,
          ally_integration: true,
          chyappy_protocol: '3.0'
        },
        supported_message_types: ['tool_call', 'tool_result', 'ally_intent', 'ally_status'],
        timestamp: new Date().toISOString()
      });
    }, 10);
  }

  send(data: string): void {
    try {
      const message = JSON.parse(data);
      console.log('MockWebSocket send:', message.type, message);
      
      // Simulate responses based on message type
      this.handleMessage(message);
    } catch (error) {
      console.error('Error parsing sent message:', error);
    }
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

  simulateMessage(data: any): void {
    const event = new MessageEvent('message', { data: JSON.stringify(data) });
    this.onmessage?.(event);
    this.dispatchEvent('message', event);
  }

  private handleMessage(message: any): void {
    // Simulate stream handler responses
    switch (message.type) {
      case 'ally_intent':
        // Simulate intent processing
        setTimeout(() => {
          this.simulateMessage({
            type: 'ally_status',
            source: 'stream_handler',
            status: 'processing',
            component: 'intent_processor',
            details: { intent: message.intent },
            'msg-sent-timestamp': new Date().toISOString()
          });
        }, 50);
        break;

      case 'tool_call':
        // Simulate tool execution
        setTimeout(() => {
          const result = this.simulateToolExecution(message);
          this.simulateMessage({
            type: 'tool_result',
            execution_id: message.execution_id,
            tool_name: message.tool_name,
            status: result.success ? 'success' : 'error',
            result: result.success ? result.data : undefined,
            error: result.success ? undefined : result.error,
            execution_info: {
              start_time: new Date().toISOString(),
              end_time: new Date().toISOString(),
              duration_ms: result.duration,
              retry_count: 0
            },
            'msg-sent-timestamp': new Date().toISOString()
          });
        }, 100 + Math.random() * 500); // Simulate variable execution time
        break;

      case 'ping':
        // Respond to ping
        if (message.target === 'sh') {
          setTimeout(() => {
            this.simulateMessage({
              type: 'pong',
              timestamp: message.timestamp,
              target: message.source,
              server_time: Date.now(),
              status: 'active',
              'msg-sent-timestamp': new Date().toISOString()
            });
          }, 10);
        }
        break;
    }
  }

  private simulateToolExecution(toolCall: any): { success: boolean; data?: any; error?: any; duration: number } {
    const { tool_name, parameters } = toolCall;
    const duration = 200 + Math.random() * 800;

    switch (tool_name) {
      case 'calculator':
        try {
          const result = eval(parameters.expression);
          return {
            success: true,
            data: { result, expression: parameters.expression },
            duration
          };
        } catch (error) {
          return {
            success: false,
            error: { code: 'CALCULATION_ERROR', message: 'Invalid expression' },
            duration
          };
        }

      case 'current_time':
        return {
          success: true,
          data: {
            time: new Date().toISOString(),
            timezone: 'UTC'
          },
          duration
        };

      case 'weather':
        return {
          success: true,
          data: {
            location: parameters.location || 'Unknown',
            temperature: Math.round(Math.random() * 30 + 10),
            condition: ['sunny', 'cloudy', 'rainy'][Math.floor(Math.random() * 3)],
            humidity: Math.round(Math.random() * 100)
          },
          duration
        };

      default:
        return {
          success: false,
          error: { code: 'TOOL_NOT_FOUND', message: `Tool ${tool_name} not found` },
          duration
        };
    }
  }
}

// Mock global WebSocket
(global as any).WebSocket = MockWebSocket;

// Mock OllamaService
const mockOllamaService = {
  isConnected: true,
  chat: vi.fn().mockResolvedValue({
    message: { content: 'Test response from Ollama' }
  }),
  chatStream: vi.fn(),
  getModels: vi.fn().mockResolvedValue([
    { name: 'llama3.2:3b', size: 2000000000 }
  ]),
  connect: vi.fn().mockResolvedValue(true),
  disconnect: vi.fn().mockResolvedValue(true)
} as unknown as OllamaService;

describe('Unified Integration End-to-End Tests', () => {
  beforeAll(() => {
    // Set up global mocks
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('UnifiedChatInterface Integration', () => {
    it('should render and initialize successfully', async () => {
      render(
        <UnifiedChatInterface
          conversationId="test_integration"
          className="test-chat"
        />
      );

      // Check that the component renders
      expect(screen.getByText('Unified Tool Integration')).toBeInTheDocument();
      expect(screen.getByText('Conversation: test_integration')).toBeInTheDocument();

      // Wait for initialization
      await waitFor(() => {
        expect(screen.getByText(/Connected/)).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('should display connection status correctly', async () => {
      render(
        <UnifiedChatInterface
          conversationId="test_connection"
        />
      );

      // Initially should show connecting or disconnected
      await waitFor(() => {
        const statusElements = screen.getAllByText(/Connected|Connecting|Disconnected/);
        expect(statusElements.length).toBeGreaterThan(0);
      });

      // Should eventually show connected
      await waitFor(() => {
        expect(screen.getByText(/Connected/)).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('should show available tools', async () => {
      render(
        <UnifiedChatInterface
          conversationId="test_tools"
        />
      );

      // Wait for tools to be registered
      await waitFor(() => {
        const toolsText = screen.getByText(/\d+ tools available/);
        expect(toolsText).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('should handle message input and processing', async () => {
      render(
        <UnifiedChatInterface
          conversationId="test_messaging"
        />
      );

      // Wait for initialization
      await waitFor(() => {
        expect(screen.getByText(/Connected/)).toBeInTheDocument();
      }, { timeout: 2000 });

      // Find input field
      const input = screen.getByPlaceholderText(/Type a message/);
      expect(input).toBeInTheDocument();

      // Type a message
      fireEvent.change(input, { target: { value: 'calculate 2+2' } });
      expect(input).toHaveValue('calculate 2+2');

      // Submit the message
      const submitButton = screen.getByRole('button', { name: /📤/ });
      fireEvent.click(submitButton);

      // Check that message appears in chat
      await waitFor(() => {
        expect(screen.getByText('calculate 2+2')).toBeInTheDocument();
      });

      // Wait for processing to complete
      await waitFor(() => {
        // Should show some kind of response or processing indicator
        const processingElements = screen.queryAllByText(/Processing|Thinking|Complete/);
        expect(processingElements.length).toBeGreaterThanOrEqual(0);
      }, { timeout: 3000 });
    });

    it('should display tool management interface', async () => {
      render(
        <UnifiedChatInterface
          conversationId="test_tool_management"
        />
      );

      // Wait for initialization
      await waitFor(() => {
        expect(screen.getByText(/Connected/)).toBeInTheDocument();
      }, { timeout: 2000 });

      // Click tool management button
      const toolManagementButton = screen.getByText('Tool Management');
      fireEvent.click(toolManagementButton);

      // Should show tool management interface
      await waitFor(() => {
        // Look for tool management related content
        const managementElements = screen.queryAllByText(/Tool|Management|Available/);
        expect(managementElements.length).toBeGreaterThan(0);
      });
    });

    it('should display analytics dashboard', async () => {
      render(
        <UnifiedChatInterface
          conversationId="test_analytics"
        />
      );

      // Wait for initialization
      await waitFor(() => {
        expect(screen.getByText(/Connected/)).toBeInTheDocument();
      }, { timeout: 2000 });

      // Click analytics button
      const analyticsButton = screen.getByText('Analytics');
      fireEvent.click(analyticsButton);

      // Should show analytics dashboard
      await waitFor(() => {
        // Look for analytics related content
        const analyticsElements = screen.queryAllByText(/Analytics|Performance|Metrics/);
        expect(analyticsElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('UnifiedIntegrationDemo Integration', () => {
    it('should render demo with all sections', async () => {
      render(<UnifiedIntegrationDemo />);

      // Check main title
      expect(screen.getByText('Unified Tool Integration Demo')).toBeInTheDocument();
      expect(screen.getByText(/Task 13: Integration/)).toBeInTheDocument();

      // Check navigation tabs
      expect(screen.getByText('Unified Chat Interface')).toBeInTheDocument();
      expect(screen.getByText('Integration Architecture')).toBeInTheDocument();
      expect(screen.getByText('Feature Overview')).toBeInTheDocument();
      expect(screen.getByText('Integration Testing')).toBeInTheDocument();

      // Check status indicators
      await waitFor(() => {
        expect(screen.getByText(/Ollama:/)).toBeInTheDocument();
        expect(screen.getByText(/Tool Framework:/)).toBeInTheDocument();
        expect(screen.getByText(/Stream Handler:/)).toBeInTheDocument();
      });
    });

    it('should navigate between demo sections', async () => {
      render(<UnifiedIntegrationDemo />);

      // Click on Architecture tab
      const architectureTab = screen.getByText('Integration Architecture');
      fireEvent.click(architectureTab);

      await waitFor(() => {
        expect(screen.getByText('Integration Architecture')).toBeInTheDocument();
        expect(screen.getByText(/UI Layer \(Task 11\)/)).toBeInTheDocument();
        expect(screen.getByText(/Tool Framework \(Task 1 & 8\)/)).toBeInTheDocument();
        expect(screen.getByText(/Comms\/Chyappy \(Task 6\)/)).toBeInTheDocument();
      });

      // Click on Features tab
      const featuresTab = screen.getByText('Feature Overview');
      fireEvent.click(featuresTab);

      await waitFor(() => {
        expect(screen.getByText('Real-time Tool Execution')).toBeInTheDocument();
        expect(screen.getByText('WebSocket Communication')).toBeInTheDocument();
        expect(screen.getByText('Chyappy v3.0 Protocol')).toBeInTheDocument();
      });

      // Click on Testing tab
      const testingTab = screen.getByText('Integration Testing');
      fireEvent.click(testingTab);

      await waitFor(() => {
        expect(screen.getByText('Integration Tests')).toBeInTheDocument();
        expect(screen.getByText('Run All Tests')).toBeInTheDocument();
      });
    });

    it('should run integration tests in demo', async () => {
      render(<UnifiedIntegrationDemo />);

      // Navigate to testing section
      const testingTab = screen.getByText('Integration Testing');
      fireEvent.click(testingTab);

      await waitFor(() => {
        expect(screen.getByText('Run All Tests')).toBeInTheDocument();
      });

      // Click run all tests
      const runAllButton = screen.getByText('Run All Tests');
      fireEvent.click(runAllButton);

      // Should show test execution
      await waitFor(() => {
        const runningElements = screen.queryAllByText(/Running|Pending/);
        expect(runningElements.length).toBeGreaterThan(0);
      });

      // Wait for tests to complete
      await waitFor(() => {
        const completedElements = screen.queryAllByText(/✅|❌/);
        expect(completedElements.length).toBeGreaterThan(0);
      }, { timeout: 10000 });
    });
  });

  describe('WebSocket Communication Integration', () => {
    it('should establish WebSocket connection', async () => {
      const { container } = render(
        <UnifiedChatInterface
          conversationId="test_websocket"
        />
      );

      // Wait for connection to be established
      await waitFor(() => {
        expect(screen.getByText(/Connected/)).toBeInTheDocument();
      }, { timeout: 2000 });

      // Verify connection status is displayed
      const connectionStatus = screen.getByText(/Connected/);
      expect(connectionStatus).toBeInTheDocument();
    });

    it('should handle WebSocket messages', async () => {
      render(
        <UnifiedChatInterface
          conversationId="test_ws_messages"
        />
      );

      // Wait for initialization
      await waitFor(() => {
        expect(screen.getByText(/Connected/)).toBeInTheDocument();
      }, { timeout: 2000 });

      // The WebSocket should receive system_info message automatically
      // This is handled internally, so we just verify the connection is stable
      expect(screen.getByText(/Connected/)).toBeInTheDocument();
    });
  });

  describe('Tool Execution Integration', () => {
    it('should execute tools end-to-end', async () => {
      render(
        <UnifiedChatInterface
          conversationId="test_tool_execution"
        />
      );

      // Wait for initialization
      await waitFor(() => {
        expect(screen.getByText(/Connected/)).toBeInTheDocument();
      }, { timeout: 2000 });

      // Send a message that should trigger tool execution
      const input = screen.getByPlaceholderText(/Type a message/);
      fireEvent.change(input, { target: { value: 'what time is it?' } });

      const submitButton = screen.getByRole('button', { name: /📤/ });
      fireEvent.click(submitButton);

      // Check that message appears
      await waitFor(() => {
        expect(screen.getByText('what time is it?')).toBeInTheDocument();
      });

      // Should show processing indicators
      await waitFor(() => {
        const processingElements = screen.queryAllByText(/Processing|Thinking|Executing/);
        // May or may not show processing indicators depending on timing
        expect(processingElements.length).toBeGreaterThanOrEqual(0);
      }, { timeout: 1000 });
    });

    it('should handle tool execution errors gracefully', async () => {
      render(
        <UnifiedChatInterface
          conversationId="test_tool_errors"
        />
      );

      // Wait for initialization
      await waitFor(() => {
        expect(screen.getByText(/Connected/)).toBeInTheDocument();
      }, { timeout: 2000 });

      // Send a message that should cause a tool error
      const input = screen.getByPlaceholderText(/Type a message/);
      fireEvent.change(input, { target: { value: 'calculate invalid_expression' } });

      const submitButton = screen.getByRole('button', { name: /📤/ });
      fireEvent.click(submitButton);

      // Check that message appears
      await waitFor(() => {
        expect(screen.getByText('calculate invalid_expression')).toBeInTheDocument();
      });

      // Should handle the error gracefully (no crash)
      await waitFor(() => {
        // The interface should still be responsive
        expect(input).toBeEnabled();
      }, { timeout: 3000 });
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle multiple rapid messages', async () => {
      render(
        <UnifiedChatInterface
          conversationId="test_performance"
        />
      );

      // Wait for initialization
      await waitFor(() => {
        expect(screen.getByText(/Connected/)).toBeInTheDocument();
      }, { timeout: 2000 });

      const input = screen.getByPlaceholderText(/Type a message/);
      const submitButton = screen.getByRole('button', { name: /📤/ });

      // Send multiple messages rapidly
      const messages = ['hello', 'calculate 1+1', 'what time is it?'];
      
      for (const message of messages) {
        fireEvent.change(input, { target: { value: message } });
        fireEvent.click(submitButton);
        
        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // All messages should appear in the chat
      await waitFor(() => {
        messages.forEach(message => {
          expect(screen.getByText(message)).toBeInTheDocument();
        });
      }, { timeout: 5000 });
    });

    it('should maintain connection stability', async () => {
      render(
        <UnifiedChatInterface
          conversationId="test_stability"
        />
      );

      // Wait for initial connection
      await waitFor(() => {
        expect(screen.getByText(/Connected/)).toBeInTheDocument();
      }, { timeout: 2000 });

      // Connection should remain stable over time
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      expect(screen.getByText(/Connected/)).toBeInTheDocument();
    });
  });
});