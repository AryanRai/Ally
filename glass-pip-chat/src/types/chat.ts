export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: {
    source?: 'speech' | 'text' | 'remote';
    context?: string;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
  };
}

export interface ToolCall {
  name: string;
  parameters: Record<string, any>;
}

export interface ToolResult {
  name: string;
  result?: any;
  error?: string;
  success: boolean;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatState {
  chats: Chat[];
  activeChat: string | null;
}