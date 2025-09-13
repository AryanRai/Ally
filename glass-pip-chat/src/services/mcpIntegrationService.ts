import { getMCPClient, MCPClient } from './mcpClient';
import { BrowserEventEmitter } from './browserEventEmitter';

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
  private mcpClient: MCPClient;
  private config: MCPConfig | null = null;
  private servers: Map<string, any> = new Map();

  constructor() {
    super();
    this.mcpClient = getMCPClient();
    
    // Forward events from MCP client
    this.mcpClient.on('serverStarted', (data: any) => this.emit('serverStarted', data));
    this.mcpClient.on('serverError', (data: any) => this.emit('serverError', data));
    this.mcpClient.on('toolsUpdated', (data: any) => this.emit('toolsUpdated', data));
    this.mcpClient.on('serverStopped', (data: any) => this.emit('serverStopped', data));
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
      console.log(`Starting MCP server: ${serverName}`, config);

      await this.mcpClient.startServer(serverName, {
        command: config.command,
        args: config.args,
        env: config.env
      });

      console.log(`MCP server ${serverName} started successfully`);

    } catch (error) {
      console.error(`Failed to start MCP server ${serverName}:`, error);
      this.emit('serverError', { serverName, error });
      throw error;
    }
  }



  /**
   * Get all available MCP tools
   */
  getAvailableTools(): Array<MCPTool & { serverName: string }> {
    return this.mcpClient.getAllTools();
  }

  /**
   * Execute an MCP tool
   */
  async executeTool(toolName: string, parameters: Record<string, any>): Promise<MCPToolResult> {
    // Find which server has this tool
    const allTools = this.mcpClient.getAllTools();
    const toolWithServer = allTools.find(tool => tool.name === toolName);
    
    if (!toolWithServer) {
      throw new Error(`Tool ${toolName} not found in any connected MCP server`);
    }

    try {
      const result = await this.mcpClient.executeTool(toolWithServer.serverName, toolName, parameters);
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
    return this.mcpClient.getServerStatus().map(server => ({
      name: server.name,
      connected: server.connected,
      toolCount: server.toolCount,
      lastSeen: new Date() // MCP client doesn't track lastSeen, use current time
    }));
  }

  /**
   * Stop a specific server
   */
  async stopServer(serverName: string): Promise<void> {
    try {
      await this.mcpClient.stopServer(serverName);
    } catch (error) {
      console.error(`Error stopping server ${serverName}:`, error);
    }
  }

  /**
   * Stop all servers and cleanup
   */
  async shutdown(): Promise<void> {
    try {
      await this.mcpClient.stopAllServers();
      this.emit('shutdown');
    } catch (error) {
      console.error('Error during MCP service shutdown:', error);
    }
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
   * Send a request to a server (delegated to MCP client)
   */
  private async sendServerRequest(serverName: string, method: string, params: any): Promise<any> {
    // This would need to be implemented in the MCP client
    // For now, just return a mock response
    return { success: true };
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