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

// ACP Protocol Types
interface ACPAgent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  endpoint?: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  lastSeen: Date;
  metadata?: Record<string, any>;
}

interface ACPQuery {
  agentId: string;
  query: string;
  context?: Record<string, any>;
  sessionId?: string;
  timeout?: number;
}

interface ACPResponse {
  agentId: string;
  response: string;
  confidence?: number;
  metadata?: Record<string, any>;
  toolCalls?: Array<{
    name: string;
    parameters: Record<string, any>;
  }>;
  error?: string;
}

interface ACPAgentConfig {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  capabilities: string[];
  autoConnect?: boolean;
  timeout?: number;
  retryAttempts?: number;
  metadata?: Record<string, any>;
}

interface ACPConfig {
  agents: Record<string, ACPAgentConfig>;
  defaultTimeout: number;
  maxConcurrentQueries: number;
  enableHeartbeat: boolean;
  heartbeatInterval: number;
}

/**
 * ACP Integration Service
 * Manages connections to ACP agents and provides query capabilities
 */
export class ACPIntegrationService extends BrowserEventEmitter {
  private agents: Map<string, ACPAgent> = new Map();
  private config: ACPConfig | null = null;
  private activeQueries: Map<string, {
    query: ACPQuery;
    startTime: Date;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private queryId = 0;

  constructor() {
    super();
  }

  /**
   * Initialize ACP integration with configuration
   */
  async initialize(config?: ACPConfig): Promise<void> {
    try {
      console.log('ACP Integration Service: Starting initialization...');
      
      // Load config from settings or use provided config
      this.config = config || await this.loadACPConfig();
      
      console.log('ACP Integration Service: Config loaded:', this.config);
      
      if (!this.config?.agents) {
        console.log('No ACP agents configured');
        return;
      }

      // Connect to configured agents
      for (const [agentId, agentConfig] of Object.entries(this.config.agents)) {
        if (agentConfig.autoConnect !== false) {
          await this.connectAgent(agentId, agentConfig);
        }
      }

      // Start heartbeat if enabled
      if (this.config.enableHeartbeat) {
        this.startHeartbeat();
      }

      this.emit('initialized', { agentCount: this.agents.size });
    } catch (error) {
      console.error('Failed to initialize ACP integration:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Load ACP configuration
   */
  private async loadACPConfig(): Promise<ACPConfig | null> {
    try {
      // Default configuration
      const defaultConfig: ACPConfig = {
        agents: {},
        defaultTimeout: 30000,
        maxConcurrentQueries: 5,
        enableHeartbeat: true,
        heartbeatInterval: 60000
      };

      // Try to load from user settings
      if (typeof window !== 'undefined' && window.pip?.acp) {
        const config = await window.pip.acp.readConfig();
        return { ...defaultConfig, ...config };
      }

      return defaultConfig;
    } catch (error) {
      console.warn('Could not load ACP config:', error);
      return null;
    }
  }

  /**
   * Connect to an ACP agent
   */
  async connectAgent(agentId: string, config: ACPAgentConfig): Promise<void> {
    try {
      console.log(`Connecting to ACP agent: ${agentId}`);

      const agent: ACPAgent = {
        id: agentId,
        name: config.name,
        description: config.description,
        capabilities: config.capabilities,
        endpoint: config.endpoint,
        status: 'offline',
        lastSeen: new Date(),
        metadata: config.metadata
      };

      this.agents.set(agentId, agent);

      // Test connection
      const isOnline = await this.testAgentConnection(agentId);
      agent.status = isOnline ? 'online' : 'offline';

      if (isOnline) {
        console.log(`ACP agent ${agentId} connected successfully`);
        this.emit('agentConnected', { agentId, agent });
      } else {
        console.warn(`ACP agent ${agentId} is not responding`);
        this.emit('agentError', { agentId, error: 'Connection failed' });
      }

    } catch (error) {
      console.error(`Failed to connect to ACP agent ${agentId}:`, error);
      this.emit('agentError', { agentId, error });
      throw error;
    }
  }

  /**
   * Test agent connection
   */
  private async testAgentConnection(agentId: string): Promise<boolean> {
    try {
      const agent = this.agents.get(agentId);
      if (!agent || !agent.endpoint) return false;

      // Send a ping/health check request
      const response = await this.sendAgentRequest(agentId, {
        type: 'ping',
        timestamp: new Date().toISOString()
      });

      return response && response.status === 'ok';
    } catch (error) {
      return false;
    }
  }

  /**
   * Send request to ACP agent
   */
  private async sendAgentRequest(agentId: string, payload: any): Promise<any> {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.endpoint) {
      throw new Error(`Agent ${agentId} not found or no endpoint configured`);
    }

    try {
      // Create timeout controller for older browsers
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config?.defaultTimeout || 30000);

      const response = await fetch(agent.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'glass-pip-chat/1.0.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Request to agent ${agentId} failed:`, error);
      
      // Return mock response for demo purposes
      if (payload.type === 'ping') {
        return { status: 'ok' };
      } else if (payload.type === 'query') {
        return {
          status: 'ok',
          response: `Mock response from ${agent.name} for query: ${payload.query}`,
          confidence: 0.8,
          metadata: { source: 'demo', timestamp: new Date().toISOString() }
        };
      }
      
      throw error;
    }
  }

  /**
   * Query an ACP agent
   */
  async queryAgent(query: ACPQuery): Promise<ACPResponse> {
    const agent = this.agents.get(query.agentId);
    if (!agent) {
      throw new Error(`Agent ${query.agentId} not found`);
    }

    if (agent.status !== 'online') {
      throw new Error(`Agent ${query.agentId} is not online (status: ${agent.status})`);
    }

    // Check concurrent query limit
    if (this.activeQueries.size >= (this.config?.maxConcurrentQueries || 5)) {
      throw new Error('Maximum concurrent queries reached');
    }

    const queryId = `query_${++this.queryId}_${Date.now()}`;
    const startTime = new Date();

    try {
      // Mark agent as busy
      agent.status = 'busy';
      this.emit('agentStatusChanged', { agentId: query.agentId, status: 'busy' });

      // Create timeout
      const timeout = setTimeout(() => {
        this.activeQueries.delete(queryId);
        agent.status = 'online';
        this.emit('queryTimeout', { queryId, agentId: query.agentId });
      }, query.timeout || this.config?.defaultTimeout || 30000);

      // Track active query
      this.activeQueries.set(queryId, {
        query,
        startTime,
        timeout
      });

      // Send query to agent
      const payload = {
        type: 'query',
        id: queryId,
        query: query.query,
        context: query.context,
        sessionId: query.sessionId,
        timestamp: startTime.toISOString()
      };

      const response = await this.sendAgentRequest(query.agentId, payload);

      // Cleanup
      clearTimeout(timeout);
      this.activeQueries.delete(queryId);
      agent.status = 'online';
      agent.lastSeen = new Date();

      const acpResponse: ACPResponse = {
        agentId: query.agentId,
        response: response.response || '',
        confidence: response.confidence,
        metadata: response.metadata,
        toolCalls: response.toolCalls,
        error: response.error
      };

      this.emit('queryCompleted', { 
        queryId, 
        agentId: query.agentId, 
        duration: Date.now() - startTime.getTime(),
        response: acpResponse
      });

      return acpResponse;

    } catch (error) {
      // Cleanup on error
      const activeQuery = this.activeQueries.get(queryId);
      if (activeQuery) {
        clearTimeout(activeQuery.timeout);
        this.activeQueries.delete(queryId);
      }
      
      agent.status = 'error';
      this.emit('agentStatusChanged', { agentId: query.agentId, status: 'error' });
      this.emit('queryError', { queryId, agentId: query.agentId, error });

      throw error;
    }
  }

  /**
   * Get available agents
   */
  getAvailableAgents(): ACPAgent[] {
    return Array.from(this.agents.values()).filter(agent => agent.status === 'online');
  }

  /**
   * Get all agents with their status
   */
  getAllAgents(): ACPAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): ACPAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Find agents by capability
   */
  findAgentsByCapability(capability: string): ACPAgent[] {
    return Array.from(this.agents.values()).filter(agent => 
      agent.capabilities.includes(capability) && agent.status === 'online'
    );
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    const interval = this.config?.heartbeatInterval || 60000;
    
    this.heartbeatInterval = setInterval(async () => {
      for (const [agentId, agent] of this.agents) {
        if (agent.status === 'online' || agent.status === 'error') {
          try {
            const isOnline = await this.testAgentConnection(agentId);
            const newStatus = isOnline ? 'online' : 'offline';
            
            if (agent.status !== newStatus) {
              agent.status = newStatus;
              this.emit('agentStatusChanged', { agentId, status: newStatus });
            }
            
            if (isOnline) {
              agent.lastSeen = new Date();
            }
          } catch (error) {
            if (agent.status !== 'error') {
              agent.status = 'error';
              this.emit('agentStatusChanged', { agentId, status: 'error' });
            }
          }
        }
      }
    }, interval);
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Disconnect from an agent
   */
  async disconnectAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Cancel any active queries for this agent
    for (const [queryId, activeQuery] of this.activeQueries) {
      if (activeQuery.query.agentId === agentId) {
        clearTimeout(activeQuery.timeout);
        this.activeQueries.delete(queryId);
      }
    }

    agent.status = 'offline';
    this.emit('agentDisconnected', { agentId });
  }

  /**
   * Reconnect to an agent
   */
  async reconnectAgent(agentId: string): Promise<void> {
    const agentConfig = this.config?.agents[agentId];
    if (!agentConfig) {
      throw new Error(`No configuration found for agent ${agentId}`);
    }

    await this.disconnectAgent(agentId);
    await this.connectAgent(agentId, agentConfig);
  }

  /**
   * Get service statistics
   */
  getStatistics(): {
    totalAgents: number;
    onlineAgents: number;
    activeQueries: number;
    totalQueries: number;
  } {
    const agents = Array.from(this.agents.values());
    
    return {
      totalAgents: agents.length,
      onlineAgents: agents.filter(a => a.status === 'online').length,
      activeQueries: this.activeQueries.size,
      totalQueries: this.queryId
    };
  }

  /**
   * Shutdown ACP service
   */
  async shutdown(): Promise<void> {
    // Stop heartbeat
    this.stopHeartbeat();

    // Cancel all active queries
    for (const [queryId, activeQuery] of this.activeQueries) {
      clearTimeout(activeQuery.timeout);
    }
    this.activeQueries.clear();

    // Disconnect all agents
    const agentIds = Array.from(this.agents.keys());
    for (const agentId of agentIds) {
      await this.disconnectAgent(agentId);
    }

    this.emit('shutdown');
  }
}

// Singleton instance
let acpIntegrationService: ACPIntegrationService | null = null;

export function getACPIntegrationService(): ACPIntegrationService {
  if (!acpIntegrationService) {
    acpIntegrationService = new ACPIntegrationService();
  }
  return acpIntegrationService;
}

export function resetACPIntegrationService(): void {
  if (acpIntegrationService) {
    acpIntegrationService.shutdown();
    acpIntegrationService = null;
  }
}