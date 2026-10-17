// Types shared by the Electron agent runner and the renderer (src/types/agent.ts re-exports them).

export type AgentProvider = 'claude' | 'codex';
export type AgentPermission = 'full' | 'edit' | 'readonly';
export type AgentInteractionHandler = (method: string, params: any, signal: AbortSignal) => Promise<unknown>;

/** Extra context handed to the agent while Robot mode is on. */
export interface AgentRobotContext {
  /** Persona / instructions appended to the agent's system prompt */
  instructions: string;
  /** HowYouSeeMe MCP endpoint the agent can call for perception tools */
  mcpUrl?: string;
  /** DroidCore MCP endpoint for motion tools (move, rotate, stop, scan, speak) */
  motionMcpUrl?: string;
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
  /** Short auxiliary requests such as greetings must not create saved chats. */
  ephemeral?: boolean;
  /** Experimental same-chat client coordination with Codex desktop (Windows). */
  codexDesktop?: boolean;
}

export interface AgentSessionSnapshot {
  title?: string;
  sessionId?: string;
  originalSessionId?: string;
  cwd?: string;
  messages: AgentHistoryMessage[];
  revision: string;
  unchanged?: boolean;
  /** Mid-turn in another app (Claude Code / Codex), judged from the transcript */
  running?: boolean;
}

export type AgentEvent =
  | { kind: 'input'; text: string; mode: 'steered' | 'queued' }
  | { kind: 'continuation' }
  | { kind: 'session'; sessionId: string }
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_start'; id: string; name: string; input?: Record<string, unknown> }
  /** Updated input for a running tool (e.g. Codex todo list progress) */
  | { kind: 'tool_update'; id: string; input: Record<string, unknown> }
  /** `images`: data URLs the tool returned (screenshots, image reads) */
  | { kind: 'tool_end'; id: string; output?: string; isError?: boolean; images?: string[] }
  | { kind: 'done'; sessionId?: string; isError?: boolean; error?: string; costUsd?: number; usage?: AgentUsage }
  | { kind: 'stderr'; text: string };

/** Per-turn totals the CLIs report. */
export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
  durationMs?: number;
}

export interface AgentConfig {
  /** Actual home directory, for working-folder labels. */
  homeCwd?: string;
  defaultCwd: string;
  permission: AgentPermission;
  claudePath?: string;
  codexPath?: string;
  /** Applies to existing Codex chats from both Ally desktop and the watch. */
  codexDesktop?: boolean;
  robotMcpUrl?: string;
  /** DroidCore motion MCP server (DroidCore/runtime), passed alongside HowYouSeeMe in Robot mode */
  droidcoreMcpUrl?: string;
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
  originalSessionId?: string;
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
  images?: string[];
  startTime: number;
  endTime?: number;
}

export interface AgentHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Images the user attached (data URLs) */
  images?: string[];
  usage?: AgentUsage;
  segments?: Array<{ type: 'text' | 'tool' | 'thinking'; content?: string; toolExecution?: AgentToolExecution }>;
}
