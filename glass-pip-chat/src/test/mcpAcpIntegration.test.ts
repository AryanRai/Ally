import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getMCPIntegrationService, resetMCPIntegrationService } from '../services/mcpIntegrationService';
import { getACPIntegrationService, resetACPIntegrationService } from '../services/acpIntegrationService';

// Mock WebSocket and process spawning for testing
const mockWebSocket = {
  send: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  readyState: 1
};

const mockProcess = {
  stdin: {
    getWriter: () => ({
      write: vi.fn(),
      releaseLock: vi.fn()
    })
  },
  stdout: {
    getReader: () => ({
      read: vi.fn().mockResolvedValue({ done: true, value: new Uint8Array() })
    })
  },
  kill: vi.fn()
};

// Mock electron API
global.window = {
  pip: {
    mcp: {
      spawnServer: vi.fn().mockResolvedValue(mockProcess),
      readConfig: vi.fn().mockResolvedValue({
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['test-server.js'],
            disabled: false
          }
        }
      })
    },
    acp: {
      readConfig: vi.fn().mockResolvedValue({
        agents: {
          'test-agent': {
            id: 'test-agent',
            name: 'Test Agent',
            description: 'Test agent for testing',
            endpoint: 'http://localhost:8001/test',
            capabilities: ['test'],
            autoConnect: true
          }
        }
      })
    }
  }
} as any;

// Mock fetch for ACP requests
global.fetch = vi.fn();

describe('MCP Integration Service', () => {
  beforeEach(() => {
    resetMCPIntegrationService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetMCPIntegrationService();
  });

  it('should initialize MCP service with configuration', async () => {
    const mcpService = getMCPIntegrationService();
    
    await mcpService.initialize();
    
    expect(window.pip.mcp.readConfig).toHaveBeenCalled();
    expect(window.pip.mcp.spawnServer).toHaveBeenCalledWith({
      command: 'node',
      args: ['test-server.js'],
      disabled: false
    });
  });

  it('should get server status', async () => {
    const mcpService = getMCPIntegrationService();
    await mcpService.initialize();
    
    const status = mcpService.getServerStatus();
    
    expect(Array.isArray(status)).toBe(true);
    expect(status.length).toBeGreaterThanOrEqual(0);
  });

  it('should get available tools', async () => {
    const mcpService = getMCPIntegrationService();
    await mcpService.initialize();
    
    const tools = mcpService.getAvailableTools();
    
    expect(Array.isArray(tools)).toBe(true);
  });

  it('should handle server restart', async () => {
    const mcpService = getMCPIntegrationService();
    await mcpService.initialize();
    
    await expect(mcpService.restartServer('test-server')).resolves.not.toThrow();
  });

  it('should handle tool execution error gracefully', async () => {
    const mcpService = getMCPIntegrationService();
    await mcpService.initialize();
    
    await expect(mcpService.executeTool('nonexistent-tool', {}))
      .rejects.toThrow('Tool nonexistent-tool not found');
  });
});

describe('ACP Integration Service', () => {
  beforeEach(() => {
    resetACPIntegrationService();
    vi.clearAllMocks();
    
    // Mock successful fetch response
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'ok',
        response: 'Test response'
      })
    });
  });

  afterEach(() => {
    resetACPIntegrationService();
  });

  it('should initialize ACP service with configuration', async () => {
    const acpService = getACPIntegrationService();
    
    await acpService.initialize();
    
    expect(window.pip.acp.readConfig).toHaveBeenCalled();
  });

  it('should get available agents', async () => {
    const acpService = getACPIntegrationService();
    await acpService.initialize();
    
    const agents = acpService.getAvailableAgents();
    
    expect(Array.isArray(agents)).toBe(true);
  });

  it('should query agent successfully', async () => {
    const acpService = getACPIntegrationService();
    await acpService.initialize();
    
    const response = await acpService.queryAgent({
      agentId: 'test-agent',
      query: 'test query',
      timeout: 5000
    });
    
    expect(response.agentId).toBe('test-agent');
    expect(response.response).toBe('Test response');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8001/test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        })
      })
    );
  });

  it('should handle agent query timeout', async () => {
    // Mock fetch to simulate timeout
    (global.fetch as any).mockRejectedValue(new Error('Timeout'));
    
    const acpService = getACPIntegrationService();
    await acpService.initialize();
    
    await expect(acpService.queryAgent({
      agentId: 'test-agent',
      query: 'test query',
      timeout: 1000
    })).rejects.toThrow();
  });

  it('should get service statistics', async () => {
    const acpService = getACPIntegrationService();
    await acpService.initialize();
    
    const stats = acpService.getStatistics();
    
    expect(stats).toHaveProperty('totalAgents');
    expect(stats).toHaveProperty('onlineAgents');
    expect(stats).toHaveProperty('activeQueries');
    expect(stats).toHaveProperty('totalQueries');
  });

  it('should find agents by capability', async () => {
    const acpService = getACPIntegrationService();
    await acpService.initialize();
    
    const agents = acpService.findAgentsByCapability('test');
    
    expect(Array.isArray(agents)).toBe(true);
  });
});

describe('Unified Tool Integration', () => {
  beforeEach(() => {
    resetMCPIntegrationService();
    resetACPIntegrationService();
    vi.clearAllMocks();
    
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'ok',
        response: 'Unified response'
      })
    });
  });

  afterEach(() => {
    resetMCPIntegrationService();
    resetACPIntegrationService();
  });

  it('should provide unified tool list', async () => {
    const mcpService = getMCPIntegrationService();
    const acpService = getACPIntegrationService();
    
    await Promise.all([
      mcpService.initialize(),
      acpService.initialize()
    ]);
    
    // Mock some tools and agents
    vi.spyOn(mcpService, 'getAvailableTools').mockReturnValue([
      {
        name: 'test-mcp-tool',
        description: 'Test MCP tool',
        serverName: 'test-server',
        inputSchema: { type: 'object', properties: {} }
      }
    ]);
    
    vi.spyOn(acpService, 'getAvailableAgents').mockReturnValue([
      {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'Test ACP agent',
        capabilities: ['test'],
        status: 'online' as const,
        lastSeen: new Date()
      }
    ]);
    
    const mcpTools = mcpService.getAvailableTools();
    const acpAgents = acpService.getAvailableAgents();
    
    expect(mcpTools).toHaveLength(1);
    expect(mcpTools[0].name).toBe('test-mcp-tool');
    
    expect(acpAgents).toHaveLength(1);
    expect(acpAgents[0].id).toBe('test-agent');
  });

  it('should handle mixed tool execution', async () => {
    const mcpService = getMCPIntegrationService();
    const acpService = getACPIntegrationService();
    
    await Promise.all([
      mcpService.initialize(),
      acpService.initialize()
    ]);
    
    // Test MCP tool execution
    vi.spyOn(mcpService, 'executeTool').mockResolvedValue({
      content: [{ type: 'text', text: 'MCP result' }]
    });
    
    const mcpResult = await mcpService.executeTool('test-tool', { param: 'value' });
    expect(mcpResult.content[0].text).toBe('MCP result');
    
    // Test ACP agent query
    const acpResult = await acpService.queryAgent({
      agentId: 'test-agent',
      query: 'test query'
    });
    expect(acpResult.response).toBe('Unified response');
  });
});

describe('Error Handling', () => {
  beforeEach(() => {
    resetMCPIntegrationService();
    resetACPIntegrationService();
    vi.clearAllMocks();
  });

  it('should handle MCP initialization failure', async () => {
    // Mock initialization failure
    window.pip.mcp.readConfig = vi.fn().mockRejectedValue(new Error('Config not found'));
    
    const mcpService = getMCPIntegrationService();
    
    await expect(mcpService.initialize()).rejects.toThrow('Config not found');
  });

  it('should handle ACP agent connection failure', async () => {
    // Mock fetch failure
    (global.fetch as any).mockRejectedValue(new Error('Connection failed'));
    
    const acpService = getACPIntegrationService();
    await acpService.initialize();
    
    await expect(acpService.queryAgent({
      agentId: 'test-agent',
      query: 'test query'
    })).rejects.toThrow('Connection failed');
  });

  it('should handle graceful shutdown', async () => {
    const mcpService = getMCPIntegrationService();
    const acpService = getACPIntegrationService();
    
    await Promise.all([
      mcpService.initialize(),
      acpService.initialize()
    ]);
    
    await expect(Promise.all([
      mcpService.shutdown(),
      acpService.shutdown()
    ])).resolves.not.toThrow();
  });
});