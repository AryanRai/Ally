/**
 * PTC Executor — Programmatic Tool Calling (client-side JS sandbox)
 *
 * Inspired by https://github.com/Chen-zexi/open-ptc-agent
 *
 * Instead of N LLM round-trips (one per tool call), the LLM writes a JS script
 * that calls all tools, we execute in a sandboxed AsyncFunction, only stdout
 * goes back to the LLM for summarization.
 *
 * Flow:
 *   1. LLM call 1 — given tools list + user query → writes a JS script
 *   2. Execute script in sandbox:
 *      • tool calls happen here (N calls, no LLM)
 *      • stdout captured via print()
 *   3. LLM call 2 — given stdout → writes natural language answer
 *
 * Benefits vs round-trip agentic loop:
 *   • N tools = 2 LLM calls instead of N+1
 *   • Intermediate results never bloat context window
 *   • Loops, conditionals, early termination free
 *
 * Sandbox security:
 *   • No require, no fetch, no fs, no global
 *   • Only injected tool stubs + print()
 *   • Tool call count capped at MAX_TOOL_CALLS
 *   • Execution timeout via Promise.race
 */

export interface PTCTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface PTCToolCallLog {
  tool: string;
  params: unknown;
  result: unknown;
  error?: string;
}

export interface PTCExecutionResult {
  stdout: string;
  stderr: string;
  success: boolean;
  toolCallLog: PTCToolCallLog[];
  executionTimeMs: number;
}

export interface PTCStreamCallbacks {
  /** Called once the LLM script has been extracted */
  onScriptGenerated?: (script: string) => void;
  /** Called each time a tool is invoked inside the script */
  onToolCall?: (tool: string, params: unknown) => void;
  /** Called each time a tool returns a result */
  onToolResult?: (tool: string, result: unknown) => void;
  /** Called for each print() line captured */
  onStdout?: (line: string) => void;
  /** Called with each summary chunk from LLM call 2 */
  onSummaryChunk?: (chunk: string) => void;
}

/** Max stdout chars passed to LLM for summarization */
const MAX_STDOUT_CHARS = 8000;
/** Max total tool calls in one script execution */
const MAX_TOOL_CALLS = 30;
/** Timeout for script execution in ms */
const SCRIPT_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

/**
 * System prompt for LLM call 1: instructs the LLM to write a JS script.
 * The script body uses await tool_name(params) and print() to capture output.
 */
export function buildPTCScriptPrompt(
  tools: PTCTool[],
  userQuery: string,
  platform = 'Windows',
  priorContext?: string
): string {
  const toolDocs = tools
    .map((t) => {
      const paramsDoc =
        t.parameters && Object.keys(t.parameters).length > 0
          ? `\n  params: ${JSON.stringify(t.parameters, null, 2)}`
          : '';
      return `• ${t.name}${paramsDoc}\n  → ${t.description}`;
    })
    .join('\n');

  const pathNote =
    platform === 'Windows'
      ? 'Use Windows paths: C:\\\\Users\\\\... not ~/...'
      : 'Use Unix paths: ~/... or /home/...';

  const contextSection = priorContext
    ? `\nPRIOR CONTEXT (from previous assistant response — use this if the user is following up):\n${priorContext.slice(0, 2000)}\n`
    : '';

  return `You are a JavaScript script writer. Your ONLY job is to write a JavaScript script body.

⚠️ CRITICAL: Do NOT use XML tags, do NOT use <tool_use> blocks, do NOT use any tool-calling format.
⚠️ CRITICAL: Output ONLY a \`\`\`javascript code block. Nothing else. No explanation before or after.
⚠️ CRITICAL: The script uses await calls and print() — NOT XML, NOT JSON tool calls, NOT <tool_use>.

The script will be executed in a sandboxed environment where these async functions are available:
${toolDocs}

RULES:
1. All tool calls MUST use await: \`const result = await tool_name({param: value})\`
2. Use \`print(value)\` to output results — this is the ONLY way to return data
3. print() accepts any value (strings, objects, arrays — all serialized automatically)
4. Write ONLY the script body — no function declarations, no imports, no module syntax
5. ${pathNote}
6. Handle errors gracefully with try/catch if a step might fail
7. Be efficient — call only the tools you need, in the right order
8. ⚠️ Tool results are ALWAYS strings or objects — NEVER raw numbers. To do math on a tool result:
   - If it's a string like "7.63", use parseFloat(result) first
   - If it's an object, access the right property: result.value, result.result, etc.
   - NEVER call .toFixed() or math operators directly on a tool result without parsing first
9. If the user says "now convert to X" or refers to a previous result, use the PRIOR CONTEXT above to get the value
${contextSection}
USER QUERY: ${userQuery}

EXAMPLES:

Query: "what files are on my desktop?"
\`\`\`javascript
const files = await list_directory({path: "C:\\\\Users\\\\user\\\\Desktop"});
print(files);
\`\`\`

Query: "what's the weather like?"
\`\`\`javascript
const weather = await fetch_url({url: "https://wttr.in/?format=3"});
print(weather.body);
\`\`\`

Query: "convert 10 AUD to INR"
\`\`\`javascript
const rates = await fetch_url({url: "https://api.exchangerate-api.com/v4/latest/AUD"});
const data = JSON.parse(rates.body);
const inr = 10 * data.rates.INR;
print("10 AUD = " + inr.toFixed(2) + " INR");
\`\`\`

Query: "now convert that to USD" (with prior context showing 645.10 INR)
\`\`\`javascript
// From prior context: 10 AUD = 645.10 INR
const rates = await fetch_url({url: "https://api.exchangerate-api.com/v4/latest/INR"});
const data = JSON.parse(rates.body);
const usd = 645.10 * data.rates.USD;
print("645.10 INR = " + usd.toFixed(2) + " USD");
\`\`\`

Query: "calculate 645.10 / 84.50 and show result"
\`\`\`javascript
// Use fetch_url for exchange rates, or calculate tool for math
const res = await calculate({expression: "645.10 / 84.50"});
// Tool result is a string or object — parse it
const num = typeof res === 'object' ? (res.result ?? res) : parseFloat(String(res));
print("645.10 / 84.50 = " + num.toFixed(4));
\`\`\`

Query: "open youtube and play veritasiums most popular video"
\`\`\`javascript
const result = await execute_command({command: "start https://www.youtube.com/@veritasium/videos?sort=p"});
print("Opened YouTube Veritasium channel sorted by popularity");
print(result);
\`\`\`

Now write the script. Output ONLY a \`\`\`javascript code block:`;
}

/**
 * Prompt for LLM call 2: summarize script stdout into a natural language answer.
 */
export function buildPTCSummaryPrompt(
  userQuery: string,
  stdout: string,
  stderr: string,
  toolCallLog: PTCToolCallLog[]
): string {
  const outputSection = stdout.trim()
    ? `TOOL OUTPUT:\n${stdout.slice(0, MAX_STDOUT_CHARS)}`
    : '(no output from tools)';

  const errorSection = stderr.trim()
    ? `\nERRORS:\n${stderr.slice(0, 2000)}`
    : '';

  return `You are a helpful assistant. Answer the user's question directly using the tool output below.

USER QUESTION: ${userQuery}

${outputSection}${errorSection}

RULES:
- Answer in first person, directly and naturally. Do NOT say "the script returned" or "the tool responded".
- Do NOT narrate what happened — just give the answer.
- If the output contains the answer, state it plainly (e.g. "It's 3:45 PM" not "The time tool returned 3:45 PM").
- If there were errors, explain what went wrong simply.
- Be concise.`;
}

// ---------------------------------------------------------------------------
// Script executor
// ---------------------------------------------------------------------------

/**
 * Execute a PTC script in a sandboxed AsyncFunction.
 *
 * The script body has access to:
 *   - await tool_name(params) for each registered tool
 *   - print(value) to capture output
 *   - Standard JS (no require, no fetch, no fs, no global)
 */
export async function executeScript(
  script: string,
  tools: PTCTool[],
  toolExecutor: (toolName: string, params: unknown) => Promise<unknown>,
  callbacks: PTCStreamCallbacks = {}
): Promise<PTCExecutionResult> {
  const startTime = Date.now();
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const toolCallLog: PTCToolCallLog[] = [];
  let toolCallCount = 0;

  // Build tool stubs — each is an async function that calls toolExecutor
  const toolStubs: Record<string, (params?: unknown) => Promise<unknown>> = {};
  for (const tool of tools) {
    const toolName = tool.name; // capture in closure
    toolStubs[toolName] = async (params?: unknown) => {
      if (toolCallCount >= MAX_TOOL_CALLS) {
        throw new Error(`Tool call limit (${MAX_TOOL_CALLS}) exceeded`);
      }
      toolCallCount++;
      callbacks.onToolCall?.(toolName, params);

      try {
        const result = await toolExecutor(toolName, params);
        const serialized = serializeToolResult(result);
        toolCallLog.push({ tool: toolName, params, result: serialized });
        callbacks.onToolResult?.(toolName, serialized);
        return serialized;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        toolCallLog.push({ tool: toolName, params, result: null, error: errMsg });
        callbacks.onToolResult?.(toolName, { error: errMsg });
        throw new Error(`Tool ${toolName} failed: ${errMsg}`);
      }
    };
  }

  // print() stub — captures output
  const printFn = (value: unknown) => {
    const line =
      typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    stdoutLines.push(line);
    callbacks.onStdout?.(line);
  };

  // stderr capture
  const stderrFn = (msg: string) => {
    stderrLines.push(msg);
  };

  // Build argument names and values for the sandboxed function
  const toolNames = tools.map((t) => t.name);
  const toolValues = tools.map((t) => toolStubs[t.name]);

  // Wrap script in try/catch so runtime errors are captured as stderr
  const wrappedScript = `
    try {
      ${script}
    } catch (__ptcErr) {
      __ptcStderr(__ptcErr instanceof Error ? __ptcErr.message : String(__ptcErr));
    }
  `;

  try {
    // Create sandboxed async function
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'print',
      '__ptcStderr',
      ...toolNames,
      `return (async () => { ${wrappedScript} })()`
    );

    // Execute with timeout
    await Promise.race([
      fn(printFn, stderrFn, ...toolValues) as Promise<void>,
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Script timed out after ${SCRIPT_TIMEOUT_MS / 1000}s`)),
          SCRIPT_TIMEOUT_MS
        )
      ),
    ]);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    stderrLines.push(errMsg);
  }

  return {
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n'),
    success: stderrLines.length === 0,
    toolCallLog,
    executionTimeMs: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the raw script body from an LLM response.
 * Handles ```javascript, ```js, and generic ``` code fences.
 * Also strips <think> blocks.
 */
export function extractScriptFromResponse(response: string): string | null {
  // Strip thinking blocks
  const clean = response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // If the model output XML tool_use blocks instead of a script, bail out
  if (clean.includes('<tool_use>') || clean.includes('<tool_name>')) {
    console.warn('[PTC] LLM output XML tool_use instead of a JS script — falling back');
    return null;
  }

  // Try ```javascript or ```js fence
  const jsFence = clean.match(/```(?:javascript|js)\s*\n([\s\S]*?)```/);
  if (jsFence) return jsFence[1].trim();

  // Try generic ``` fence
  const genericFence = clean.match(/```\s*\n([\s\S]*?)```/);
  if (genericFence) return genericFence[1].trim();

  // If it looks like raw JS (has keywords like await or print), use as-is
  if (clean.includes('await ') || clean.includes('print(')) {
    return clean;
  }

  return null;
}

/**
 * Serialize MCP tool results — unwraps content arrays to plain text.
 * Also handles built-in tool result shapes for readable stdout.
 */
export function serializeToolResult(result: unknown): unknown {
  if (result === null || result === undefined) return null;

  // MCP content array format: [{ type: 'text', text: '...' }]
  if (Array.isArray(result)) {
    const textParts = (result as Array<{ type: string; text: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text);
    if (textParts.length > 0) return textParts.join('\n');
  }

  if (typeof result === 'object' && result !== null) {
    const r = result as Record<string, unknown>;

    // MCP content wrapper: { content: [{ type: 'text', text: '...' }] }
    if (Array.isArray(r.content)) {
      const textParts = (r.content as Array<{ type: string; text: string }>)
        .filter((c) => c.type === 'text')
        .map((c) => c.text);
      if (textParts.length > 0) return textParts.join('\n');
    }

    // Built-in: get_current_time → { formatted, timezone }
    if (r.formatted && r.timezone) return `${r.formatted} (${r.timezone})`;

    // Built-in: calculate → { expression, result }
    if (r.expression !== undefined && r.result !== undefined)
      return `${r.expression} = ${r.result}`;

    // Built-in: execute_command → { stdout, stderr, success }
    if (r.stdout !== undefined) {
      const out = String(r.stdout).trim();
      const err = String(r.stderr || '').trim();
      if (out) return err ? `${out}\n${err}` : out;
      if (err) return err;
      return r.success ? 'Command completed successfully.' : `Command failed.`;
    }

    // fetch_url → { body, status }
    if (r.body !== undefined) return String(r.body);

    // Error shape
    if (r.error) return `Error: ${r.error}`;
  }

  return result;
}
