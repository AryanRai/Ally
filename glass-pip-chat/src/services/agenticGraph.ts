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
 * Phase 2 additions (Cursor-style ReAct loop):
 *  - Parallel tool dispatch via Promise.allSettled for independent tool calls.
 *  - Context window compression before every planner call (contextCompressor.ts).
 *  - Explicit <done> termination signal checked in routeAfterPlanner.
 *  - Typed error classification with recovery instructions (errorRecovery.ts).
 *  - Hard-stop routing for permission_denied and mcp_server_unavailable errors.
 *
 * Topology:
 *   START → planner → tool_executor → result_verifier → (planner | END)
 *                ↓
 *              END (when model emits <done> or text with no tool calls)
 */

import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { generateText, jsonSchema, tool as aiTool, type CoreMessage } from 'ai';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { getModel } from './providers';
import { getMCPIntegrationService } from './mcpIntegrationService';
import { classifyToolError, HARD_STOP_ERRORS, type ErrorClass } from './errorRecovery';
import { compressContext } from './contextCompressor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCallResult {
  toolCallId: string;
  toolName: string;
  result: string;
  isError: boolean;
  /** Populated when isError is true. */
  errorClass?: ErrorClass;
  /** True if this tool fired as part of a parallel batch. */
  isParallel?: boolean;
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

/**
 * System prompt for the planner LLM.
 * Includes the <done> termination instruction required for Change 3.
 */
const PLANNER_SYSTEM_PROMPT = `You are an AI assistant (Ally) with access to tools. Use them when needed.

RULES:
1. Use tools to gather information or perform actions when required.
2. After receiving tool results, analyse them and decide if more tools are needed.
3. When the task is fully complete and no more tool calls are needed, output your final response followed by exactly: <done>
4. Do not output <done> if there are remaining steps, errors to handle, or tool calls to make.
5. If a tool failed and you cannot complete the task, explain what failed and output <done>.
6. Never invent tool results — only use what was actually returned.`;

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

        // LangChain StructuredTool exposes a `.schema` Zod schema that is not
        // typed in the public interface but is always present at runtime.
        // We use a narrowing cast via an intermediate `unknown` rather than
        // a direct `any` cast to make the assertion explicit.
        const schema = (lcTool as unknown as { schema: Parameters<typeof aiTool>[0]['parameters'] }).schema;

        toolSet[lcTool.name] = aiTool({
          description: lcTool.description ?? lcTool.name,
          parameters: schema,
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

/**
 * Determine whether two tool calls are independent (safe to run in parallel).
 *
 * A call is considered dependent if its serialised args string contains a
 * reference to another call's toolCallId — a common pattern used by models
 * that chain outputs explicitly.
 */
function argsReferenceAnyId(
  args: Record<string, unknown>,
  ids: string[]
): boolean {
  const serialised = JSON.stringify(args);
  return ids.some((id) => serialised.includes(id));
}

// ---------------------------------------------------------------------------
// Graph nodes
// ---------------------------------------------------------------------------

async function plannerNode(
  state: AllyAgentStateType
): Promise<Partial<AllyAgentStateType>> {
  const tools = await buildToolSet();

  // Phase 2 — Change 2: compress context before every LLM call
  const { messages: compressedMessages, wasCompressed, droppedSteps } =
    await compressContext(state.messages);

  const systemSuffix = wasCompressed
    ? `\n\n[Note: ${droppedSteps} earlier tool results were summarised to save context. Full results available in conversation history.]`
    : '';

  const result = await generateText({
    model: getModel('openrouter', 'anthropic/claude-sonnet-4-5', 'agent'),
    system: PLANNER_SYSTEM_PROMPT + systemSuffix,
    messages: compressedMessages,
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

  // No tool calls → check for explicit <done> or treat as complete
  const responseText = result.text ?? '';
  newMessages.push({
    role: 'assistant',
    content: responseText,
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

  // ----- Phase 2 — Change 1: parallel dispatch --------------------------------
  // Identify independent vs dependent calls.
  // A call is dependent if its args reference a prior call's ID in the same batch.
  const priorIds: string[] = [];
  const independent: typeof toolCallParts = [];
  const dependent: typeof toolCallParts = [];

  for (const tc of toolCallParts) {
    if (argsReferenceAnyId(tc.args, priorIds)) {
      dependent.push(tc);
    } else {
      independent.push(tc);
    }
    priorIds.push(tc.toolCallId);
  }

  const isParallelBatch = independent.length > 1;

  // Execute independent calls in parallel
  const settled = await Promise.allSettled(
    independent.map(async (tc) => {
      const raw = await executeToolWithServices(tc.toolName, tc.args);
      const resultStr =
        typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
      return { tc, resultStr, success: true as const };
    })
  );

  const results: ToolCallResult[] = [];
  let lastError: string | null = null;

  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    const tc = independent[i];
    if (s.status === 'fulfilled') {
      results.push({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        result: s.value.resultStr,
        isError: false,
        isParallel: isParallelBatch,
      });
    } else {
      const errorStr =
        s.reason instanceof Error ? s.reason.message : String(s.reason);
      const classified = classifyToolError(errorStr, tc.toolName);
      lastError = classified.class;
      results.push({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        result: `ERROR [${classified.class}]: ${classified.originalError}\n\nRECOVERY: ${classified.recoveryInstruction}`,
        isError: true,
        errorClass: classified.class,
        isParallel: isParallelBatch,
      });
    }
  }

  // Execute dependent calls sequentially after the parallel batch
  for (const tc of dependent) {
    try {
      const raw = await executeToolWithServices(tc.toolName, tc.args);
      const resultStr =
        typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
      results.push({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        result: resultStr,
        isError: false,
        isParallel: false,
      });
    } catch (err) {
      const errorStr = err instanceof Error ? err.message : String(err);
      const classified = classifyToolError(errorStr, tc.toolName);
      // Later errors override lastError (last write wins)
      lastError = classified.class;
      results.push({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        result: `ERROR [${classified.class}]: ${classified.originalError}\n\nRECOVERY: ${classified.recoveryInstruction}`,
        isError: true,
        errorClass: classified.class,
        isParallel: false,
      });
    }
  }
  // ---------------------------------------------------------------------------

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
    // lastError holds the ErrorClass string so result_verifier can route
    // based on error type (e.g. hard-stop for permission_denied).
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
  const lastMsg = state.messages[state.messages.length - 1];
  const content =
    lastMsg && typeof lastMsg.content === 'string' ? lastMsg.content : '';

  // Phase 2 — Change 3: check for explicit <done> termination signal first
  if (content.includes('<done>')) {
    return END;
  }

  // Check for tool calls in the last assistant message
  if (
    lastMsg?.role === 'assistant' &&
    Array.isArray(lastMsg.content) &&
    lastMsg.content.some((p: { type?: string }) => p.type === 'tool-call')
  ) {
    return 'tool_executor';
  }

  // taskComplete flag set by planner when no tool calls were emitted
  if (state.taskComplete) return END;

  // No tool calls and no <done> — force END to prevent drift
  return END;
}

function routeAfterVerifier(
  state: AllyAgentStateType
): 'planner' | typeof END {
  if (state.taskComplete || state.stepCount >= MAX_STEPS) return END;

  // Phase 2 — Change 4: hard-stop for specific error classes
  if (
    state.lastToolError &&
    HARD_STOP_ERRORS.includes(state.lastToolError as ErrorClass)
  ) {
    return END;
  }

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
 * Strips any <done> signal before returning.
 */
export function extractFinalResponse(messages: CoreMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        return msg.content.replace(/<done>/g, '').trim();
      }
      if (Array.isArray(msg.content)) {
        const textParts = msg.content
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text)
          .join('');
        if (textParts) return textParts.replace(/<done>/g, '').trim();
      }
    }
  }
  return 'Task completed.';
}
