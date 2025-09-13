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

// MCP Protocol Types
interface MCPServer {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  autoApprove?: string[];
  timeout?: number;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    uri?: string;
  }>;
  isError?: boolean;
}

interface MCPServerProcess {
  process: any;
  connected: boolean;
  tools: MCPTool[];
  lastSeen: Date;
}

interface MCPConfig {
  mcpServers: Record<string, MCPServer>;
}

/**
 * MCP Integration Service
 * Manages connections to MCP servers and provides tool execution capabilities
 */
export class MCPIntegrationService extends BrowserEventEmitter {
  private servers: Map<string, MCPServerProcess> = new Map();
  private config: MCPConfig | null = null;
  private messageId = 0;
  private pendingRequests: Map<number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor() {
    super();
  }

  /**
   * Initialize MCP integration with configuration
   */
  async initialize(config?: MCPConfig): Promise<void> {
    try {
      console.log('MCP Integration Service: Starting initialization...');
      
      // Load config from user settings or provided config
      this.config = config || await this.loadMCPConfig();
      
      console.log('MCP Integration Service: Config loaded:', this.config);
      
      if (!this.config?.mcpServers) {
        console.log('No MCP servers configured');
        return;
      }

      // Start configured servers
      for (const [serverName, serverConfig] of Object.entries(this.config.mcpServers)) {
        if (!serverConfig.disabled) {
          await this.startServer(serverName, serverConfig);
        }
      }

      this.emit('initialized', { serverCount: this.servers.size });
    } catch (error) {
      console.error('Failed to initialize MCP integration:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Load MCP configuration from user settings
   */
  private async loadMCPConfig(): Promise<MCPConfig | null> {
    try {
      // Try to load from user-level config first
      const userConfigPath = '~/.kiro/settings/mcp.json';
      
      // In browser environment, we'll need to use the electron API
      if (typeof window !== 'undefined' && window.pip?.mcp) {
        const config = await window.pip.mcp.readConfig();
        return config;
      }

      // Fallback to workspace config
      const workspaceConfigPath = '.kiro/settings/mcp.json';
      // This would need to be implemented based on your file system access
      
      return null;
    } catch (error) {
      console.warn('Could not load MCP config:', error);
      return null;
    }
  }

  /**
   * Start an MCP server
   */
  private async startServer(serverName: string, config: MCPServer): Promise<void> {
    try {
      console.log(`Starting MCP server: ${serverName}`);

      // Spawn the server process
      const process = await this.spawnServerProcess(config);
      
      const serverProcess: MCPServerProcess = {
        process,
        connected: false,
        tools: [],
        lastSeen: new Date()
      };

      this.servers.set(serverName, serverProcess);

      // Setup message handling
      this.setupServerCommunication(serverName, serverProcess);

      // Initialize the server
      await this.initializeServer(serverName);

      console.log(`MCP server ${serverName} started successfully`);
      this.emit('serverStarted', { serverName, toolCount: serverProcess.tools.length });

    } catch (error) {
      console.error(`Failed to start MCP server ${serverName}:`, error);
      this.emit('serverError', { serverName, error });
      throw error;
    }
  }

  /**
   * Spawn server process (platform-specific)
   */
  private async spawnServerProcess(config: MCPServer): Promise<any> {
    // In browser environment, delegate to electron main process
    if (typeof window !== 'undefined' && window.pip?.mcp) {
      return await window.pip.mcp.spawnServer(config);
    }

    // Node.js environment
    const { spawn } = await import('child_process');
    const process = spawn(config.command, config.args, {
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return process;
  }

  /**
   * Setup communication with MCP server
   */
  private setupServerCommunication(serverName: string, serverProcess: MCPServerProcess): void {
    // In browser environment, communication is handled through electron IPC
    // This is a placeholder for the actual implementation
    console.log(`Setting up communication for MCP server: ${serverName}`);
    
    // Mark as connected for demo purposes
    setTimeout(() => {
      serverProcess.connected = true;
      serverProcess.tools = [
        {
          name: `${serverName}_demo_tool`,
          description: `Demo tool from ${serverName}`,
          inputSchema: {
            type: 'object',
            properties: {
              input: { type: 'string', description: 'Input parameter' }
            }
          }
        }
      ];
      this.emit('serverStarted', { serverName, toolCount: serverProcess.tools.length });
    }, 1000);
  }

  /**
   * Handle messages from MCP server
   */
  private async handleServerMessage(serverName: string, message: any): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) return;

    server.lastSeen = new Date();

    if (message.id && this.pendingRequests.has(message.id)) {
      // Response to our request
      const pending = this.pendingRequests.get(message.id)!;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message || 'MCP server error'));
      } else {
        pending.resolve(message.result);
      }
    } else if (message.method) {
      // Server notification or request
      await this.handleServerNotification(serverName, message);
    }
  }

  /**
   * Handle server notifications
   */
  private async handleServerNotification(serverName: string, message: any): Promise<void> {
    switch (message.method) {
      case 'notifications/tools/list_changed':
        await this.refreshServerTools(serverName);
        break;
      case 'notifications/resources/list_changed':
        this.emit('resourcesChanged', { serverName });
        break;
      default:
        console.log(`Unknown notification from ${serverName}:`, message.method);
    }
  }

  /**
   * Initialize server connection
   */
  private async initializeServer(serverName: string): Promise<void> {
    // Send initialize request
    const initResult = await this.sendServerRequest(serverName, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {}
      },
      clientInfo: {
        name: 'glass-pip-chat',
        version: '1.0.0'
      }
    });

    const server = this.servers.get(serverName)!;
    server.connected = true;

    // Get available tools
    await this.refreshServerTools(serverName);
  }

  /**
   * Refresh tools from server
   */
  private async refreshServerTools(serverName: string): Promise<void> {
    try {
      const result = await this.sendServerRequest(serverName, 'tools/list', {});
      const server = this.servers.get(serverName);
      
      if (server && result.tools) {
        server.tools = result.tools;
        this.emit('toolsUpdated', { serverName, tools: result.tools });
      }
    } catch (error) {
      console.error(`Failed to refresh tools for ${serverName}:`, error);
    }
  }

  /**
   * Send request to MCP server
   */
  private async sendServerRequest(serverName: string, method: string, params: any): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} not found`);
    }

    const id = ++this.messageId;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for ${serverName}:${method}`));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      // In browser environment, delegate to electron IPC
      if (typeof window !== 'undefined' && window.pip?.mcp) {
        // For now, return mock response
        setTimeout(() => {
          resolve({ tools: server.tools });
        }, 100);
        return;
      }
      
      // Fallback for non-electron environments
      setTimeout(() => {
        resolve({ tools: server.tools });
      }, 100);
    });
  }

  /**
   * Get all available MCP tools
   */
  getAvailableTools(): Array<MCPTool & { serverName: string }> {
    const tools: Array<MCPTool & { serverName: string }> = [];
    
    for (const [serverName, server] of this.servers) {
      if (server.connected) {
        for (const tool of server.tools) {
          tools.push({ ...tool, serverName });
        }
      }
    }

    return tools;
  }

  /**
   * Execute an MCP tool
   */
  async executeTool(toolName: string, parameters: Record<string, any>): Promise<MCPToolResult> {
    // Find which server has this tool
    let targetServer: string | null = null;
    
    for (const [serverName, server] of this.servers) {
      if (server.connected && server.tools.some(tool => tool.name === toolName)) {
        targetServer = serverName;
        break;
      }
    }

    if (!targetServer) {
      throw new Error(`Tool ${toolName} not found in any connected MCP server`);
    }

    try {
      const result = await this.sendServerRequest(targetServer, 'tools/call', {
        name: toolName,
        arguments: parameters
      });

      return result;
    } catch (error) {
      console.error(`Failed to execute MCP tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Get server status
   */
  getServerStatus(): Array<{
    name: string;
    connected: boolean;
    toolCount: number;
    lastSeen: Date;
  }> {
    return Array.from(this.servers.entries()).map(([name, server]) => ({
      name,
      connected: server.connected,
      toolCount: server.tools.length,
      lastSeen: server.lastSeen
    }));
  }

  /**
   * Stop a specific server
   */
  async stopServer(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) return;

    try {
      if (server.process && server.process.kill) {
        server.process.kill();
      }
      this.servers.delete(serverName);
      this.emit('serverStopped', { serverName });
    } catch (error) {
      console.error(`Error stopping server ${serverName}:`, error);
    }
  }

  /**
   * Stop all servers and cleanup
   */
  async shutdown(): Promise<void> {
    const serverNames = Array.from(this.servers.keys());
    
    for (const serverName of serverNames) {
      await this.stopServer(serverName);
    }

    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('MCP service shutting down'));
    }
    this.pendingRequests.clear();

    this.emit('shutdown');
  }

  /**
   * Restart a server
   */
  async restartServer(serverName: string): Promise<void> {
    const serverConfig = this.config?.mcpServers[serverName];
    if (!serverConfig) {
      throw new Error(`No configuration found for server ${serverName}`);
    }

    await this.stopServer(serverName);
    await this.startServer(serverName, serverConfig);
  }

  /**
   * Test server connectivity
   */
  async testServer(serverName: string): Promise<boolean> {
    try {
      const server = this.servers.get(serverName);
      if (!server || !server.connected) return false;

      // Send a ping request
      await this.sendServerRequest(serverName, 'ping', {});
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Singleton instance
let mcpIntegrationService: MCPIntegrationService | null = null;

export function getMCPIntegrationService(): MCPIntegrationService {
  if (!mcpIntegrationService) {
    mcpIntegrationService = new MCPIntegrationService();
  }
  return mcpIntegrationService;
}

export function resetMCPIntegrationService(): void {
  if (mcpIntegrationService) {
    mcpIntegrationService.shutdown();
    mcpIntegrationService = null;
  }
}