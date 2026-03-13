/**
 * Context window compressor for the agentic planner loop.
 *
 * Long agentic tasks accumulate many ToolMessages which can:
 *  1. Exceed the model's context window.
 *  2. Dilute the model's attention so later steps degrade in quality.
 *
 * This compressor runs before every planner LLM call.  It does NOT call the
 * LLM to summarise — it produces inline single-line summaries from the
 * existing result strings, keeping latency at zero.
 *
 * Compression rules:
 *  1. Always keep: the original user task (first 'user' message), the last 6
 *     messages, and any message whose string content contains '<done>' or
 *     starts with 'ERROR'.
 *  2. Middle tool-result messages are replaced with a compact summary line.
 *  3. Never compress below 4 messages total.
 */

import type { CoreMessage } from 'ai';

export interface CompressionResult {
  messages: CoreMessage[];
  wasCompressed: boolean;
  droppedSteps: number;
}

/** How many of the most recent messages to always keep verbatim. */
const KEEP_TAIL = 6;

/** Minimum message count — never compress below this. */
const MIN_MESSAGES = 4;

/** Maximum character length for a single-line tool result summary. */
const MAX_SUMMARY_LENGTH = 120;

/**
 * Truncate a string to `MAX_SUMMARY_LENGTH` characters, appending an ellipsis
 * if the string was shortened.
 */
function truncateSummary(text: string): string {
  return text.length > MAX_SUMMARY_LENGTH
    ? `${text.slice(0, MAX_SUMMARY_LENGTH - 1)}…`
    : text;
}

/**
 * Extract a one-line summary from a tool-result message content.
 * The content may be a string or an array of tool-result parts.
 */
function summariseToolResult(msg: CoreMessage, stepIndex: number): CoreMessage {
  let toolName = 'tool';
  let summary = '';

  if (Array.isArray(msg.content)) {
    const part = msg.content[0] as {
      type?: string;
      toolName?: string;
      result?: unknown;
      isError?: boolean;
    } | undefined;

    if (part) {
      toolName = part.toolName ?? 'tool';
      const resultText =
        typeof part.result === 'string'
          ? part.result
          : JSON.stringify(part.result ?? '');

      summary = truncateSummary(resultText.split('\n')[0].trim());
      if (part.isError) {
        summary = `ERROR — ${summary}`;
      }
    }
  } else if (typeof msg.content === 'string') {
    summary = truncateSummary(msg.content.split('\n')[0].trim());
  }

  return {
    role: 'tool' as const,
    content: `[Step ${stepIndex} tool result — ${toolName}: ${summary}]`,
  };
}

/**
 * Return true if the message is important enough that it must be kept verbatim
 * regardless of its position in the window.
 */
function isProtected(msg: CoreMessage): boolean {
  const text =
    typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content ?? '');

  return text.includes('<done>') || /^ERROR/i.test(text.trim());
}

/**
 * Compress the message history before passing it to the planner LLM.
 *
 * @param messages  Full message list from AgentState.
 * @param maxMessages  Target maximum after compression (default 20).
 *                     Kept as a guide; hard rules above take precedence.
 */
export async function compressContext(
  messages: CoreMessage[],
  maxMessages: number = 20
): Promise<CompressionResult> {
  // Nothing to compress if already within bounds.
  if (messages.length <= maxMessages || messages.length <= MIN_MESSAGES) {
    return { messages, wasCompressed: false, droppedSteps: 0 };
  }

  // Indices that must always be kept verbatim.
  const tailStart = Math.max(0, messages.length - KEEP_TAIL);

  // First 'user' message index (original task).
  const firstUserIdx = messages.findIndex((m) => m.role === 'user');

  const compressed: CoreMessage[] = [];
  let droppedSteps = 0;

  messages.forEach((msg, idx) => {
    const inTail = idx >= tailStart;
    const isFirstUser = idx === firstUserIdx;
    const protect = isProtected(msg);

    if (isFirstUser || inTail || protect) {
      compressed.push(msg);
      return;
    }

    // Compress middle tool-result messages; skip middle assistant tool-call
    // messages to avoid orphaned tool results — replace with summary too.
    if (msg.role === 'tool') {
      compressed.push(summariseToolResult(msg, idx));
      droppedSteps++;
    } else if (
      msg.role === 'assistant' &&
      Array.isArray(msg.content) &&
      msg.content.some((p: { type?: string }) => p.type === 'tool-call')
    ) {
      // Summarise the tool-call message so it stays aligned with its result
      const calls = (
        msg.content as Array<{ type?: string; toolName?: string }>
      )
        .filter((p) => p.type === 'tool-call')
        .map((p) => p.toolName ?? 'unknown')
        .join(', ');

      compressed.push({
        role: 'assistant',
        content: `[Step ${idx} — called tools: ${calls}]`,
      });
      droppedSteps++;
    } else {
      compressed.push(msg);
    }
  });

  // Safety: never go below MIN_MESSAGES
  const result =
    compressed.length < MIN_MESSAGES ? messages.slice(-MIN_MESSAGES) : compressed;

  return {
    messages: result,
    wasCompressed: droppedSteps > 0,
    droppedSteps,
  };
}
