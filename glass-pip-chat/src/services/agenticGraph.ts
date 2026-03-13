/**
 * Agentic Graph (LangGraph.js)
 *
 * Replaces the hand-rolled agentic loop with a proper LangGraph StateGraph.
 * Fixes:
 *  - Indefinite looping: hard cap at MAX_STEPS (8) inside result_verifier.
 *  - Hallucinated tool success: actual tool results/errors are appended as
 *    tool messages before the next planner call, so the model sees reality.
 *  - Automatic retry of failing tools: errors are surfaced to the model which
 *    then decides what to do next — no silent retry.
 *  - Local models on agentic paths: planner always uses Claude Sonnet via
 *    OpenRouter (see providers.ts getModel(..., 'agent')).
 *
 * Topology:
 *   START → planner → tool_executor → result_verifier → (planner | END)
 *                ↓
 *              END (when model emits text with no tool calls)
 */

import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { generateText, jsonSchema, tool as aiTool, type CoreMessage } from 'ai';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { getModel } from './providers';
import { getMCPIntegrationService } from './mcpIntegrationService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCallResult {
  toolCallId: string;
  toolName: string;
  result: string;
  isError: boolean;
}

/** Type of the Electron preload bridge exposed on window.pip.mcp. */
interface PipMCPBridge {
  readConfig: () => Promise<{ mcpServers?: Record<string, unknown> }>;
}

interface PipWindow extends Window {
  pip?: {
    mcp?: PipMCPBridge;
  };
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

const AllyAgentState = Annotation.Root({
  messages: Annotation<CoreMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  toolCallResults: Annotation<ToolCallResult[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  stepCount: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0,
  }),
  lastToolError: Annotation<string | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  taskComplete: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),
});

type AllyAgentStateType = typeof AllyAgentState.State;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_STEPS = 8;

// ---------------------------------------------------------------------------
// Tool discovery helpers
// ---------------------------------------------------------------------------

/**
 * Load tools from the existing MCP integration service (already initialised)
 * and optionally from a MultiServerMCPClient for additional servers.
 *
 * Returns a tool map compatible with Vercel AI SDK's generateText `tools` param.
 */
async function buildToolSet(): Promise<Record<string, ReturnType<typeof aiTool>>> {
  const toolSet: Record<string, ReturnType<typeof aiTool>> = {};

  // 1. Tools from the existing MCPIntegrationService (already running servers)
  try {
    const mcpService = getMCPIntegrationService();
    const mcpTools = mcpService.getAvailableTools();

    for (const mcpTool of mcpTools) {
      const schema = mcpTool.inputSchema ?? { type: 'object', properties: {} };
      toolSet[mcpTool.name] = aiTool({
        description: mcpTool.description,
        parameters: jsonSchema(schema as Parameters<typeof jsonSchema>[0]),
      });
    }
  } catch {
    // MCP service may not be initialised in all contexts — not fatal
  }

  // 2. Attempt to load additional tools via MultiServerMCPClient
  //    Uses the same MCP server config that the rest of the app reads.
  try {
    const mcpConfig = await loadMCPServerConfigs();
    if (mcpConfig && Object.keys(mcpConfig).length > 0) {
      const mcpClient = new MultiServerMCPClient({
        mcpServers: mcpConfig,
      } as Parameters<typeof MultiServerMCPClient>[0]);

      const langchainTools = await mcpClient.getTools();

      for (const lcTool of langchainTools) {
        if (toolSet[lcTool.name]) continue; // already registered

        // Convert Zod schema to Vercel AI SDK tool
        toolSet[lcTool.name] = aiTool({
          description: lcTool.description ?? lcTool.name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parameters: (lcTool as any).schema,
        });
      }

      await mcpClient.close();
    }
  } catch {
    // MultiServerMCPClient failures are non-fatal: existing MCP tools still work
  }

  return toolSet;
}

/**
 * Read MCP server configurations via the Electron preload bridge.
 */
async function loadMCPServerConfigs(): Promise<Record<string, unknown> | null> {
  try {
    const pipWindow = (typeof window !== 'undefined' ? window : undefined) as PipWindow | undefined;
    if (pipWindow?.pip?.mcp) {
      const config = await pipWindow.pip.mcp.readConfig();
      return config?.mcpServers ?? null;
    }
  } catch {
    // ignore
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

/**
 * Execute a named tool by routing through the MCPIntegrationService.
 * Falls back gracefully if the tool is not found.
 */
async function executeToolWithServices(
  toolName: string,
  parameters: Record<string, unknown>
): Promise<unknown> {
  const mcpService = getMCPIntegrationService();
  const mcpTools = mcpService.getAvailableTools();
  const mcpTool = mcpTools.find((t) => t.name === toolName);

  if (mcpTool) {
    return mcpService.executeTool(toolName, parameters);
  }

  throw new Error(`Tool "${toolName}" is not available in the current context.`);
}

// ---------------------------------------------------------------------------
// Graph nodes
// ---------------------------------------------------------------------------

async function plannerNode(
  state: AllyAgentStateType
): Promise<Partial<AllyAgentStateType>> {
  const tools = await buildToolSet();

  const result = await generateText({
    model: getModel('openrouter', 'anthropic/claude-sonnet-4-5', 'agent'),
    messages: state.messages,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    maxTokens: 4000,
  });

  const newMessages: CoreMessage[] = [];

  if (result.toolCalls && result.toolCalls.length > 0) {
    // Assistant message carries the tool-call parts
    newMessages.push({
      role: 'assistant',
      content: result.toolCalls.map((tc) => ({
        type: 'tool-call' as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
      })),
    });

    return {
      messages: newMessages,
      taskComplete: false,
    };
  }

  // No tool calls → task is complete
  newMessages.push({
    role: 'assistant',
    content: result.text ?? '',
  });

  return {
    messages: newMessages,
    taskComplete: true,
  };
}

async function toolExecutorNode(
  state: AllyAgentStateType
): Promise<Partial<AllyAgentStateType>> {
  const lastMsg = state.messages[state.messages.length - 1];

  if (
    !lastMsg ||
    lastMsg.role !== 'assistant' ||
    !Array.isArray(lastMsg.content)
  ) {
    const errMsg = 'tool_executor: no tool-call parts found in last message';
    return {
      lastToolError: errMsg,
      stepCount: state.stepCount + 1,
    };
  }

  const toolCallParts = lastMsg.content.filter(
    (p): p is { type: 'tool-call'; toolCallId: string; toolName: string; args: Record<string, unknown> } =>
      p.type === 'tool-call'
  );

  const results: ToolCallResult[] = [];
  let lastError: string | null = null;

  for (const tc of toolCallParts) {
    try {
      const raw = await executeToolWithServices(tc.toolName, tc.args);
      const resultStr =
        typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
      results.push({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        result: resultStr,
        isError: false,
      });
    } catch (err) {
      const errorStr = err instanceof Error ? err.message : String(err);
      lastError = errorStr;
      results.push({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        result: `ERROR: ${errorStr}`,
        isError: true,
      });
    }
  }

  // Append a ToolMessage so the model sees the actual results on the next call
  const toolMessage: CoreMessage = {
    role: 'tool',
    content: results.map((r) => ({
      type: 'tool-result' as const,
      toolCallId: r.toolCallId,
      toolName: r.toolName,
      result: r.result,
      isError: r.isError,
    })),
  };

  return {
    messages: [toolMessage],
    toolCallResults: results,
    stepCount: state.stepCount + 1,
    lastToolError: lastError,
  };
}

function resultVerifierNode(
  state: AllyAgentStateType
): Partial<AllyAgentStateType> {
  if (state.stepCount >= MAX_STEPS) {
    const summary = state.toolCallResults
      .map((r) => `- ${r.toolName}: ${r.isError ? `FAILED — ${r.result}` : 'OK'}`)
      .join('\n');

    return {
      messages: [
        {
          role: 'assistant',
          content: `Maximum steps reached (${MAX_STEPS}). Here is what was completed:\n${summary}`,
        },
      ],
      taskComplete: true,
    };
  }

  return {};
}

// ---------------------------------------------------------------------------
// Edge conditions
// ---------------------------------------------------------------------------

function routeAfterPlanner(
  state: AllyAgentStateType
): 'tool_executor' | typeof END {
  if (state.taskComplete) return END;

  const lastMsg = state.messages[state.messages.length - 1];
  if (
    lastMsg?.role === 'assistant' &&
    Array.isArray(lastMsg.content) &&
    lastMsg.content.some((p) => p.type === 'tool-call')
  ) {
    return 'tool_executor';
  }

  return END;
}

function routeAfterVerifier(
  state: AllyAgentStateType
): 'planner' | typeof END {
  if (state.taskComplete || state.stepCount >= MAX_STEPS) return END;
  return 'planner';
}

// ---------------------------------------------------------------------------
// Graph compilation
// ---------------------------------------------------------------------------

const graph = new StateGraph(AllyAgentState)
  .addNode('planner', plannerNode)
  .addNode('tool_executor', toolExecutorNode)
  .addNode('result_verifier', resultVerifierNode)
  .addEdge(START, 'planner')
  .addConditionalEdges('planner', routeAfterPlanner)
  .addEdge('tool_executor', 'result_verifier')
  .addConditionalEdges('result_verifier', routeAfterVerifier)
  .compile();

export const agenticGraph = graph;

// ---------------------------------------------------------------------------
// Message conversion helpers (used by agenticToolService wrapper)
// ---------------------------------------------------------------------------

import type { Message } from '../types/chat';

/**
 * Convert internal Message[] + new userMessage to CoreMessage[] for the graph.
 */
export function toCoreMsgs(
  history: Message[],
  userMessage: string
): CoreMessage[] {
  const msgs: CoreMessage[] = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content ?? '',
    }));

  msgs.push({ role: 'user', content: userMessage });
  return msgs;
}

/**
 * Extract the final text response from the completed graph state messages.
 */
export function extractFinalResponse(messages: CoreMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') return msg.content;
      if (Array.isArray(msg.content)) {
        const textParts = msg.content
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text)
          .join('');
        if (textParts) return textParts;
      }
    }
  }
  return 'Task completed.';
}
