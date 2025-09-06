/**
 * Shared Types for Ally Integration
 * 
 * Unified type definitions that work across both applications
 */

// Base message interface that both applications can use
export interface UnifiedMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number; // Unix timestamp for consistency
  
  // Optional fields for compatibility
  session_id?: string;
  user_id?: string;
  status?: 'pending' | 'processing' | 'completed' | 'error';
  error_message?: string;
  response?: string;
  
  // Metadata for both applications
  metadata?: {
    source?: 'speech' | 'text' | 'remote';
    context?: string;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
    isRemote?: boolean;
    local_system_id?: string;
  };
  
  // Database fields (optional for glass-pip-chat)
  created_at?: string;
  updated_at?: string;
  processed_at?: string;
  completed_at?: string;
}

// Unified tool interfaces
export interface ToolCall {
  name: string;
  parameters: Record<string, any>;
  id?: string;
}

export interface ToolResult {
  name: string;
  result?: any;
  error?: string;
  success: boolean;
  execution_time_ms?: number;
}

// Unified chat session interface
export interface UnifiedChatSession {
  id: string;
  title: string;
  user_id?: string;
  messages: UnifiedMessage[];
  metadata: Record<string, any>;
  is_remote: boolean;
  created_at: number; // Unix timestamp
  updated_at: number; // Unix timestamp
}

// Authentication state interface
export interface UnifiedAuthState {
  user: {
    id: string;
    email?: string;
    [key: string]: any;
  } | null;
  session: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    [key: string]: any;
  } | null;
  isAuthenticated: boolean;
  lastAuthenticated?: number;
  source: 'desktop' | 'web';
}

// Local system interface
export interface UnifiedLocalSystem {
  id: string;
  user_id: string;
  name: string;
  type: 'desktop' | 'web';
  status: 'online' | 'offline' | 'busy';
  last_heartbeat: number; // Unix timestamp
  capabilities: {
    models: string[];
    tools: string[];
    features: string[];
  };
  metadata: Record<string, any>;
  created_at: number; // Unix timestamp
}

// Connection status
export type UnifiedConnectionStatus = 'online' | 'offline' | 'connecting' | 'error';

// Stream event interface
export interface UnifiedStreamEvent {
  type: 'response_chunk' | 'tool_execution' | 'status_change' | 'error' | 'auth_change';
  messageId?: string;
  sessionId?: string;
  data: {
    content?: string;
    toolExecution?: ToolResult;
    status?: string;
    error?: string;
    authState?: UnifiedAuthState;
  };
  timestamp: number; // Unix timestamp
  source: 'desktop' | 'web';
}

// API request/response interfaces
export interface UnifiedSendMessageRequest {
  content: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  source: 'desktop' | 'web';
}

export interface UnifiedSendMessageResponse {
  messageId: string;
  sessionId: string;
  status: string;
  estimatedProcessingTime?: number;
  timestamp: number;
}

// Configuration interfaces
export interface UnifiedConfig {
  supabase: {
    url: string;
    anonKey: string;
    serviceKey?: string;
  };
  system: {
    id: string;
    name: string;
    type: 'desktop' | 'web';
  };
  polling: {
    interval: number;
    batchSize: number;
    heartbeatInterval: number;
  };
  storage: {
    authKey: string;
    sessionKey: string;
  };
}

// Error interfaces
export interface UnifiedError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: number;
  source: 'desktop' | 'web';
}

// Service status interface
export interface UnifiedServiceStatus {
  isRunning: boolean;
  connectionStatus: UnifiedConnectionStatus;
  lastHeartbeat: number;
  activeConnections: number;
  errors: UnifiedError[];
  capabilities: string[];
}

// Type guards for compatibility
export function isUnifiedMessage(obj: any): obj is UnifiedMessage {
  return obj && 
    typeof obj.id === 'string' &&
    typeof obj.content === 'string' &&
    ['user', 'assistant', 'system'].includes(obj.role) &&
    typeof obj.timestamp === 'number';
}

export function isLegacyGlassPipMessage(obj: any): boolean {
  return obj && 
    typeof obj.id === 'string' &&
    typeof obj.content === 'string' &&
    ['user', 'assistant'].includes(obj.role) &&
    typeof obj.timestamp === 'number' &&
    !obj.session_id; // Glass-pip-chat doesn't have session_id
}

export function isLegacyRemoteServiceMessage(obj: any): boolean {
  return obj && 
    typeof obj.id === 'string' &&
    typeof obj.content === 'string' &&
    typeof obj.session_id === 'string' &&
    typeof obj.user_id === 'string' &&
    ['pending', 'processing', 'completed', 'error'].includes(obj.status);
}

// Conversion utilities
export function convertToUnifiedMessage(message: any, source: 'desktop' | 'web'): UnifiedMessage {
  const baseMessage: UnifiedMessage = {
    id: message.id,
    content: message.content || message.response || '',
    role: message.role || 'user',
    timestamp: typeof message.timestamp === 'number' ? message.timestamp : 
               message.created_at ? new Date(message.created_at).getTime() : Date.now(),
    metadata: {
      source: source === 'desktop' ? 'text' : 'remote',
      isRemote: source === 'web',
      ...message.metadata
    }
  };

  // Add optional fields if they exist
  if (message.session_id) baseMessage.session_id = message.session_id;
  if (message.user_id) baseMessage.user_id = message.user_id;
  if (message.status) baseMessage.status = message.status;
  if (message.error_message) baseMessage.error_message = message.error_message;
  if (message.response) baseMessage.response = message.response;
  if (message.created_at) baseMessage.created_at = message.created_at;
  if (message.updated_at) baseMessage.updated_at = message.updated_at;
  if (message.processed_at) baseMessage.processed_at = message.processed_at;
  if (message.completed_at) baseMessage.completed_at = message.completed_at;

  return baseMessage;
}

export function convertToLegacyFormat(message: UnifiedMessage, targetFormat: 'desktop' | 'web'): any {
  if (targetFormat === 'desktop') {
    // Convert to glass-pip-chat format
    return {
      id: message.id,
      role: message.role === 'system' ? 'assistant' : message.role,
      content: message.content,
      timestamp: message.timestamp,
      metadata: message.metadata
    };
  } else {
    // Convert to ally-remote-service format
    return {
      id: message.id,
      session_id: message.session_id || 'default-session',
      user_id: message.user_id || 'default-user',
      content: message.content,
      response: message.response || '',
      status: message.status || 'completed',
      error_message: message.error_message,
      metadata: message.metadata || {},
      is_remote: message.metadata?.isRemote || false,
      local_system_id: message.metadata?.local_system_id || 'default-system',
      created_at: message.created_at || new Date(message.timestamp).toISOString(),
      updated_at: message.updated_at || new Date().toISOString(),
      processed_at: message.processed_at,
      completed_at: message.completed_at
    };
  }
}