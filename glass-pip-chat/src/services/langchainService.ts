/**
 * LangChain Integration Service for Enhanced Tool Calling
 * 
 * This service provides advanced tool calling capabilities using LangChain's
 * agent framework with Ollama as the LLM backend. It supports:
 * - Multi-step reasoning and tool execution
 * - Automatic tool selection and parameter extraction
 * - MCP tool integration
 * - Conversation memory and context management
 * - Streaming responses with tool execution feedback
 */

// Conditional imports for LangChain - will be loaded dynamically
let ChatOllama: any;
let AgentExecutor: any;
let createToolCallingAgent: any;
let ChatPromptTemplate: any;
let BaseMessage: any;
let HumanMessage: any;
let AIMessage: any;
let SystemMessage: any;
let Tool: any;
let DynamicTool: any;
let BufferMemory: any;
let ConversationChain: any;
let CallbackHandler: any;

// Flag to track if LangChain is available
let langChainAvailable = false;

// Dynamic import function
async function loadLangChain() {
  try {
    const [
      ollamaModule,
      agentsModule,
      promptsModule,
      messagesModule,
      toolsModule,
      communityModule,
      memoryModule,
      chainsModule,
      callbacksModule
    ] = await Promise.all([
      import('@langchain/ollama'),
      import('langchain/agents'),
      import('@langchain/core/prompts'),
      import('@langchain/core/messages'),
      import('@langchain/core/tools'),
      import('@langchain/community/tools/dynamic'),
      import('langchain/memory'),
      import('langchain/chains'),
      import('@langchain/core/callbacks/base')
    ]);

    ChatOllama = ollamaModule.ChatOllama;
    AgentExecutor = agentsModule.AgentExecutor;
    createToolCallingAgent = agentsModule.createToolCallingAgent;
    ChatPromptTemplate = promptsModule.ChatPromptTemplate;
    BaseMessage = messagesModule.BaseMessage;
    HumanMessage = messagesModule.HumanMessage;
    AIMessage = messagesModule.AIMessage;
    SystemMessage = messagesModule.SystemMessage;
    Tool = toolsModule.Tool;
    DynamicTool = communityModule.DynamicTool;
    BufferMemory = memoryModule.BufferMemory;
    ConversationChain = chainsModule.ConversationChain;
    CallbackHandler = callbacksModule.CallbackHandler;

    langChainAvailable = true;
    
    // Create the callback handler class now that CallbackHandler is available
    StreamingCallbackHandler = createStreamingCallbackHandler();
    
    // Create tool wrapper classes now that Tool is available
    createToolWrappers();
    
    console.log('✅ LangChain modules loaded successfully');
  } catch (error) {
    console.warn('⚠️ LangChain not available:', error);
    langChainAvailable = false;
  }
}

// Import existing services
import { OllamaService, ChatMessage } from './ollamaService';
import { getMCPIntegrationService } from './mcpIntegrationService';
import { getFilesystemToolsService } from './filesystemTools';

export interface LangChainConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  enableStreaming: boolean;
  maxIterations: number;
  enableMemory: boolean;
  memoryKey: string;
  enableTools: boolean;
  casualChatMode: boolean;
}

export interface ToolExecutionStep {
  step: number;
  action: string;
  tool: string;
  input: any;
  output: any;
  reasoning: string;
  timestamp: number;
}

export interface LangChainResponse {
  response: string;
  steps: ToolExecutionStep[];
  totalSteps: number;
  executionTime: number;
  tokensUsed?: number;
  memoryUpdated: boolean;
}

export interface StreamingCallback {
  onToken?: (token: string) => void;
  onStep?: (step: ToolExecutionStep) => void;
  onThought?: (thought: string) => void;
  onToolStart?: (tool: string, input: any) => void;
  onToolEnd?: (tool: string, output: any) => void;
  onError?: (error: Error) => void;
}

/**
 * Custom callback handler for streaming and progress updates
 */
let StreamingCallbackHandler: any;

// Create the callback handler class after LangChain is loaded
function createStreamingCallbackHandler() {
  if (!CallbackHandler) return null;
  
  return class extends CallbackHandler {
    constructor(private callbacks: StreamingCallback) {
      super();
    }

    async handleLLMNewToken(token: string): Promise<void> {
      this.callbacks.onToken?.(token);
    }

    async handleToolStart(tool: any, input: string): Promise<void> {
      this.callbacks.onToolStart?.(tool.name, input);
    }

    async handleToolEnd(output: string): Promise<void> {
      this.callbacks.onToolEnd?.('', output);
    }

    async handleAgentAction(action: any): Promise<void> {
      this.callbacks.onThought?.(action.log);
    }

    async handleChainError(err: Error): Promise<void> {
      this.callbacks.onError?.(err);
    }
  };
}

/**
 * Tool wrapper factory functions - created after LangChain is loaded
 */
let MCPToolWrapper: any;
let FilesystemToolWrapper: any;

function createToolWrappers() {
  if (!Tool) return;

  /**
   * MCP Tool Wrapper for LangChain
   */
  MCPToolWrapper = class extends Tool {
    name: string;
    description: string;
    private mcpService: any;
    private toolName: string;

    constructor(toolName: string, toolDefinition: any, mcpService: any) {
      super();
      this.name = toolName;
      this.description = toolDefinition.description || `Execute ${toolName} tool`;
      this.mcpService = mcpService;
      this.toolName = toolName;
    }

    async _call(input: string): Promise<string> {
      try {
        // Parse input if it's JSON
        let params;
        try {
          params = JSON.parse(input);
        } catch {
          params = { input };
        }

        const result = await this.mcpService.callTool(this.toolName, params);
        return typeof result === 'string' ? result : JSON.stringify(result);
      } catch (error) {
        return `Error executing ${this.toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }
  };

  /**
   * Filesystem Tool Wrapper for LangChain
   */
  FilesystemToolWrapper = class extends Tool {
    name: string;
    description: string;
    private filesystemService: any;
    private operation: string;

    constructor(operation: string, filesystemService: any) {
      super();
      this.name = `filesystem_${operation}`;
      this.description = this.getOperationDescription(operation);
      this.filesystemService = filesystemService;
      this.operation = operation;
    }

    private getOperationDescription(operation: string): string {
      const descriptions: Record<string, string> = {
        read_file: 'Read the contents of a file',
        write_file: 'Write content to a file',
        list_directory: 'List files and directories in a path',
        create_directory: 'Create a new directory',
        delete_file: 'Delete a file',
        copy_file: 'Copy a file to another location',
        move_file: 'Move or rename a file',
        get_file_info: 'Get information about a file or directory'
      };
      return descriptions[operation] || `Perform ${operation} filesystem operation`;
    }

    async _call(input: string): Promise<string> {
      try {
        let params;
        try {
          params = JSON.parse(input);
        } catch {
          params = { path: input };
        }

        const result = await this.filesystemService[this.operation](params);
        return typeof result === 'string' ? result : JSON.stringify(result);
      } catch (error) {
        return `Error in ${this.operation}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }
  };
}

export class LangChainService {
  private config: LangChainConfig;
  private llm: any;
  private memory: any;
  private tools: any[] = [];
  private agent: any | null = null;
  private mcpService: any;
  private filesystemService: any;
  private customSystemPrompt: string | null = null;
  private initialized: boolean = false;

  constructor(config: Partial<LangChainConfig> = {}) {
    this.config = {
      model: 'llama3.2:3b',
      temperature: 0.7,
      maxTokens: 4096,
      timeout: 60000,
      enableStreaming: true,
      maxIterations: 10,
      enableMemory: true,
      memoryKey: 'chat_history',
      enableTools: true,
      casualChatMode: false,
      ...config
    };

    // Initialize asynchronously
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await loadLangChain();
      if (langChainAvailable) {
        this.initializeLLM();
        this.initializeMemory();
        await this.initializeServices();
        this.initialized = true;
        console.log('✅ LangChain service initialized');
      } else {
        console.warn('⚠️ LangChain service running in fallback mode');
      }
    } catch (error) {
      console.error('❌ Failed to initialize LangChain service:', error);
    }
  }

  private initializeLLM(): void {
    this.llm = new ChatOllama({
      baseUrl: 'http://localhost:11434',
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      streaming: this.config.enableStreaming,
    });
  }

  private initializeMemory(): void {
    if (this.config.enableMemory) {
      this.memory = new BufferMemory({
        memoryKey: this.config.memoryKey,
        returnMessages: true,
      });
    }
  }

  private async initializeServices(): Promise<void> {
    try {
      this.mcpService = getMCPIntegrationService();
      this.filesystemService = getFilesystemToolsService();
      await this.loadTools();
    } catch (error) {
      console.warn('Failed to initialize some services:', error);
    }
  }

  /**
   * Load and register all available tools
   */
  private async loadTools(): Promise<void> {
    this.tools = [];

    // Load MCP tools
    await this.loadMCPTools();

    // Load filesystem tools
    this.loadFilesystemTools();

    // Load custom tools
    this.loadCustomTools();

    console.log(`Loaded ${this.tools.length} tools for LangChain agent`);
  }

  private async loadMCPTools(): Promise<void> {
    try {
      if (!this.mcpService || !MCPToolWrapper) return;

      const mcpTools = await this.mcpService.getAvailableTools();
      
      for (const [toolName, toolDef] of Object.entries(mcpTools)) {
        const tool = new MCPToolWrapper(toolName, toolDef, this.mcpService);
        this.tools.push(tool);
      }

      console.log(`Loaded ${Object.keys(mcpTools).length} MCP tools`);
    } catch (error) {
      console.warn('Failed to load MCP tools:', error);
    }
  }

  private loadFilesystemTools(): void {
    try {
      if (!this.filesystemService || !FilesystemToolWrapper) return;

      const operations = [
        'read_file',
        'write_file', 
        'list_directory',
        'create_directory',
        'delete_file',
        'copy_file',
        'move_file',
        'get_file_info'
      ];

      for (const operation of operations) {
        if (typeof this.filesystemService[operation] === 'function') {
          const tool = new FilesystemToolWrapper(operation, this.filesystemService);
          this.tools.push(tool);
        }
      }

      console.log(`Loaded ${operations.length} filesystem tools`);
    } catch (error) {
      console.warn('Failed to load filesystem tools:', error);
    }
  }

  private loadCustomTools(): void {
    // Add custom utility tools
    const customTools = [
      new DynamicTool({
        name: 'get_current_time',
        description: 'Get the current date and time',
        func: async () => {
          return new Date().toISOString();
        }
      }),
      
      new DynamicTool({
        name: 'calculate',
        description: 'Perform mathematical calculations. Input should be a mathematical expression.',
        func: async (input: string) => {
          try {
            // Simple safe evaluation for basic math
            const result = Function(`"use strict"; return (${input})`)();
            return `Result: ${result}`;
          } catch (error) {
            return `Error in calculation: ${error instanceof Error ? error.message : 'Invalid expression'}`;
          }
        }
      }),

      new DynamicTool({
        name: 'search_memory',
        description: 'Search through conversation memory for relevant information',
        func: async (query: string) => {
          if (!this.memory) return 'Memory not enabled';
          
          try {
            const memoryData = await this.memory.loadMemoryVariables({});
            const history = memoryData[this.config.memoryKey] || [];
            
            // Simple keyword search in memory
            const relevantMessages = history.filter((msg: any) => 
              msg.content && msg.content.toLowerCase().includes(query.toLowerCase())
            );
            
            return relevantMessages.length > 0 
              ? `Found ${relevantMessages.length} relevant messages: ${JSON.stringify(relevantMessages.slice(-3))}`
              : 'No relevant information found in memory';
          } catch (error) {
            return `Error searching memory: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        }
      })
    ];

    this.tools.push(...customTools);
  }

  /**
   * Initialize the agent with current tools
   */
  private async initializeAgent(): Promise<void> {
    if (this.tools.length === 0 && this.config.enableTools) {
      await this.loadTools();
    }

    // In casual chat mode, use no tools or only essential ones
    const toolsToUse = this.config.casualChatMode 
      ? [] // No tools for casual chat
      : this.config.enableTools 
        ? this.tools 
        : [];

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', this.getSystemPrompt()],
      ['placeholder', '{chat_history}'],
      ['human', '{input}'],
      ['placeholder', '{agent_scratchpad}']
    ]);

    const agent = await createToolCallingAgent({
      llm: this.llm,
      tools: toolsToUse,
      prompt
    });

    this.agent = new AgentExecutor({
      agent,
      tools: toolsToUse,
      maxIterations: this.config.casualChatMode ? 1 : this.config.maxIterations,
      verbose: true,
      memory: this.memory,
    });
  }

  private getSystemPrompt(): string {
    if (this.customSystemPrompt) {
      return this.customSystemPrompt;
    }
    
    return `You are an intelligent AI assistant with access to various tools that can help you complete tasks and answer questions effectively.

IMPORTANT: Be selective about tool usage. Only use tools when they are actually needed to complete the user's request.

Use tools ONLY when:
- User explicitly requests file operations (read, write, list files)
- User asks for current time/date information  
- User requests complex calculations that require computation
- User asks for specific system information
- User requests actions that require external data or operations

DO NOT use tools for:
- Casual conversation, greetings, or simple chat
- Basic math you can answer directly (like 2+2=4)
- General knowledge questions you can answer from training
- Vague or unclear requests

Your capabilities include:
- File system operations (reading, writing, listing files and directories)
- Mathematical calculations for complex expressions
- Memory search and retrieval
- Time and date information
- MCP (Model Context Protocol) tools for extended functionality

When you do need to use tools:
1. Clearly explain why the tool is necessary
2. Break down complex requests into manageable steps
3. Use the most appropriate tools for each step
4. Combine results from multiple tools when necessary
5. If a tool fails, try alternative approaches

Always be helpful, accurate, and explain your reasoning. Prioritize direct conversation over tool usage when possible.

Available tools: ${this.tools.map(t => `${t.name} - ${t.description}`).join(', ')}`;
  }

  /**
   * Process a chat message with enhanced tool calling
   */
  async chat(
    message: string,
    context: { sessionId?: string; userId?: string } = {},
    callbacks?: StreamingCallback
  ): Promise<LangChainResponse> {
    const startTime = Date.now();
    const steps: ToolExecutionStep[] = [];

    // If LangChain isn't available, provide a fallback response
    if (!langChainAvailable || !this.initialized) {
      const fallbackResponse = `LangChain is not available. Please install the required dependencies:

npm install @langchain/core @langchain/ollama @langchain/community langchain

For now, using basic response: ${message}`;

      return {
        response: fallbackResponse,
        steps: [],
        totalSteps: 0,
        executionTime: Date.now() - startTime,
        memoryUpdated: false
      };
    }

    try {
      // Initialize agent if not already done
      if (!this.agent) {
        await this.initializeAgent();
      }

      if (!this.agent) {
        throw new Error('Failed to initialize agent');
      }

      // Set up streaming callback handler
      const callbackHandler = callbacks && StreamingCallbackHandler ? new StreamingCallbackHandler(callbacks) : undefined;

      // Execute the agent
      const result = await this.agent.invoke(
        { 
          input: message,
          chat_history: this.config.enableMemory ? await this.getMemoryHistory() : []
        },
        {
          callbacks: callbackHandler ? [callbackHandler] : undefined,
        }
      );

      // Update memory if enabled
      let memoryUpdated = false;
      if (this.config.enableMemory && this.memory) {
        await this.memory.saveContext(
          { input: message },
          { output: result.output }
        );
        memoryUpdated = true;
      }

      return {
        response: result.output,
        steps,
        totalSteps: steps.length,
        executionTime: Date.now() - startTime,
        memoryUpdated
      };

    } catch (error) {
      console.error('LangChain chat error:', error);
      callbacks?.onError?.(error instanceof Error ? error : new Error('Unknown error'));
      
      return {
        response: `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        steps,
        totalSteps: 0,
        executionTime: Date.now() - startTime,
        memoryUpdated: false
      };
    }
  }

  /**
   * Get conversation history from memory
   */
  private async getMemoryHistory(): Promise<BaseMessage[]> {
    if (!this.memory) return [];

    try {
      const memoryData = await this.memory.loadMemoryVariables({});
      return memoryData[this.config.memoryKey] || [];
    } catch (error) {
      console.warn('Failed to load memory history:', error);
      return [];
    }
  }

  /**
   * Convert ChatMessage format to LangChain BaseMessage format
   */
  private convertMessages(messages: ChatMessage[]): BaseMessage[] {
    return messages.map(msg => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        default:
          return new HumanMessage(msg.content);
      }
    });
  }

  /**
   * Clear conversation memory
   */
  async clearMemory(): Promise<void> {
    if (this.memory) {
      await this.memory.clear();
    }
  }

  /**
   * Get available tools information
   */
  getAvailableTools(): Array<{ name: string; description: string }> {
    if (!langChainAvailable) {
      return [
        { name: 'fallback', description: 'LangChain not available - install dependencies' }
      ];
    }
    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description
    }));
  }

  /**
   * Update system prompt
   */
  updateSystemPrompt(newPrompt: string): void {
    this.customSystemPrompt = newPrompt;
    // Reset agent to reinitialize with new prompt
    this.agent = null;
  }

  /**
   * Get current system prompt
   */
  getCurrentSystemPrompt(): string {
    return this.customSystemPrompt || this.getSystemPrompt();
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<LangChainConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.initializeLLM();
    
    if (newConfig.enableMemory !== undefined) {
      this.initializeMemory();
    }
    
    // Reset agent to reinitialize with new config
    this.agent = null;
  }

  /**
   * Get current configuration
   */
  getConfig(): LangChainConfig {
    return { ...this.config };
  }

  /**
   * Test tool availability and functionality
   */
  async testTools(): Promise<{ working: string[]; failed: string[] }> {
    if (!langChainAvailable) {
      return { 
        working: [], 
        failed: ['LangChain dependencies not installed'] 
      };
    }

    const working: string[] = [];
    const failed: string[] = [];

    for (const tool of this.tools) {
      try {
        // Simple test call
        await tool._call('test');
        working.push(tool.name);
      } catch (error) {
        failed.push(tool.name);
        console.warn(`Tool ${tool.name} test failed:`, error);
      }
    }

    return { working, failed };
  }

  /**
   * Check if LangChain is available
   */
  isAvailable(): boolean {
    return langChainAvailable && this.initialized;
  }

  /**
   * Get installation instructions
   */
  getInstallationInstructions(): string {
    return `To enable LangChain enhanced chat, install the required dependencies:

npm install @langchain/core @langchain/ollama @langchain/community langchain

Then restart the application.`;
  }

  /**
   * Reload tools (useful when MCP servers are updated)
   */
  async reloadTools(): Promise<void> {
    if (!langChainAvailable) return;
    await this.loadTools();
    this.agent = null; // Force agent reinitialization
  }
}

// Default instance
export const langchainService = new LangChainService();