/**
 * Tool Registry Implementation
 * Requirements: 10.1, 16.1, 17.2
 * 
 * Provides dynamic tool registration, schema validation, and discovery mechanisms
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
import { SimpleValidator, ValidationResult } from '../utils/validation.js';
import {
  ToolDefinition,
  ToolRegistration,
  ToolHandler,
  ToolDiscoveryInfo,
  ToolRegistryEvent,
  SecurityLevel
} from '../types/index.js';

// Simple validation instead of JSON schemas

export class ToolRegistry extends BrowserEventEmitter {
  private tools: Map<string, ToolRegistration> = new Map();
  private discoveryInfo: Map<string, ToolDiscoveryInfo> = new Map();
  private healthCheckInterval: number | null = null;

  constructor() {
    super();
    
    // Start health check monitoring
    this.startHealthChecking();
  }

  /**
   * Register a new tool with validation
   */
  async registerTool(
    definition: ToolDefinition,
    handler: ToolHandler,
    source: 'internal' | 'mcp' | 'external' = 'internal',
    healthCheck?: () => Promise<boolean>
  ): Promise<void> {
    // Validate tool definition
    const validation = SimpleValidator.validateToolDefinition(definition);
    if (!validation.valid) {
      throw new Error(`Tool definition validation failed: ${validation.errors.join(', ')}`);
    }

    // Check for name conflicts
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool '${definition.name}' is already registered`);
    }

    // Validate security level permissions
    this.validateSecurityPermissions(definition);

    // Create registration
    const registration: ToolRegistration = {
      definition,
      handler,
      registeredAt: new Date().toISOString(),
      source,
      healthCheck
    };

    // Store registration
    this.tools.set(definition.name, registration);

    // Update discovery info
    this.discoveryInfo.set(definition.name, {
      name: definition.name,
      source,
      available: true,
      lastSeen: new Date().toISOString(),
      metadata: {
        category: definition.category,
        securityLevel: definition.securityLevel,
        tags: definition.tags
      }
    });

    // Emit registration event
    this.emit('tool_registered', {
      type: 'tool_registered',
      toolName: definition.name,
      timestamp: new Date().toISOString(),
      data: { source, securityLevel: definition.securityLevel }
    } as ToolRegistryEvent);

    console.log(`Tool '${definition.name}' registered successfully from ${source}`);
  }

  /**
   * Unregister a tool
   */
  async unregisterTool(toolName: string): Promise<void> {
    const registration = this.tools.get(toolName);
    if (!registration) {
      throw new Error(`Tool '${toolName}' is not registered`);
    }

    // Remove from registry
    this.tools.delete(toolName);
    this.discoveryInfo.delete(toolName);

    // Emit unregistration event
    this.emit('tool_unregistered', {
      type: 'tool_unregistered',
      toolName,
      timestamp: new Date().toISOString(),
      data: { source: registration.source }
    } as ToolRegistryEvent);

    console.log(`Tool '${toolName}' unregistered successfully`);
  }

  /**
   * Update an existing tool registration (hot-swapping)
   */
  async updateTool(
    toolName: string,
    definition: ToolDefinition,
    handler?: ToolHandler,
    healthCheck?: () => Promise<boolean>
  ): Promise<void> {
    const existingRegistration = this.tools.get(toolName);
    if (!existingRegistration) {
      throw new Error(`Tool '${toolName}' is not registered`);
    }

    // Validate new definition
    const validation = SimpleValidator.validateToolDefinition(definition);
    if (!validation.valid) {
      throw new Error(`Tool definition validation failed: ${validation.errors.join(', ')}`);
    }

    // Validate security level permissions
    this.validateSecurityPermissions(definition);

    // Update registration
    const updatedRegistration: ToolRegistration = {
      ...existingRegistration,
      definition,
      handler: handler || existingRegistration.handler,
      healthCheck: healthCheck || existingRegistration.healthCheck
    };

    this.tools.set(toolName, updatedRegistration);

    // Update discovery info
    const discoveryInfo = this.discoveryInfo.get(toolName);
    if (discoveryInfo) {
      discoveryInfo.lastSeen = new Date().toISOString();
      discoveryInfo.metadata = {
        category: definition.category,
        securityLevel: definition.securityLevel,
        tags: definition.tags
      };
    }

    // Emit update event
    this.emit('tool_updated', {
      type: 'tool_updated',
      toolName,
      timestamp: new Date().toISOString(),
      data: { 
        oldVersion: existingRegistration.definition.version,
        newVersion: definition.version
      }
    } as ToolRegistryEvent);

    console.log(`Tool '${toolName}' updated successfully`);
  }

  /**
   * Get tool registration by name
   */
  getTool(toolName: string): ToolRegistration | undefined {
    return this.tools.get(toolName);
  }

  /**
   * Get tool definition by name
   */
  getToolDefinition(toolName: string): ToolDefinition | undefined {
    return this.tools.get(toolName)?.definition;
  }

  /**
   * Get tool handler by name
   */
  getToolHandler(toolName: string): ToolHandler | undefined {
    return this.tools.get(toolName)?.handler;
  }

  /**
   * List all registered tools
   */
  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(reg => reg.definition);
  }

  /**
   * Search tools by criteria
   */
  searchTools(criteria: {
    category?: string;
    securityLevel?: SecurityLevel;
    tags?: string[];
    source?: string;
  }): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter(registration => {
        const { definition } = registration;
        
        if (criteria.category && definition.category !== criteria.category) {
          return false;
        }
        
        if (criteria.securityLevel && definition.securityLevel !== criteria.securityLevel) {
          return false;
        }
        
        if (criteria.source && registration.source !== criteria.source) {
          return false;
        }
        
        if (criteria.tags && criteria.tags.length > 0) {
          const toolTags = definition.tags || [];
          const hasAllTags = criteria.tags.every(tag => toolTags.includes(tag));
          if (!hasAllTags) {
            return false;
          }
        }
        
        return true;
      })
      .map(reg => reg.definition);
  }

  /**
   * Get tool discovery information
   */
  getDiscoveryInfo(): ToolDiscoveryInfo[] {
    return Array.from(this.discoveryInfo.values());
  }

  /**
   * Check if a tool is available
   */
  isToolAvailable(toolName: string): boolean {
    const discoveryInfo = this.discoveryInfo.get(toolName);
    return discoveryInfo?.available || false;
  }

  /**
   * Get tool count by category
   */
  getToolStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    
    for (const registration of this.tools.values()) {
      const category = registration.definition.category;
      stats[category] = (stats[category] || 0) + 1;
    }
    
    return stats;
  }

  /**
   * Validate tool exists and is available
   */
  validateToolAvailability(toolName: string): void {
    if (!this.tools.has(toolName)) {
      throw new Error(`Tool '${toolName}' is not registered`);
    }
    
    if (!this.isToolAvailable(toolName)) {
      throw new Error(`Tool '${toolName}' is currently unavailable`);
    }
  }

  /**
   * Start health checking for registered tools
   */
  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [toolName, registration] of this.tools.entries()) {
        if (registration.healthCheck) {
          try {
            const isHealthy = await registration.healthCheck();
            const discoveryInfo = this.discoveryInfo.get(toolName);
            
            if (discoveryInfo) {
              const wasAvailable = discoveryInfo.available;
              discoveryInfo.available = isHealthy;
              discoveryInfo.lastSeen = new Date().toISOString();
              
              // Emit health change event if status changed
              if (wasAvailable !== isHealthy) {
                this.emit('tool_health_changed', {
                  type: 'tool_health_changed',
                  toolName,
                  timestamp: new Date().toISOString(),
                  data: { available: isHealthy }
                } as ToolRegistryEvent);
              }
            }
          } catch (error) {
            console.error(`Health check failed for tool '${toolName}':`, error);
            const discoveryInfo = this.discoveryInfo.get(toolName);
            if (discoveryInfo) {
              discoveryInfo.available = false;
            }
          }
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Validate security permissions for a tool definition
   */
  private validateSecurityPermissions(definition: ToolDefinition): void {
    const { securityLevel, permissions } = definition;
    
    // Define required permissions for each security level
    const requiredPermissions: Record<SecurityLevel, string[]> = {
      [SecurityLevel.LOW]: [],
      [SecurityLevel.MEDIUM]: ['tool.execute'],
      [SecurityLevel.HIGH]: ['tool.execute', 'system.access'],
      [SecurityLevel.CRITICAL]: ['tool.execute', 'system.access', 'admin.override']
    };
    
    const required = requiredPermissions[securityLevel];
    const missing = required.filter(perm => !permissions.includes(perm));
    
    if (missing.length > 0) {
      throw new Error(
        `Tool with security level '${securityLevel}' requires permissions: ${missing.join(', ')}`
      );
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.tools.clear();
    this.discoveryInfo.clear();
    this.removeAllListeners();
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();