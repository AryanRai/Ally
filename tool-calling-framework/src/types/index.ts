/**
 * Core TypeScript interfaces and schemas for the Tool Calling Framework
 * Requirements: 10.1, 10.2, 10.3, 16.1, 16.3
 */

// Security classification levels for tools
export enum SecurityLevel {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Tool execution status
export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout'
}

// Parameter validation types
export interface ParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  description?: string;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  items?: ParameterSchema;
  properties?: Record<string, ParameterSchema>;
}

// Tool definition interface
export interface ToolDefinition {
  name: string;
  description: string;
  version: string;
  category: string;
  securityLevel: SecurityLevel;
  parameters: Record<string, ParameterSchema>;
  permissions: string[];
  timeout?: number;
  retryable?: boolean;
  maxRetries?: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

// Tool execution request
export interface ToolExecutionRequest {
  toolName: string;
  parameters: Record<string, any>;
  executionId: string;
  context: ExecutionContext;
  timeout?: number;
  priority?: number;
  metadata?: Record<string, any>;
}

// Execution context for multi-tool workflows
export interface ExecutionContext {
  userId?: string;
  sessionId?: string;
  workflowId?: string;
  parentExecutionId?: string;
  timestamp: string;
  environment?: Record<string, any>;
  permissions?: string[];
}

// Tool execution result
export interface ToolExecutionResult {
  executionId: string;
  toolName: string;
  status: ExecutionStatus;
  result?: any;
  error?: ToolError;
  executionTime: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

// Error information
export interface ToolError {
  code: string;
  message: string;
  details?: any;
  recoverable?: boolean;
  suggestedActions?: string[];
}

// Tool registration information
export interface ToolRegistration {
  definition: ToolDefinition;
  handler: ToolHandler;
  registeredAt: string;
  source: 'internal' | 'mcp' | 'external';
  healthCheck?: () => Promise<boolean>;
}

// Tool handler function type
export type ToolHandler = (
  parameters: Record<string, any>,
  context: ExecutionContext
) => Promise<any>;

// Tool discovery information
export interface ToolDiscoveryInfo {
  name: string;
  source: string;
  available: boolean;
  lastSeen: string;
  metadata?: Record<string, any>;
}

// Workflow execution plan
export interface WorkflowPlan {
  id: string;
  steps: WorkflowStep[];
  dependencies: Record<string, string[]>;
  context: ExecutionContext;
  metadata?: Record<string, any>;
}

// Individual workflow step
export interface WorkflowStep {
  id: string;
  toolName: string;
  parameters: Record<string, any>;
  dependsOn?: string[];
  retryPolicy?: RetryPolicy;
  timeout?: number;
}

// Retry policy configuration
export interface RetryPolicy {
  maxRetries: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  baseDelay: number;
  maxDelay?: number;
  retryableErrors?: string[];
}

// Audit log entry
export interface AuditLogEntry {
  executionId: string;
  toolName: string;
  userId?: string;
  action: 'register' | 'execute' | 'success' | 'failure' | 'timeout';
  timestamp: string;
  parameters?: Record<string, any>;
  result?: any;
  error?: ToolError;
  securityLevel: SecurityLevel;
  permissions: string[];
  metadata?: Record<string, any>;
}

// Tool registry events
export interface ToolRegistryEvent {
  type: 'tool_registered' | 'tool_unregistered' | 'tool_updated' | 'tool_health_changed';
  toolName: string;
  timestamp: string;
  data?: any;
}

// MCP server configuration
export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  autoApprove?: string[];
  securityLevel: SecurityLevel;
  timeout?: number;
}