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
    /** Images attached in a Claude Code / Codex session (data URLs) */
    images?: string[];
    /** Tokens / cost / time the agent reported for this reply */
    usage?: import('./agent').AgentUsage;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
    /** Persisted streaming segments (interleaved text + tool pills) for agentic messages.
     *  Typed as `any[]` to avoid a circular import with InlineToolIndicator.tsx.
     *  At runtime these are `Segment[]` (see src/components/chat/InlineToolIndicator.tsx). */
    segments?: any[];
    interactions?: import('../../electron/devices/interactions').InteractionHistory[];
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
  /** Local send failure is separate from native history, which may omit rejected sends. */
  sendFailure?: { message: string; text: string };
  /** Set when this chat is backed by a Claude Code / Codex session */
  agent?: {
    provider: 'claude' | 'codex';
    codexAccountId?: string;
    /** Agent session id; unset until the first turn returns one */
    sessionId?: string;
    /** Original exec session retained when Codex history is forked for interactive use. */
    originalSessionId?: string;
    /** Working folder the agent runs in */
    cwd?: string;
  };
}

export interface ChatState {
  chats: Chat[];
  activeChat: string | null;
}
/** A tool call made by the agent during a turn (rendered as a tool card). */
export interface ToolExecution {
  id: string;
  name: string;
  parameters?: Record<string, unknown>;
  status: 'pending' | 'executing' | 'success' | 'error';
  result?: any;
  error?: string;
  /** Images the tool returned (data URLs) */
  images?: string[];
  startTime: number;
  endTime?: number;
  isParallel?: boolean;
}

/** Assistant reply content in order: text and reasoning interleaved with tool calls. */
export interface Segment {
  itemId?: string;
  phase?: 'commentary' | 'final_answer';
  type: 'text' | 'tool' | 'thinking';
  content?: string;
  toolExecution?: ToolExecution;
}
