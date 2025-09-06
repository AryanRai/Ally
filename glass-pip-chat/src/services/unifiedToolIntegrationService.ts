/**
 * Unified Tool Integration Service - Simplified Version
 * Requirements: Task 13 - Integration of UI, Tool Framework, and Comms
 * 
 * Integrates:
 * - UI tool calling components (task 11)
 * - Tool calling service (existing implementation)
 * - Stream handler and comms/chyappy (task 6)
 */

// Browser-compatible EventEmitter implementation
class BrowserEventEmitter {
  private listeners: Map<string, Function[]> = new Map();

  emit(event: string, data?: any): boolean {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(data));
      return true;
    }
    return false;
  }

  on(event: string, listener: Function): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    return this;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}
import { OllamaService, ChatMessage } from './ollamaService';
import { ToolAwareIntegrationService, ToolAwareProcessingProgress } from './toolAwareIntegrationService';
import { ToolAwareConversationManager } from '../utils/toolAwareConversationManager';
import { ToolCallingService } from './toolCallingService';
import { Message } from '../types/chat';

// WebSocket connection for Comms integration
interface CommsWebSocket {
  send(data: string): void;
  addEventListener(event: string, handler: (event: any) => void): void;
  removeEventListener(event: string, handler: (event: any) => void): void;
  readyState: number;
}

// Chyappy v3.0 message types
interface ChyappyMessage {
  type: string;
  source: string;
  'msg-sent-timestamp': string;
  [key: string]: any;
}

interface ToolCallMessage extends ChyappyMessage {
  type: 'tool_call';
  tool_name: string;
  parameters: Record<string, any>;
  execution_id: string;
  context: {
    userId?: string;
    sessionId: string;
    conversationId: string;
    timeout?: number;
  };
  correlation_id?: string;
  workflow_id?: string;
}

interface ToolResultMessage extends ChyappyMessage {
  type: 'tool_result';
  execution_id: string;
  tool_name: string;
  status: 'success' | 'error' | 'timeout' | 'cancelled';
  result?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  execution_info?: {
    start_time: string;
    end_time: string;
    duration_ms: number;
    retry_count?: number;
  };
}

interface AllyIntentMessage extends ChyappyMessage {
  type: 'ally_intent';
  intent: string;
  slots: Record<string, any>;
  confidence: number;
  context: Record<string, any>;
}

interface AllyStatusMessage extends ChyappyMessage {
  type: 'ally_status';
  status: 'active' | 'processing' | 'idle' | 'error';
  component: string;
  details?: Record<string, any>;
}

export interface UnifiedIntegrationConfig {
  // WebSocket connection settings
  streamHandlerUrl: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  
  // Tool execution settings
  enableToolExecution: boolean;
  toolExecutionTimeout: number;
  maxConcurrentTools: number;
  
  // Conversation settings
  enableConversationMemory: boolean;
  maxConversationHistory: number;
  
  // Chyappy protocol settings
  sourceIdentifier: string;
  enableHeartbeat: boolean;
  heartbeatInterval: number;
}

export interface UnifiedIntegrationState {
  isConnected: boolean;
  isInitialized: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastError?: string;
  activeToolExecutions: Map<string, ToolExecutionContext>;
  conversationContext?: any;
  systemStatus: 'idle' | 'processing' | 'error';
}

interface ToolExecutionContext {
  executionId: string;
  toolName: string;
  startTime: number;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  conversationId: string;
  messageId?: string;
  onProgress?: (progress: ToolAwareProcessingProgress) => void;
  onComplete?: (result: any) => void;
  onError?: (error: any) => void;
}

export class UnifiedToolIntegrationService extends BrowserEventEmitter {
  private config: UnifiedIntegrationConfig;
  private state: UnifiedIntegrationState;
  
  // Core services
  private ollamaService: OllamaService;
  private toolAwareIntegrationService: ToolAwareIntegrationService | null = null;
  private conversationManager: ToolAwareConversationManager | null = null;
  private toolCallingService: ToolCallingService | null = null;
  private registeredTools: Map<string, any> = new Map();
  
  // WebSocket connection
  private ws: CommsWebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  
  // Message handlers
  private messageHandlers: Map<string, (message: ChyappyMessage) => Promise<void>> = new Map();

  constructor(
    ollamaService: OllamaService,
    config: Partial<UnifiedIntegrationConfig> = {}
  ) {
    super();
    
    this.ollamaService = ollamaService;
    this.config = {
      streamHandlerUrl: 'ws://localhost:3000',
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      enableToolExecution: true,
      toolExecutionTimeout: 300000, // 5 minutes
      maxConcurrentTools: 5,
      enableConversationMemory: true,
      maxConversationHistory: 100,
      sourceIdentifier: 'ally_glass_pip_chat',
      enableHeartbeat: true,
      heartbeatInterval: 30000, // 30 seconds
      ...config
    };
    
    this.state = {
      isConnected: false,
      isInitialized: false,
      connectionStatus: 'disconnected',
      activeToolExecutions: new Map(),
      systemStatus: 'idle'
    };
    
    this.setupMessageHandlers();
  }

  /**
   * Initialize the unified integration service
   */
  async initialize(): Promise<void> {
    if (this.state.isInitialized) {
      return;
    }

    try {
      console.log('Initializing Unified Tool Integration Service...');
      
      // Initialize conversation manager
      this.conversationManager = new ToolAwareConversationManager({
        maxHistoryLength: this.config.maxConversationHistory,
        maxToolExecutionsPerTurn: this.config.maxConcurrentTools,
        enableToolContextPersistence: true,
        enableConversationMemory: this.config.enableConversationMemory
      });
      
      // Initialize tool calling service with existing implementation
      this.toolCallingService = new ToolCallingService(
        this.ollamaService,
        null as any, // toolManager - simplified
        null as any, // toolRegistry - simplified
        null as any, // toolExecutor - simplified
        {
          enableToolCalling: this.config.enableToolExecution,
          maxToolCalls: this.config.maxConcurrentTools,
          toolCallTimeout: this.config.toolExecutionTimeout,
          enableMultiStepReasoning: true
        }
      );
      
      // Initialize tool-aware integration service
      this.toolAwareIntegrationService = new ToolAwareIntegrationService(
        this.ollamaService,
        this.toolCallingService,
        this.conversationManager
      );
      
      this.state.isInitialized = true;
      console.log('Unified Tool Integration Service initialized successfully');
      
      // Connect to stream handler
      await this.connect();
      
    } catch (error) {
      console.error('Failed to initialize Unified Tool Integration Service:', error);
      this.state.lastError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  /**
   * Connect to the stream handler WebSocket
   */
  async connect(): Promise<void> {
    if (this.state.connectionStatus === 'connecting' || this.state.isConnected) {
      return;
    }

    this.state.connectionStatus = 'connecting';
    this.emit('connectionStatusChanged', 'connecting');

    try {
      console.log(`Connecting to stream handler: ${this.config.streamHandlerUrl}`);
      
      // Create WebSocket connection
      this.ws = new WebSocket(this.config.streamHandlerUrl) as any;
      
      this.ws.addEventListener('open', this.handleWebSocketOpen.bind(this));
      this.ws.addEventListener('message', this.handleWebSocketMessage.bind(this));
      this.ws.addEventListener('close', this.handleWebSocketClose.bind(this));
      this.ws.addEventListener('error', this.handleWebSocketError.bind(this));
      
    } catch (error) {
      console.error('Failed to connect to stream handler:', error);
      this.state.connectionStatus = 'error';
      this.state.lastError = error instanceof Error ? error.message : 'Connection failed';
      this.emit('connectionStatusChanged', 'error');
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the stream handler
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    
    this.ws = null;
    this.state.isConnected = false;
    this.state.connectionStatus = 'disconnected';
    this.reconnectAttempts = 0;
    
    this.emit('connectionStatusChanged', 'disconnected');
  }

  /**
   * Process message with unified tool integration
   */
  async processMessage(
    conversationId: string,
    messages: Message[],
    newMessage: string,
    model?: string,
    onProgress?: (progress: ToolAwareProcessingProgress) => void
  ): Promise<any> {
    if (!this.state.isInitialized) {
      throw new Error('Service not initialized');
    }

    this.state.systemStatus = 'processing';
    this.emit('systemStatusChanged', 'processing');

    try {
      // Send ally_intent message to stream handler
      await this.sendAllyIntent(conversationId, newMessage);
      
      // Start with multi-turn conversation approach
      return await this.processWithToolAwareConversation(
        messages,
        newMessage,
        model || 'llama3.2:3b',
        onProgress
      );
      
    } catch (error) {
      this.state.systemStatus = 'error';
      this.state.lastError = error instanceof Error ? error.message : 'Processing error';
      this.emit('systemStatusChanged', 'error');
      throw error;
    } finally {
      this.state.systemStatus = 'idle';
      this.emit('systemStatusChanged', 'idle');
    }
  }

  /**
   * Process message with tool-aware conversation flow
   */
  private async processWithToolAwareConversation(
    messages: Message[],
    newMessage: string,
    model: string,
    onProgress?: (progress: ToolAwareProcessingProgress) => void
  ): Promise<any> {
    // Convert messages to ChatMessage format
    let chatMessages = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));
    
    // Add the new message with tool context
    const toolPrompt = this.buildToolAwarePrompt(newMessage);
    chatMessages.push({
      role: 'user',
      content: toolPrompt
    });

    let fullResponse = '';
    let thinkingContent = '';
    let allToolCalls: any[] = [];
    let allToolResults: any[] = [];
    let conversationComplete = false;
    let turnCount = 0;
    const maxTurns = 5; // Prevent infinite loops
    let conversationParts: string[] = []; // Track conversation parts

    while (!conversationComplete && turnCount < maxTurns) {
      turnCount++;
      
      // Stream the AI's response
      let currentResponse = '';
      let currentThinking = '';
      
      await this.ollamaService.streamChatWithThinking(
        chatMessages,
        model,
        async (chunk) => {
          if (chunk.type === 'thinking') {
            currentThinking = chunk.content;
            thinkingContent = chunk.content;
            onProgress?.({
              type: 'thinking',
              content: chunk.content,
              thinking: chunk.content,
              response: fullResponse,
              isComplete: false
            });
          } else if (chunk.type === 'response') {
            currentResponse = chunk.content;
            
            // Build the current turn response
            currentResponse = chunk.content;
            
            onProgress?.({
              type: 'response',
              content: chunk.content,
              thinking: thinkingContent,
              response: chunk.content,
              toolCalls: allToolCalls,
              toolResults: allToolResults,
              isComplete: false
            });
          } else if (chunk.type === 'done') {
            currentResponse = chunk.content;
          }
        }
      );

      // After streaming completes, check if tools need to be called
      const detectedToolCalls = this.detectToolCallsInResponse(currentResponse, newMessage);
      
      if (detectedToolCalls.length > 0) {
        // Add current response to conversation parts
        conversationParts.push(currentResponse);
        fullResponse = conversationParts.join('\n\n');
        
        // Tools detected - execute them
        onProgress?.({
          type: 'tool_call',
          content: 'Executing tools...',
          thinking: thinkingContent,
          response: fullResponse,
          toolCalls: detectedToolCalls,
          isComplete: false
        });

        // Execute tools
        const toolResults = await this.executeToolsAsync(detectedToolCalls);
        allToolCalls.push(...detectedToolCalls);
        allToolResults.push(...toolResults);

        onProgress?.({
          type: 'tool_result',
          content: 'Tool execution completed',
          thinking: thinkingContent,
          response: fullResponse,
          toolCalls: allToolCalls,
          toolResults: allToolResults,
          isComplete: false
        });

        // Add the AI's response and tool results to conversation
        chatMessages.push({
          role: 'assistant',
          content: currentResponse
        });

        // Add tool results as system message
        const toolResultsText = toolResults.map(tr => 
          `Tool ${tr.name} result: ${JSON.stringify(tr.result || tr.error)}`
        ).join('\n');
        
        chatMessages.push({
          role: 'user',
          content: `Here are the tool results:\n${toolResultsText}\n\nNow provide a natural, complete response to the user's original question using this information. Be concise and direct.`
        });

        // Continue the conversation with tool results
      } else {
        // No tools detected - add final response and complete
        conversationParts.push(currentResponse);
        fullResponse = conversationParts.join('\n\n');
        conversationComplete = true;
      }
    }

    onProgress?.({
      type: 'done',
      content: fullResponse,
      thinking: thinkingContent,
      response: fullResponse,
      toolCalls: allToolCalls,
      toolResults: allToolResults,
      isComplete: true
    });

    return {
      response: fullResponse,
      thinking: thinkingContent,
      toolCalls: allToolCalls,
      toolResults: allToolResults,
      conversationTurn: { turnId: `turn_${Date.now()}` },
      toolExecutions: []
    };
  }

  /**
   * Build tool-aware prompt that includes available tools
   */
  private buildToolAwarePrompt(message: string): string {
    const availableTools = Array.from(this.registeredTools.keys());
    
    if (availableTools.length === 0) {
      return message;
    }

    const toolDescriptions = availableTools.map(toolName => {
      switch (toolName) {
        case 'calculator':
          return '- calculator: For mathematical calculations and expressions';
        case 'current_time':
          return '- current_time: For getting current date and time';
        case 'weather':
          return '- weather: For getting weather information for locations';
        case 'system_info':
          return '- system_info: For getting system and browser information';
        default:
          return `- ${toolName}: Available tool`;
      }
    }).join('\n');

    return `You are an AI assistant with access to these tools:
${toolDescriptions}

IMPORTANT: When you need to use a tool, simply mention that you'll use it and then STOP your response. Do not provide fallback information or continue talking. Just say you'll use the tool and wait.

Examples:
- For time questions: "Let me check the current time for you."
- For math questions: "Let me calculate that for you."
- For weather questions: "Let me get the weather information for you."
- For system questions: "Let me check your system information."

After I execute the tool and provide results, you can then give a complete response with the actual information.

User: ${message}`;
  }

  /**
   * Detect tool calls in streaming response
   */
  private detectToolCallsInResponse(response: string, originalMessage?: string): any[] {
    const toolCalls: any[] = [];
    const lowerResponse = response.toLowerCase();

    // Look for specific phrases that indicate the AI wants to use tools
    
    // Calculator tool - look for intention phrases
    if ((lowerResponse.includes('let me calculate') || 
         lowerResponse.includes('i\'ll calculate') ||
         lowerResponse.includes('let me compute') ||
         lowerResponse.includes('i\'ll compute') ||
         lowerResponse.includes('let me work out') ||
         lowerResponse.includes('calculating') ||
         (lowerResponse.includes('calculate') && lowerResponse.includes('for you'))) && 
        !toolCalls.some(tc => tc.name === 'calculator')) {
      
      // Try to extract expression from the original message
      const match = originalMessage?.match(/(\d+[\+\-\*\/\d\s\(\)\.]+)/) ||
                   response.match(/(\d+[\+\-\*\/\d\s\(\)\.]+)/);
      if (match) {
        toolCalls.push({
          name: 'calculator',
          parameters: { expression: match[1].trim() }
        });
      } else {
        // If no specific expression found, use a general one from the message
        const simpleMatch = originalMessage?.match(/(\d+\s*[\+\-\*\/]\s*\d+)/);
        if (simpleMatch) {
          toolCalls.push({
            name: 'calculator',
            parameters: { expression: simpleMatch[1].trim() }
          });
        }
      }
    }

    // Time tool - look for intention phrases
    if ((lowerResponse.includes('let me check the current time') || 
         lowerResponse.includes('i\'ll check the current time') ||
         lowerResponse.includes('let me get the current time') ||
         lowerResponse.includes('i\'ll get the current time') ||
         lowerResponse.includes('let me check the time') ||
         lowerResponse.includes('i\'ll check the time')) && 
        !toolCalls.some(tc => tc.name === 'current_time')) {
      toolCalls.push({
        name: 'current_time',
        parameters: {}
      });
    }

    // Weather tool - look for intention phrases
    if ((lowerResponse.includes('let me get the weather') || 
         lowerResponse.includes('i\'ll get the weather') ||
         lowerResponse.includes('let me check the weather') ||
         lowerResponse.includes('i\'ll check the weather') ||
         lowerResponse.includes('getting weather information') ||
         (lowerResponse.includes('get') && lowerResponse.includes('weather'))) && 
        !toolCalls.some(tc => tc.name === 'weather')) {
      
      const locationMatch = response.match(/weather.*?(?:in|for)\s+([a-zA-Z\s]+)/i) ||
                           originalMessage?.match(/weather.*?(?:in|for)\s+([a-zA-Z\s]+)/i) ||
                           originalMessage?.match(/(?:in|for)\s+([a-zA-Z\s]+)/i);
      const location = locationMatch ? locationMatch[1].trim() : 'current location';
      toolCalls.push({
        name: 'weather',
        parameters: { location }
      });
    }

    // System info tool - look for intention phrases
    if ((lowerResponse.includes('let me check your system') || 
         lowerResponse.includes('i\'ll check your system') ||
         lowerResponse.includes('let me get system information') ||
         lowerResponse.includes('i\'ll get system information') ||
         lowerResponse.includes('checking system information') ||
         (lowerResponse.includes('check') && lowerResponse.includes('system'))) && 
        !toolCalls.some(tc => tc.name === 'system_info')) {
      toolCalls.push({
        name: 'system_info',
        parameters: {}
      });
    }

    return toolCalls;
  }

  /**
   * Execute tools asynchronously without blocking
   */
  private async executeToolsAsync(toolCalls: any[]): Promise<any[]> {
    return Promise.all(
      toolCalls.map(async (toolCall) => {
        const tool = this.registeredTools.get(toolCall.name);
        if (tool) {
          try {
            const result = await tool(toolCall.parameters);
            return {
              name: toolCall.name,
              result,
              success: true
            };
          } catch (error) {
            return {
              name: toolCall.name,
              error: error instanceof Error ? error.message : 'Unknown error',
              success: false
            };
          }
        }
        return {
          name: toolCall.name,
          error: 'Tool not found',
          success: false
        };
      })
    );
  }

  /**
   * Execute registered tools based on message content
   */
  private async executeRegisteredTools(message: string): Promise<any> {
    // Simple pattern matching for demo tools
    if (message.toLowerCase().includes('calculate') || message.match(/\d+[\+\-\*\/]\d+/)) {
      const calculatorTool = this.registeredTools.get('calculator');
      if (calculatorTool) {
        const match = message.match(/(\d+[\+\-\*\/\d\s\(\)\.]+)/);
        if (match) {
          try {
            const result = await calculatorTool({ expression: match[1] });
            return {
              response: `The result is: ${result.result}`,
              toolCalls: [{ name: 'calculator', parameters: { expression: match[1] } }],
              toolResults: [{ name: 'calculator', result }]
            };
          } catch (error) {
            return {
              response: `Error calculating: ${error instanceof Error ? error.message : 'Unknown error'}`,
              toolCalls: [{ name: 'calculator', parameters: { expression: match[1] } }],
              toolResults: [{ name: 'calculator', error: error instanceof Error ? error.message : 'Unknown error' }]
            };
          }
        }
      }
    }
    
    if (message.toLowerCase().includes('time')) {
      const timeTool = this.registeredTools.get('current_time');
      if (timeTool) {
        try {
          const result = await timeTool({});
          return {
            response: `Current time: ${result.formatted}`,
            toolCalls: [{ name: 'current_time', parameters: {} }],
            toolResults: [{ name: 'current_time', result }]
          };
        } catch (error) {
          return {
            response: `Error getting time: ${error instanceof Error ? error.message : 'Unknown error'}`,
            toolCalls: [{ name: 'current_time', parameters: {} }],
            toolResults: [{ name: 'current_time', error: error instanceof Error ? error.message : 'Unknown error' }]
          };
        }
      }
    }
    
    if (message.toLowerCase().includes('weather')) {
      const weatherTool = this.registeredTools.get('weather');
      if (weatherTool) {
        const locationMatch = message.match(/weather.*?(?:in|for)\s+([a-zA-Z\s]+)/i);
        const location = locationMatch ? locationMatch[1].trim() : 'Unknown';
        try {
          const result = await weatherTool({ location });
          return {
            response: `Weather in ${result.location}: ${result.temperature}°C, ${result.condition}`,
            toolCalls: [{ name: 'weather', parameters: { location } }],
            toolResults: [{ name: 'weather', result }]
          };
        } catch (error) {
          return {
            response: `Error getting weather: ${error instanceof Error ? error.message : 'Unknown error'}`,
            toolCalls: [{ name: 'weather', parameters: { location } }],
            toolResults: [{ name: 'weather', error: error instanceof Error ? error.message : 'Unknown error' }]
          };
        }
      }
    }
    
    if (message.toLowerCase().includes('system info')) {
      const systemTool = this.registeredTools.get('system_info');
      if (systemTool) {
        try {
          const result = await systemTool({});
          return {
            response: `System: ${result.platform}, Language: ${result.language}, Online: ${result.onLine}`,
            toolCalls: [{ name: 'system_info', parameters: {} }],
            toolResults: [{ name: 'system_info', result }]
          };
        } catch (error) {
          return {
            response: `Error getting system info: ${error instanceof Error ? error.message : 'Unknown error'}`,
            toolCalls: [{ name: 'system_info', parameters: {} }],
            toolResults: [{ name: 'system_info', error: error instanceof Error ? error.message : 'Unknown error' }]
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Get current integration state
   */
  getState(): UnifiedIntegrationState {
    return { ...this.state };
  }

  /**
   * Get available tools from registry
   */
  getAvailableTools(): string[] {
    return Array.from(this.registeredTools.keys());
  }

  /**
   * Get WebSocket connection for testing
   */
  getWebSocketConnection(): CommsWebSocket | null {
    return this.ws;
  }

  /**
   * Send a test message to Stream Handler
   */
  sendTestMessage(message: any): void {
    this.sendMessage({
      ...message,
      source: this.config.sourceIdentifier,
      'msg-sent-timestamp': new Date().toISOString()
    });
  }

  /**
   * Register a tool executor
   */
  registerTool(toolName: string, executor: any): void {
    this.registeredTools.set(toolName, executor);
    console.log(`Registered tool: ${toolName}`);
  }

  /**
   * Private methods
   */

  private setupMessageHandlers(): void {
    this.messageHandlers.set('tool_result', this.handleToolResult.bind(this));
    this.messageHandlers.set('ally_status', this.handleAllyStatus.bind(this));
    this.messageHandlers.set('system_info', this.handleSystemInfo.bind(this));
    this.messageHandlers.set('ping', this.handlePing.bind(this));
    this.messageHandlers.set('pong', this.handlePong.bind(this));
  }

  private handleWebSocketOpen(): void {
    console.log('Connected to stream handler');
    this.state.isConnected = true;
    this.state.connectionStatus = 'connected';
    this.reconnectAttempts = 0;
    this.state.lastError = undefined;
    
    this.emit('connectionStatusChanged', 'connected');
    
    // Start heartbeat
    if (this.config.enableHeartbeat) {
      this.startHeartbeat();
    }
    
    // Send initial status
    this.sendAllyStatus('active', 'unified_integration', {
      initialized: this.state.isInitialized,
      availableTools: this.getAvailableTools().length
    });
  }

  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const message: ChyappyMessage = JSON.parse(event.data);
      const handler = this.messageHandlers.get(message.type);
      
      if (handler) {
        handler(message).catch(error => {
          console.error(`Error handling ${message.type} message:`, error);
        });
      } else {
        console.log(`Unhandled message type: ${message.type}`);
      }
      
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  private handleWebSocketClose(): void {
    console.log('Disconnected from stream handler');
    this.state.isConnected = false;
    this.state.connectionStatus = 'disconnected';
    
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    this.emit('connectionStatusChanged', 'disconnected');
    this.scheduleReconnect();
  }

  private handleWebSocketError(error: Event): void {
    console.error('WebSocket error:', error);
    this.state.connectionStatus = 'error';
    this.state.lastError = 'WebSocket connection error';
    this.emit('connectionStatusChanged', 'error');
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.config.reconnectInterval);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setTimeout(() => {
      if (this.state.isConnected && this.ws) {
        this.sendMessage({
          type: 'ping',
          source: this.config.sourceIdentifier,
          timestamp: Date.now(),
          target: 'sh',
          'msg-sent-timestamp': new Date().toISOString()
        });
        
        this.startHeartbeat(); // Schedule next heartbeat
      }
    }, this.config.heartbeatInterval);
  }

  private sendMessage(message: ChyappyMessage): void {
    if (!this.state.isConnected || !this.ws) {
      console.warn('Cannot send message: not connected to stream handler');
      return;
    }
    
    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  private async sendAllyIntent(conversationId: string, intent: string): Promise<void> {
    const message: AllyIntentMessage = {
      type: 'ally_intent',
      source: this.config.sourceIdentifier,
      intent,
      slots: {},
      confidence: 1.0,
      context: {
        conversationId,
        timestamp: Date.now()
      },
      'msg-sent-timestamp': new Date().toISOString()
    };
    
    this.sendMessage(message);
  }

  private async sendAllyStatus(status: string, component: string, details?: Record<string, any>): Promise<void> {
    const message: AllyStatusMessage = {
      type: 'ally_status',
      source: this.config.sourceIdentifier,
      status: status as any,
      component,
      details,
      'msg-sent-timestamp': new Date().toISOString()
    };
    
    this.sendMessage(message);
  }

  private async handleToolResult(message: ToolResultMessage): Promise<void> {
    const execution = this.state.activeToolExecutions.get(message.execution_id);
    if (!execution) {
      console.warn(`Received result for unknown execution: ${message.execution_id}`);
      return;
    }
    
    execution.status = message.status === 'success' ? 'completed' : 'failed';
    
    if (execution.onComplete && message.status === 'success') {
      execution.onComplete(message.result);
    } else if (execution.onError && message.status === 'error') {
      execution.onError(message.error);
    }
    
    // Clean up completed execution
    this.state.activeToolExecutions.delete(message.execution_id);
    
    this.emit('toolExecutionCompleted', {
      executionId: message.execution_id,
      toolName: message.tool_name,
      status: message.status,
      result: message.result,
      error: message.error
    });
  }

  private async handleAllyStatus(message: AllyStatusMessage): Promise<void> {
    this.emit('allyStatusReceived', message);
  }

  private async handleSystemInfo(message: ChyappyMessage): Promise<void> {
    console.log('Received system info:', message);
    this.emit('systemInfoReceived', message);
  }

  private async handlePing(message: ChyappyMessage): Promise<void> {
    // Respond to ping if it's for us
    if (message.target === this.config.sourceIdentifier) {
      this.sendMessage({
        type: 'pong',
        source: this.config.sourceIdentifier,
        timestamp: message.timestamp,
        target: message.source,
        'msg-sent-timestamp': new Date().toISOString()
      });
    }
  }

  private async handlePong(message: ChyappyMessage): Promise<void> {
    // Handle pong response for latency calculation
    if (message.target === this.config.sourceIdentifier && message.timestamp) {
      const latency = Date.now() - message.timestamp;
      this.emit('latencyMeasured', latency);
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    await this.disconnect();
    this.removeAllListeners();
  }
}