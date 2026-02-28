/**
 * MCP Tools Store
 * 
 * A simple store to persist MCP tools state across component mounts.
 * This ensures tools don't disappear when settings modal closes.
 */

type MCPTool = {
  name: string;
  description: string;
  serverName: string;
};

type MCPServer = {
  name: string;
  connected: boolean;
  toolCount: number;
  lastSeen: Date;
};

type Listener = () => void;

class MCPToolsStore {
  private tools: MCPTool[] = [];
  private servers: MCPServer[] = [];
  private listeners: Set<Listener> = new Set();
  private initialized = false;

  getTools(): MCPTool[] {
    return this.tools;
  }

  getServers(): MCPServer[] {
    return this.servers;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  setTools(tools: MCPTool[]) {
    if (tools.length > 0 || !this.initialized) {
      this.tools = tools;
      this.initialized = true;
      this.notifyListeners();
    }
  }

  setServers(servers: MCPServer[]) {
    if (servers.length > 0 || !this.initialized) {
      this.servers = servers;
      this.notifyListeners();
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }

  getConnectedServerCount(): number {
    return this.servers.filter(s => s.connected).length;
  }

  getToolCount(): number {
    return this.tools.length;
  }
}

// Singleton instance
export const mcpToolsStore = new MCPToolsStore();
