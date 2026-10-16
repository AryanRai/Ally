export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: {
    source?: 'speech' | 'text' | 'remote' | 'circle';
    context?: string;
    /** Small JPEG data URL of a circled screen region attached to this message */
    image?: string;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
    /** Persisted streaming segments (interleaved text + tool pills) for agentic messages.
     *  Typed as `any[]` to avoid a circular import with InlineToolIndicator.tsx.
     *  At runtime these are `Segment[]` (see src/components/chat/InlineToolIndicator.tsx). */
    segments?: any[];
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
  /** Set when this chat is backed by a Claude Code / Codex session */
  agent?: {
    provider: 'claude' | 'codex';
    /** Agent session id; unset until the first turn returns one */
    sessionId?: string;
    /** Working folder the agent runs in */
    cwd?: string;
  };
}

export interface ChatState {
  chats: Chat[];
  activeChat: string | null;
}