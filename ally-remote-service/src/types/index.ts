export interface Message {
  id: string
  session_id: string
  user_id: string
  content: string
  response: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  error_message?: string
  metadata: Record<string, any>
  is_remote: boolean
  local_system_id: string
  created_at: string
  updated_at: string
  processed_at?: string
  completed_at?: string
}

export interface ChatSession {
  id: string
  user_id: string
  title: string
  metadata: Record<string, any>
  is_remote: boolean
  created_at: string
  updated_at: string
}

export interface ToolExecution {
  id: string
  message_id: string
  tool_name: string
  parameters: Record<string, any>
  result?: Record<string, any>
  status: 'pending' | 'running' | 'completed' | 'failed'
  error_message?: string
  execution_time_ms?: number
  created_at: string
  completed_at?: string
}

export interface LocalSystem {
  id: string
  user_id: string
  name: string
  last_heartbeat: string
  status: 'online' | 'offline' | 'busy'
  capabilities: {
    models: string[]
    tools: string[]
    features: string[]
  }
  metadata: Record<string, any>
  created_at: string
}

export type ConnectionStatus = 'online' | 'offline' | 'connecting' | 'error'

export interface StreamEvent {
  type: 'response_chunk' | 'tool_execution' | 'status_change' | 'error'
  messageId: string
  data: {
    content?: string
    toolExecution?: ToolExecution
    status?: string
    error?: string
  }
  timestamp: string
}

export interface SendMessageRequest {
  content: string
  sessionId?: string
  metadata?: Record<string, any>
}

export interface SendMessageResponse {
  messageId: string
  sessionId: string
  status: string
  estimatedProcessingTime?: number
}