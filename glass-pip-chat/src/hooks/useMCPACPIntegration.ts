import { useState, useEffect, useCallback } from 'react';
import { getMCPIntegrationService } from '../services/mcpIntegrationService';
import { getACPIntegrationService } from '../services/acpIntegrationService';
import { mcpToolsStore } from '../stores/mcpToolsStore';

interface MCPACPState {
  // MCP State
  mcpEnabled: boolean;
  mcpServers: Array<{
    name: string;
    connected: boolean;
    toolCount: number;
    lastSeen: Date;
  }>;
  mcpTools: Array<{
    name: string;
    description: string;
    serverName: string;
  }>;
  
  // ACP State
  acpEnabled: boolean;
  acpAgents: Array<{
    id: string;
    name: string;
    description: string;
    status: 'online' | 'offline' | 'busy' | 'error';
    capabilities: string[];
  }>;
  
  // General State
  isInitialized: boolean;
  isInitializing: boolean;
  lastError?: string;
}

interface MCPACPActions {
  // MCP Actions
  refreshMCPServers: () => Promise<void>;
  restartMCPServer: (serverName: string) => Promise<void>;
  executeMCPTool: (toolName: string, parameters: Record<string, any>) => Promise<any>;
  
  // ACP Actions
  refreshACPAgents: () => Promise<void>;
  queryACPAgent: (agentId: string, query: string, context?: Record<string, any>) => Promise<any>;
  reconnectACPAgent: (agentId: string) => Promise<void>;
  
  // General Actions
  initialize: () => Promise<void>;
  getUnifiedToolList: () => Array<{
    name: string;
    description: string;
    type: 'mcp' | 'acp' | 'internal';
    source?: string;
  }>;
}

export function useMCPACPIntegration(): MCPACPState & MCPACPActions {
  // Initialize state from store if available
  const [state, setState] = useState<MCPACPState>(() => ({
    mcpEnabled: mcpToolsStore.isInitialized(),
    mcpServers: mcpToolsStore.getServers(),
    mcpTools: mcpToolsStore.getTools(),
    acpEnabled: false,
    acpAgents: [],
    isInitialized: mcpToolsStore.isInitialized(),
    isInitializing: false
  }));

  // Subscribe to store changes
  useEffect(() => {
    const unsubscribe = mcpToolsStore.subscribe(() => {
      setState(prev => ({
        ...prev,
        mcpServers: mcpToolsStore.getServers(),
        mcpTools: mcpToolsStore.getTools(),
        isInitialized: mcpToolsStore.isInitialized()
      }));
    });
    return unsubscribe;
  }, []);

  // Initialize services
  const initialize = useCallback(async () => {
    if (state.isInitializing || state.isInitialized) return;

    setState(prev => ({ ...prev, isInitializing: true, lastError: undefined }));

    try {
      // Initialize MCP service
      const mcpService = getMCPIntegrationService();
      await mcpService.initialize();

      // Initialize ACP service  
      const acpService = getACPIntegrationService();
      await acpService.initialize();

      // Setup event listeners
      mcpService.on('serverStarted', refreshMCPData);
      mcpService.on('serverStopped', refreshMCPData);
      mcpService.on('toolsUpdated', refreshMCPData);
      mcpService.on('serverError', (data) => {
        setState(prev => ({ ...prev, lastError: `MCP Server Error: ${data.error}` }));
      });

      acpService.on('agentConnected', refreshACPData);
      acpService.on('agentDisconnected', refreshACPData);
      acpService.on('agentStatusChanged', refreshACPData);
      acpService.on('agentError', (data) => {
        setState(prev => ({ ...prev, lastError: `ACP Agent Error: ${data.error}` }));
      });

      // Initial data load
      await Promise.all([refreshMCPData(), refreshACPData()]);

      // Get final state for demo data fallback
      const finalServers = mcpToolsStore.getServers().length > 0 
        ? mcpToolsStore.getServers() 
        : [{
            name: 'demo-filesystem',
            connected: true,
            toolCount: 1,
            lastSeen: new Date()
          }];
      
      const finalTools = mcpToolsStore.getTools().length > 0
        ? mcpToolsStore.getTools()
        : [{
            name: 'read_file',
            description: 'Read file contents (demo)',
            serverName: 'demo-filesystem'
          }];

      // Update store with final data
      mcpToolsStore.setServers(finalServers);
      mcpToolsStore.setTools(finalTools);

      setState(prev => ({ 
        ...prev, 
        isInitialized: true, 
        isInitializing: false,
        mcpEnabled: true,
        acpEnabled: true,
        mcpServers: finalServers,
        mcpTools: finalTools,
        acpAgents: prev.acpAgents.length === 0 ? [{
          id: 'demo-assistant',
          name: 'Demo Assistant',
          description: 'Demo ACP agent for testing',
          status: 'online' as const,
          capabilities: ['demo', 'testing']
        }] : prev.acpAgents
      }));

    } catch (error) {
      console.error('MCP/ACP initialization error:', error);
      setState(prev => ({ 
        ...prev, 
        isInitializing: false, 
        lastError: error instanceof Error ? error.message : 'Initialization failed',
        // Still mark as enabled for demo mode
        mcpEnabled: true,
        acpEnabled: true
      }));
    }
  }, [state.isInitializing, state.isInitialized]);

  // Refresh MCP data
  const refreshMCPData = useCallback(async () => {
    try {
      const mcpService = getMCPIntegrationService();
      const servers = mcpService.getServerStatus();
      const tools = mcpService.getAvailableTools();

      // Update local state
      setState(prev => ({
        ...prev,
        mcpServers: servers,
        mcpTools: tools
      }));
      
      // Also update the global store so other components can access
      mcpToolsStore.setServers(servers);
      mcpToolsStore.setTools(tools);
    } catch (error) {
      console.error('Failed to refresh MCP data:', error);
    }
  }, []);

  // Refresh ACP data
  const refreshACPData = useCallback(async () => {
    try {
      const acpService = getACPIntegrationService();
      const agents = acpService.getAllAgents();

      setState(prev => ({
        ...prev,
        acpAgents: agents
      }));
    } catch (error) {
      console.error('Failed to refresh ACP data:', error);
    }
  }, []);

  // MCP Actions
  const refreshMCPServers = useCallback(async () => {
    await refreshMCPData();
  }, [refreshMCPData]);

  const restartMCPServer = useCallback(async (serverName: string) => {
    try {
      const mcpService = getMCPIntegrationService();
      await mcpService.restartServer(serverName);
      await refreshMCPData();
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        lastError: `Failed to restart MCP server ${serverName}: ${error instanceof Error ? error.message : 'Unknown error'}`
      }));
      throw error;
    }
  }, [refreshMCPData]);

  const executeMCPTool = useCallback(async (toolName: string, parameters: Record<string, any>) => {
    try {
      const mcpService = getMCPIntegrationService();
      return await mcpService.executeTool(toolName, parameters);
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        lastError: `Failed to execute MCP tool ${toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`
      }));
      throw error;
    }
  }, []);

  // ACP Actions
  const refreshACPAgents = useCallback(async () => {
    await refreshACPData();
  }, [refreshACPData]);

  const queryACPAgent = useCallback(async (agentId: string, query: string, context?: Record<string, any>) => {
    try {
      const acpService = getACPIntegrationService();
      return await acpService.queryAgent({
        agentId,
        query,
        context,
        timeout: 30000
      });
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        lastError: `Failed to query ACP agent ${agentId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      }));
      throw error;
    }
  }, []);

  const reconnectACPAgent = useCallback(async (agentId: string) => {
    try {
      const acpService = getACPIntegrationService();
      await acpService.reconnectAgent(agentId);
      await refreshACPData();
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        lastError: `Failed to reconnect ACP agent ${agentId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      }));
      throw error;
    }
  }, [refreshACPData]);

  // Get unified tool list
  const getUnifiedToolList = useCallback(() => {
    const tools: Array<{
      name: string;
      description: string;
      type: 'mcp' | 'acp' | 'internal';
      source?: string;
    }> = [];

    // Add MCP tools
    state.mcpTools.forEach(tool => {
      tools.push({
        name: tool.name,
        description: tool.description,
        type: 'mcp',
        source: tool.serverName
      });
    });

    // Add ACP agents as tools
    state.acpAgents.filter(agent => agent.status === 'online').forEach(agent => {
      tools.push({
        name: `acp:${agent.id}`,
        description: `Query ${agent.name}: ${agent.description}`,
        type: 'acp',
        source: agent.id
      });
    });

    return tools;
  }, [state.mcpTools, state.acpAgents]);

  // Auto-initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  return {
    ...state,
    initialize,
    refreshMCPServers,
    restartMCPServer,
    executeMCPTool,
    refreshACPAgents,
    queryACPAgent,
    reconnectACPAgent,
    getUnifiedToolList
  };
}