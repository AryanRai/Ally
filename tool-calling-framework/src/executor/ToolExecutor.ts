/**
 * Tool Executor with Security Validation
 * Requirements: 10.2, 10.4, 16.2, 16.4
 * 
 * Provides secure tool execution environment with parameter sanitization,
 * execution context management, result formatting, error handling, and audit logging
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  ToolExecutionRequest,
  ToolExecutionResult,
  ExecutionContext,
  ExecutionStatus,
  ToolError,
  SecurityLevel,
  AuditLogEntry,
  ParameterSchema
} from '../types/index.js';
import { ToolRegistry } from '../registry/ToolRegistry.js';

// Import JSON schemas
import executionRequestSchema from '../schemas/execution-request.schema.json' assert { type: 'json' };
import executionResultSchema from '../schemas/execution-result.schema.json' assert { type: 'json' };

export interface ExecutorConfig {
  maxConcurrentExecutions: number;
  defaultTimeout: number;
  enableAuditLogging: boolean;
  securityValidation: boolean;
  parameterSanitization: boolean;
}

export class ToolExecutor extends EventEmitter {
  private registry: ToolRegistry;
  private ajv: Ajv;
  private config: ExecutorConfig;
  private activeExecutions: Map<string, Promise<ToolExecutionResult>> = new Map();
  private auditLog: AuditLogEntry[] = [];
  private executionContexts: Map<string, ExecutionContext> = new Map();

  constructor(registry: ToolRegistry, config: Partial<ExecutorConfig> = {}) {
    super();
    
    this.registry = registry;
    this.config = {
      maxConcurrentExecutions: 10,
      defaultTimeout: 30000,
      enableAuditLogging: true,
      securityValidation: true,
      parameterSanitization: true,
      ...config
    };

    // Initialize JSON schema validator
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
    this.ajv.addSchema(executionRequestSchema, 'execution-request');
    this.ajv.addSchema(executionResultSchema, 'execution-result');
  }

  /**
   * Execute a tool with full security validation and context management
   */
  async executeToolSafe(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const executionId = request.executionId || uuidv4();
    
    // Create request with generated execution ID
    const requestWithId = { ...request, executionId };
    
    try {
      // Validate execution request
      this.validateExecutionRequest(requestWithId);
      
      // Check concurrent execution limits
      this.checkConcurrencyLimits();
      
      // Validate tool availability and permissions
      await this.validateToolSecurity(requestWithId);
      
      // Sanitize parameters
      const sanitizedRequest = this.sanitizeParameters(requestWithId);
      
      // Store execution context
      this.executionContexts.set(executionId, sanitizedRequest.context);
      
      // Create execution promise
      const executionPromise = this.executeToolInternal(sanitizedRequest);
      this.activeExecutions.set(executionId, executionPromise);
      
      // Log execution start
      this.logAuditEntry({
        executionId,
        toolName: sanitizedRequest.toolName,
        userId: sanitizedRequest.context.userId,
        action: 'execute',
        timestamp: new Date().toISOString(),
        parameters: this.config.enableAuditLogging ? sanitizedRequest.parameters : undefined,
        securityLevel: this.registry.getToolDefinition(sanitizedRequest.toolName)?.securityLevel || SecurityLevel.LOW,
        permissions: sanitizedRequest.context.permissions || [],
        metadata: { requestId: sanitizedRequest.executionId }
      });
      
      // Execute with timeout
      const result = await this.executeWithTimeout(executionPromise, sanitizedRequest);
      
      // Clean up
      this.activeExecutions.delete(executionId);
      this.executionContexts.delete(executionId);
      
      // Log successful execution
      this.logAuditEntry({
        executionId,
        toolName: sanitizedRequest.toolName,
        userId: sanitizedRequest.context.userId,
        action: 'success',
        timestamp: new Date().toISOString(),
        result: this.config.enableAuditLogging ? result.result : undefined,
        securityLevel: this.registry.getToolDefinition(sanitizedRequest.toolName)?.securityLevel || SecurityLevel.LOW,
        permissions: sanitizedRequest.context.permissions || [],
        metadata: { executionTime: Date.now() - startTime }
      });
      
      return result;
      
    } catch (error) {
      // Clean up on error
      this.activeExecutions.delete(executionId);
      this.executionContexts.delete(executionId);
      
      const toolError = this.formatError(error);
      const result: ToolExecutionResult = {
        executionId,
        toolName: requestWithId.toolName,
        status: ExecutionStatus.FAILED,
        error: toolError,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      
      // Log failed execution
      this.logAuditEntry({
        executionId,
        toolName: requestWithId.toolName,
        userId: requestWithId.context.userId,
        action: 'failure',
        timestamp: new Date().toISOString(),
        error: toolError,
        securityLevel: this.registry.getToolDefinition(requestWithId.toolName)?.securityLevel || SecurityLevel.LOW,
        permissions: requestWithId.context.permissions || [],
        metadata: { executionTime: Date.now() - startTime }
      });
      
      return result;
    }
  }

  /**
   * Execute multiple tools in sequence with context passing
   */
  async executeToolChain(
    requests: ToolExecutionRequest[],
    sharedContext: Partial<ExecutionContext> = {}
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    let contextData: Record<string, any> = {};
    
    for (const request of requests) {
      // Merge shared context and previous results
      const enhancedContext: ExecutionContext = {
        ...request.context,
        ...sharedContext,
        environment: {
          ...request.context.environment,
          ...contextData
        }
      };
      
      const enhancedRequest: ToolExecutionRequest = {
        ...request,
        context: enhancedContext
      };
      
      const result = await this.executeToolSafe(enhancedRequest);
      results.push(result);
      
      // Pass successful results to next tool
      if (result.status === ExecutionStatus.SUCCESS && result.result) {
        contextData[`${request.toolName}_result`] = result.result;
      }
      
      // Stop chain on failure unless explicitly configured to continue
      if (result.status === ExecutionStatus.FAILED) {
        break;
      }
    }
    
    return results;
  }

  /**
   * Cancel a running tool execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return false;
    }
    
    // Note: In a real implementation, you'd need to implement cancellation tokens
    // For now, we'll just remove it from tracking
    this.activeExecutions.delete(executionId);
    this.executionContexts.delete(executionId);
    
    this.logAuditEntry({
      executionId,
      toolName: 'unknown',
      action: 'failure',
      timestamp: new Date().toISOString(),
      error: {
        code: 'EXECUTION_CANCELLED',
        message: 'Execution was cancelled by user',
        recoverable: false
      },
      securityLevel: SecurityLevel.LOW,
      permissions: []
    });
    
    return true;
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): string[] {
    return Array.from(this.activeExecutions.keys());
  }

  /**
   * Get execution context
   */
  getExecutionContext(executionId: string): ExecutionContext | undefined {
    return this.executionContexts.get(executionId);
  }

  /**
   * Get audit log entries
   */
  getAuditLog(filter?: {
    toolName?: string;
    userId?: string;
    action?: string;
    since?: string;
  }): AuditLogEntry[] {
    let filteredLog = this.auditLog;
    
    if (filter) {
      filteredLog = this.auditLog.filter(entry => {
        if (filter.toolName && entry.toolName !== filter.toolName) return false;
        if (filter.userId && entry.userId !== filter.userId) return false;
        if (filter.action && entry.action !== filter.action) return false;
        if (filter.since && entry.timestamp < filter.since) return false;
        return true;
      });
    }
    
    return filteredLog.slice(-1000); // Return last 1000 entries
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * Validate execution request against schema
   */
  private validateExecutionRequest(request: ToolExecutionRequest): void {
    const isValid = this.ajv.validate('execution-request', request);
    if (!isValid) {
      const errors = this.ajv.errors?.map(err => `${err.instancePath}: ${err.message}`).join(', ');
      throw new Error(`Execution request validation failed: ${errors}`);
    }
  }

  /**
   * Check concurrent execution limits
   */
  private checkConcurrencyLimits(): void {
    if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
      throw new Error(`Maximum concurrent executions (${this.config.maxConcurrentExecutions}) exceeded`);
    }
  }

  /**
   * Validate tool security and permissions
   */
  private async validateToolSecurity(request: ToolExecutionRequest): Promise<void> {
    if (!this.config.securityValidation) {
      return;
    }
    
    // Validate tool exists and is available
    this.registry.validateToolAvailability(request.toolName);
    
    const toolDefinition = this.registry.getToolDefinition(request.toolName);
    if (!toolDefinition) {
      throw new Error(`Tool '${request.toolName}' definition not found`);
    }
    
    // Check permissions
    const userPermissions = request.context.permissions || [];
    const requiredPermissions = toolDefinition.permissions;
    
    const missingPermissions = requiredPermissions.filter(
      perm => !userPermissions.includes(perm)
    );
    
    if (missingPermissions.length > 0) {
      throw new Error(
        `Insufficient permissions. Missing: ${missingPermissions.join(', ')}`
      );
    }
    
    // Additional security checks for high-security tools
    if (toolDefinition.securityLevel === SecurityLevel.CRITICAL) {
      if (!request.context.userId) {
        throw new Error('User identification required for critical security level tools');
      }
      
      // In a real implementation, you might check additional factors like:
      // - Multi-factor authentication
      // - Time-based access controls
      // - IP restrictions
      // - etc.
    }
  }

  /**
   * Sanitize parameters to prevent injection attacks
   */
  private sanitizeParameters(request: ToolExecutionRequest): ToolExecutionRequest {
    if (!this.config.parameterSanitization) {
      return request;
    }
    
    const toolDefinition = this.registry.getToolDefinition(request.toolName);
    if (!toolDefinition) {
      return request;
    }
    
    const sanitizedParameters = this.sanitizeObject(
      request.parameters,
      toolDefinition.parameters
    );
    
    return {
      ...request,
      parameters: sanitizedParameters
    };
  }

  /**
   * Recursively sanitize object parameters
   */
  private sanitizeObject(
    obj: Record<string, any>,
    schema: Record<string, ParameterSchema>
  ): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const paramSchema = schema[key];
      if (!paramSchema) {
        continue; // Skip unknown parameters
      }
      
      sanitized[key] = this.sanitizeValue(value, paramSchema);
    }
    
    return sanitized;
  }

  /**
   * Sanitize individual values based on parameter schema
   */
  private sanitizeValue(value: any, schema: ParameterSchema): any {
    if (value === null || value === undefined) {
      return value;
    }
    
    switch (schema.type) {
      case 'string':
        return this.sanitizeString(String(value), schema);
      case 'number':
        return this.sanitizeNumber(Number(value), schema);
      case 'boolean':
        return Boolean(value);
      case 'array':
        if (Array.isArray(value) && schema.items) {
          return value.map(item => this.sanitizeValue(item, schema.items!));
        }
        return value;
      case 'object':
        if (typeof value === 'object' && schema.properties) {
          return this.sanitizeObject(value, schema.properties);
        }
        return value;
      default:
        return value;
    }
  }

  /**
   * Sanitize string values
   */
  private sanitizeString(value: string, schema: ParameterSchema): string {
    let sanitized = value;
    
    // Basic XSS prevention first
    sanitized = sanitized
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, ''); // Remove event handlers
    
    // Then validate against pattern if provided
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(sanitized)) {
        throw new Error(`Parameter value does not match required pattern: ${schema.pattern}`);
      }
    }
    
    return sanitized;
  }

  /**
   * Sanitize numeric values
   */
  private sanitizeNumber(value: number, schema: ParameterSchema): number {
    if (isNaN(value)) {
      throw new Error('Invalid number value');
    }
    
    if (schema.minimum !== undefined && value < schema.minimum) {
      throw new Error(`Value ${value} is below minimum ${schema.minimum}`);
    }
    
    if (schema.maximum !== undefined && value > schema.maximum) {
      throw new Error(`Value ${value} is above maximum ${schema.maximum}`);
    }
    
    return value;
  }

  /**
   * Execute tool with timeout handling
   */
  private async executeWithTimeout(
    executionPromise: Promise<ToolExecutionResult>,
    request: ToolExecutionRequest
  ): Promise<ToolExecutionResult> {
    const toolDefinition = this.registry.getToolDefinition(request.toolName);
    const timeout = request.timeout || toolDefinition?.timeout || this.config.defaultTimeout;
    
    const timeoutPromise = new Promise<ToolExecutionResult>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeout}ms`));
      }, timeout);
    });
    
    return Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Internal tool execution
   */
  private async executeToolInternal(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const handler = this.registry.getToolHandler(request.toolName);
      if (!handler) {
        throw new Error(`Tool handler not found for '${request.toolName}'`);
      }
      
      const result = await handler(request.parameters, request.context);
      
      return {
        executionId: request.executionId,
        toolName: request.toolName,
        status: ExecutionStatus.SUCCESS,
        result,
        executionTime: Math.max(1, Date.now() - startTime), // Ensure at least 1ms
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        executionId: request.executionId,
        toolName: request.toolName,
        status: ExecutionStatus.FAILED,
        error: this.formatError(error),
        executionTime: Math.max(1, Date.now() - startTime), // Ensure at least 1ms
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Format error for consistent error handling
   */
  private formatError(error: any): ToolError {
    if (error instanceof Error) {
      return {
        code: error.name || 'EXECUTION_ERROR',
        message: error.message,
        details: error.stack,
        recoverable: this.isRecoverableError(error),
        suggestedActions: this.getSuggestedActions(error)
      };
    }
    
    return {
      code: 'UNKNOWN_ERROR',
      message: String(error),
      recoverable: false,
      suggestedActions: ['Check tool implementation and parameters']
    };
  }

  /**
   * Determine if an error is recoverable
   */
  private isRecoverableError(error: Error): boolean {
    const recoverableErrors = [
      'TIMEOUT',
      'NETWORK_ERROR',
      'TEMPORARY_FAILURE',
      'RATE_LIMIT_EXCEEDED'
    ];
    
    return recoverableErrors.some(code => error.message.includes(code));
  }

  /**
   * Get suggested actions for error recovery
   */
  private getSuggestedActions(error: Error): string[] {
    if (error.message.includes('timeout')) {
      return ['Increase timeout value', 'Check tool performance', 'Retry with smaller parameters'];
    }
    
    if (error.message.includes('permission')) {
      return ['Check user permissions', 'Request elevated access', 'Use alternative tool'];
    }
    
    if (error.message.includes('parameter')) {
      return ['Validate parameter values', 'Check parameter schema', 'Review tool documentation'];
    }
    
    return ['Check tool logs', 'Verify tool configuration', 'Contact system administrator'];
  }

  /**
   * Log audit entry
   */
  private logAuditEntry(entry: AuditLogEntry): void {
    if (!this.config.enableAuditLogging) {
      return;
    }
    
    this.auditLog.push(entry);
    
    // Keep only last 10000 entries to prevent memory issues
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-5000);
    }
    
    // Emit audit event
    this.emit('audit_log', entry);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Cancel all active executions
    for (const executionId of this.activeExecutions.keys()) {
      this.cancelExecution(executionId);
    }
    
    this.activeExecutions.clear();
    this.executionContexts.clear();
    this.auditLog = [];
    this.removeAllListeners();
  }
}