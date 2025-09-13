/**
 * Real MCP Client Service
 * Handles actual MCP protocol communication with spawned servers
 */

import { BrowserEventEmitter } from './browserEventEmitter';

interface MCPMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

interface MCPServerProcess {
  name: string;
  process: any;
  processId: string;
  stdin: any;
  stdout: any;
  stderr: any;
  connected: boolean;
  tools: MCPTool[];
  capabilities: any;
  messageId: number;
  pendingRequests: Map<number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }>;
}

export class MCPClient extends BrowserEventEmitter {
  private servers: Map<string, MCPServerProcess> = new Map();
  private globalMessageId = 0;

  constructor() {
    super();
  }

  /**
   * Start an MCP server
   */
  async startServer(name: string, config: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }): Promise<void> {
    try {
      console.log(`Starting MCP server: ${name}`, config);

      // Spawn the server process through Electron
      if (typeof window !== 'undefined' && window.pip?.mcp) {
        const result = await window.pip.mcp.spawnServer(config);
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to spawn MCP server');
        }
        
        const serverProcess: MCPServerProcess = {
          name,
          process: null, // We don't have direct access to the process object
          processId: result.processId,
          stdin: null,
          stdout: null,
          stderr: null,
          connected: false,
          tools: [],
          capabilities: null,
          messageId: 0,
          pendingRequests: new Map()
        };

        this.servers.set(name, serverProcess);
        
        // Setup communication through IPC events
        this.setupServerCommunication(serverProcess);
        
        // Initialize the server
        await this.initializeServer(serverProcess);
        
        console.log(`MCP server ${name} started and initialized`);
        this.emit('serverStarted', { name, tools: serverProcess.tools });
        
      } else {
        throw new Error('Electron MCP API not available');
      }
    } catch (error) {
      console.error(`Failed to start MCP server ${name}:`, error);
      this.emit('serverError', { name, error });
      throw error;
    }
  }

  /**
   * Setup communication with MCP server through IPC events
   */
  private setupServerCommunication(server: MCPServerProcess): void {
    if (typeof window !== 'undefined' && window.pip?.mcp) {
      // Handle server data (stdout)
      const removeDataListener = window.pip.mcp.onServerData((data) => {
        if (data.processId === server.processId) {
          const lines = data.data.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const message: MCPMessage = JSON.parse(line);
              this.handleServerMessage(server, message);
            } catch (error) {
              console.warn(`Invalid JSON from ${server.name}:`, line);
            }
          }
        }
      });

      // Handle server errors (stderr)
      const removeErrorListener = window.pip.mcp.onServerError((data) => {
        if (data.processId === server.processId) {
          console.error(`MCP server ${server.name} error:`, data.error);
        }
      });

      // Handle server exit
      const removeExitListener = window.pip.mcp.onServerExit((data) => {
        if (data.processId === server.processId) {
          console.log(`MCP server ${server.name} exited with code ${data.code}`);
          server.connected = false;
          this.emit('serverDisconnected', { name: server.name, code: data.code });
          
          // Cleanup listeners
          removeDataListener();
          removeErrorListener();
          removeExitListener();
        }
      });
    }
  }

  /**
   * Handle messages from MCP server
   */
  private handleServerMessage(server: MCPServerProcess, message: MCPMessage): void {
    console.log(`Message from ${server.name}:`, message);

    // Handle responses to our requests
    if (message.id !== undefined && server.pendingRequests.has(message.id as number)) {
      const pending = server.pendingRequests.get(message.id as number)!;
      clearTimeout(pending.timeout);
      server.pendingRequests.delete(message.id as number);

      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    // Handle server notifications
    if (message.method) {
      this.handleServerNotification(server, message);
    }
  }

  /**
   * Handle server notifications
   */
  private handleServerNotification(server: MCPServerProcess, message: MCPMessage): void {
    switch (message.method) {
      case 'notifications/tools/list_changed':
        this.refreshServerTools(server);
        break;
      case 'notifications/resources/list_changed':
        this.emit('resourcesChanged', { serverName: server.name });
        break;
      default:
        console.log(`Unknown notification from ${server.name}:`, message.method);
    }
  }

  /**
   * Send a request to MCP server through IPC
   */
  private async sendServerRequest(server: MCPServerProcess, method: string, params: any): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const id = ++server.messageId;
      const message: MCPMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      const timeout = setTimeout(() => {
        server.pendingRequests.delete(id);
        reject(new Error(`Request timeout for ${server.name}:${method}`));
      }, 30000);

      server.pendingRequests.set(id, { resolve, reject, timeout });

      // Send message to server through IPC
      const messageStr = JSON.stringify(message) + '\n';
      
      if (typeof window !== 'undefined' && window.pip?.mcp) {
        try {
          const result = await window.pip.mcp.sendMessage(server.processId, messageStr);
          if (!result.success) {
            server.pendingRequests.delete(id);
            clearTimeout(timeout);
            reject(new Error(result.error || 'Failed to send message to server'));
          }
        } catch (error) {
          server.pendingRequests.delete(id);
          clearTimeout(timeout);
          reject(error);
        }
      } else {
        server.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(new Error('Electron MCP API not available'));
      }
    });
  }

  /**
   * Initialize server connection
   */
  private async initializeServer(server: MCPServerProcess): Promise<void> {
    try {
      // Send initialize request
      const initResult = await this.sendServerRequest(server, 'initialize', {
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

      server.capabilities = initResult.capabilities;
      server.connected = true;

      // Get available tools
      await this.refreshServerTools(server);

      console.log(`MCP server ${server.name} initialized with ${server.tools.length} tools`);
    } catch (error) {
      console.error(`Failed to initialize MCP server ${server.name}:`, error);
      throw error;
    }
  }

  /**
   * Refresh tools from server
   */
  private async refreshServerTools(server: MCPServerProcess): Promise<void> {
    try {
      const result = await this.sendServerRequest(server, 'tools/list', {});
      server.tools = result.tools || [];
      this.emit('toolsUpdated', { serverName: server.name, tools: server.tools });
    } catch (error) {
      console.error(`Failed to refresh tools for ${server.name}:`, error);
    }
  }

  /**
   * Execute a tool on a specific server
   */
  async executeTool(serverName: string, toolName: string, parameters: Record<string, any>): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} not found`);
    }

    if (!server.connected) {
      throw new Error(`Server ${serverName} not connected`);
    }

    try {
      const result = await this.sendServerRequest(server, 'tools/call', {
        name: toolName,
        arguments: parameters
      });

      console.log(`Tool ${toolName} executed on ${serverName}:`, result);
      return result;
    } catch (error) {
      console.error(`Failed to execute tool ${toolName} on ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Get all available tools from all servers
   */
  getAllTools(): Array<MCPTool & { serverName: string }> {
    const allTools: Array<MCPTool & { serverName: string }> = [];
    
    for (const [serverName, server] of this.servers) {
      if (server.connected) {
        for (const tool of server.tools) {
          allTools.push({ ...tool, serverName });
        }
      }
    }

    return allTools;
  }

  /**
   * Get server status
   */
  getServerStatus(): Array<{
    name: string;
    connected: boolean;
    toolCount: number;
    capabilities: any;
  }> {
    return Array.from(this.servers.values()).map(server => ({
      name: server.name,
      connected: server.connected,
      toolCount: server.tools.length,
      capabilities: server.capabilities
    }));
  }

  /**
   * Stop a server
   */
  async stopServer(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) return;

    try {
      // Clear pending requests
      for (const [id, pending] of server.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Server stopping'));
      }
      server.pendingRequests.clear();

      // Kill the process through Electron
      if (typeof window !== 'undefined' && window.pip?.mcp && server.processId) {
        await window.pip.mcp.killServer(server.processId);
      } else if (server.process && server.process.kill) {
        server.process.kill();
      }

      this.servers.delete(serverName);
      this.emit('serverStopped', { name: serverName });
    } catch (error) {
      console.error(`Error stopping server ${serverName}:`, error);
    }
  }

  /**
   * Stop all servers
   */
  async stopAllServers(): Promise<void> {
    const serverNames = Array.from(this.servers.keys());
    for (const serverName of serverNames) {
      await this.stopServer(serverName);
    }
  }
}

// Singleton instance
let mcpClient: MCPClient | null = null;

export function getMCPClient(): MCPClient {
  if (!mcpClient) {
    mcpClient = new MCPClient();
  }
  return mcpClient;
}