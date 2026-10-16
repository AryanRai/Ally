// Types shared by the Electron agent runner and the renderer (src/types/agent.ts re-exports them).

export type AgentProvider = 'claude' | 'codex';
export type AgentPermission = 'full' | 'edit' | 'readonly';

/** Extra context handed to the agent while Robot mode is on. */
export interface AgentRobotContext {
  /** Persona / instructions appended to the agent's system prompt */
  instructions: string;
  /** HowYouSeeMe MCP endpoint the agent can call for perception + robot tools */
  mcpUrl?: string;
}

export interface AgentRunOptions {
  provider: AgentProvider;
  prompt: string;
  cwd: string;
  /** Agent session to resume; omit to start a new one */
  sessionId?: string;
  /** Model alias/slug; 'default' or empty uses the agent's own default */
  model?: string;
  permission?: AgentPermission;
  robot?: AgentRobotContext;
  /** PNG/JPEG files to show the agent (e.g. a circled screen region) */
  images?: string[];
}

export type AgentEvent =
  | { kind: 'session'; sessionId: string }
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_start'; id: string; name: string; input?: Record<string, unknown> }
  | { kind: 'tool_end'; id: string; output?: string; isError?: boolean }
  | { kind: 'done'; sessionId?: string; isError?: boolean; error?: string; costUsd?: number }
  | { kind: 'stderr'; text: string };

export interface AgentConfig {
  defaultCwd: string;
  permission: AgentPermission;
  claudePath?: string;
  codexPath?: string;
  robotMcpUrl?: string;
  /** Shake the cursor to open Circle to Ask */
  shakeToCircle?: boolean;
}

export interface AgentStatus {
  available: boolean;
  path: string | null;
}

export interface AgentModel {
  id: string;
  name: string;
  description?: string;
}

export interface AgentSessionSummary {
  provider: AgentProvider;
  id: string;
  title: string;
  cwd?: string;
  updatedAt: number;
}

export interface AgentToolExecution {
  id: string;
  name: string;
  parameters?: Record<string, unknown>;
  status: 'pending' | 'executing' | 'success' | 'error';
  result?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
}

export interface AgentHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  segments?: Array<{ type: 'text' | 'tool'; content?: string; toolExecution?: AgentToolExecution }>;
}
