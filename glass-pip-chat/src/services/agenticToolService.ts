/**
 * Agentic Tool Service
 * 
 * Implements an agentic loop that allows the AI to use multiple tools
 * sequentially until the task is complete. Supports inline tool display
 * with expandable pills between text paragraphs.
 */

// Types imported from ollamaService for reference
// import { ChatMessage } from './ollamaService';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, any>;
}

export interface ToolExecution {
  id: string;
  name: string;
  parameters: any;
  status: 'pending' | 'executing' | 'success' | 'error';
  result?: any;
  error?: string;
  startTime: number;
  endTime?: number;
}

export interface AgenticMessage {
  type: 'text' | 'tool_call' | 'tool_result';
  content: string;
  toolExecution?: ToolExecution;
}

export interface AgenticStreamUpdate {
  type: 'thinking' | 'text' | 'tool_call' | 'tool_result' | 'done';
  content: string;
  thinking?: string;
  toolExecution?: ToolExecution;
  messages: AgenticMessage[];
  isComplete: boolean;
}

export interface AgenticConfig {
  maxIterations: number;
  maxToolCalls: number;
  toolCallTimeout: number;
  enableThinking: boolean;
}

const DEFAULT_CONFIG: AgenticConfig = {
  maxIterations: 10,
  maxToolCalls: 20,
  toolCallTimeout: 30000,
  enableThinking: true,
};

/**
 * Parse tool calls from LLM response
 * Supports multiple formats that LLMs commonly use
 */
export function parseToolCall(text: string): { 
  match: RegExpMatchArray | null; 
  toolCall: { name: string; parameters: any } | null;
  beforeText: string;
  afterText: string;
} {
  // Strip thinking blocks for parsing
  const cleanedText = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  
  // Format 1: JSON with tags - <tool_call>{"name": "...", "parameters": {...}}</tool_call>
  const jsonTagMatch = cleanedText.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/);
  if (jsonTagMatch) {
    try {
      const parsed = JSON.parse(jsonTagMatch[1].trim());
      const idx = cleanedText.indexOf(jsonTagMatch[0]);
      return { 
        match: jsonTagMatch, 
        toolCall: { name: parsed.name, parameters: parsed.parameters || {} },
        beforeText: cleanedText.substring(0, idx).trim(),
        afterText: cleanedText.substring(idx + jsonTagMatch[0].length).trim()
      };
    } catch (e) { /* continue to next format */ }
  }
  
  // Format 2: Function format - <tool_call><function=name>params</function></tool_call>
  const funcMatch = cleanedText.match(/<tool_call>\s*<function=(\w+)>([\s\S]*?)<\/function>\s*<\/tool_call>/);
  if (funcMatch) {
    const name = funcMatch[1];
    let params = {};
    const paramsStr = funcMatch[2].trim();
    if (paramsStr) {
      try {
        params = JSON.parse(paramsStr);
      } catch (e) {
        const pairs = paramsStr.match(/(\w+)=["']?([^"'\s]+)["']?/g);
        if (pairs) {
          pairs.forEach(pair => {
            const [key, value] = pair.split('=');
            (params as any)[key] = value.replace(/["']/g, '');
          });
        }
      }
    }
    const idx = cleanedText.indexOf(funcMatch[0]);
    return { 
      match: funcMatch, 
      toolCall: { name, parameters: params },
      beforeText: cleanedText.substring(0, idx).trim(),
      afterText: cleanedText.substring(idx + funcMatch[0].length).trim()
    };
  }
  
  // Format 3: Raw JSON - {"name": "...", "parameters": ...}
  const rawJsonMatch = cleanedText.match(/\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"parameters"\s*:\s*("[^"]*"|\{[^}]*\}|\[\]|null|\{\})\s*\}/);
  if (rawJsonMatch) {
    try {
      const name = rawJsonMatch[1];
      let params = {};
      const paramsStr = rawJsonMatch[2];
      if (paramsStr && paramsStr !== '""' && paramsStr !== 'null') {
        try {
          params = JSON.parse(paramsStr);
        } catch (e) {
          params = {};
        }
      }
      const idx = cleanedText.indexOf(rawJsonMatch[0]);
      return { 
        match: rawJsonMatch, 
        toolCall: { name, parameters: params },
        beforeText: cleanedText.substring(0, idx).trim(),
        afterText: cleanedText.substring(idx + rawJsonMatch[0].length).trim()
      };
    } catch (e) { /* continue */ }
  }
  
  return { match: null, toolCall: null, beforeText: cleanedText, afterText: '' };
}

/**
 * Extract thinking blocks from response
 */
export function extractThinking(text: string): { 
  thinking: string; 
  isComplete: boolean; 
  rest: string 
} {
  const completeMatch = text.match(/<think>([\s\S]*?)<\/think>/i);
  if (completeMatch) {
    const thinking = completeMatch[1].trim();
    const rest = text.replace(completeMatch[0], '').trim();
    return { thinking, isComplete: true, rest };
  }
  
  const incompleteMatch = text.match(/<think>([\s\S]*)$/i);
  if (incompleteMatch) {
    const thinking = incompleteMatch[1].trim();
    const rest = text.substring(0, incompleteMatch.index).trim();
    return { thinking, isComplete: false, rest };
  }
  
  return { thinking: '', isComplete: false, rest: text };
}

/**
 * Build the system prompt for agentic tool use
 */
export function buildAgenticSystemPrompt(
  tools: ToolDefinition[],
  customPrompt?: string
): string {
  const defaultPrompt = `You are an AI assistant with access to tools. Use tools when needed to complete tasks.

IMPORTANT RULES:
1. When you need information you don't have, USE A TOOL immediately
2. You can use MULTIPLE tools in sequence to complete complex tasks
3. After getting a tool result, analyze it and decide if you need more tools
4. When the task is COMPLETE, respond naturally WITHOUT any tool calls
5. NEVER explain that you're going to use a tool - just use it

TO USE A TOOL, output this JSON format (nothing else on that line):
{"name": "tool_name", "parameters": {"param1": "value1"}}

COMPLETION SIGNAL:
When you have all the information needed and the task is complete, respond with your final answer WITHOUT any tool call JSON.`;

  const toolList = tools.map(t => 
    `- ${t.name}: ${t.description}${t.parameters ? ` (params: ${JSON.stringify(t.parameters)})` : ''}`
  ).join('\n');

  return `${customPrompt || defaultPrompt}

Available tools:
${toolList}`;
}

/**
 * Agentic Tool Service class
 * Manages the agentic loop for multi-tool execution
 */
export class AgenticToolService {
  private config: AgenticConfig;
  private tools: ToolDefinition[] = [];
  private toolExecutor: (name: string, params: any) => Promise<any>;
  
  constructor(
    toolExecutor: (name: string, params: any) => Promise<any>,
    config: Partial<AgenticConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.toolExecutor = toolExecutor;
  }
  
  setTools(tools: ToolDefinition[]) {
    this.tools = tools;
  }
  
  getTools(): ToolDefinition[] {
    return this.tools;
  }
  
  /**
   * Execute a single tool call
   */
  async executeTool(name: string, parameters: any): Promise<ToolExecution> {
    const execution: ToolExecution = {
      id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      parameters,
      status: 'executing',
      startTime: Date.now(),
    };
    
    try {
      const result = await Promise.race([
        this.toolExecutor(name, parameters),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Tool execution timeout')), this.config.toolCallTimeout)
        )
      ]);
      
      execution.status = 'success';
      execution.result = result;
      execution.endTime = Date.now();
    } catch (error) {
      execution.status = 'error';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.endTime = Date.now();
    }
    
    return execution;
  }
  
  /**
   * Format tool result for inclusion in conversation
   */
  formatToolResult(execution: ToolExecution): string {
    if (execution.status === 'error') {
      return `Tool "${execution.name}" failed: ${execution.error}`;
    }
    
    const result = execution.result;
    if (!result) return `Tool "${execution.name}" returned no result`;
    
    // Handle different result formats
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: any) => c.type === 'text');
      if (textContent?.text) return textContent.text;
    }
    if (result.formatted) return result.formatted;
    if (result.result !== undefined) return String(result.result);
    if (typeof result === 'string') return result;
    
    return JSON.stringify(result, null, 2);
  }
  
  /**
   * Check if the response indicates task completion (no more tool calls needed)
   */
  isTaskComplete(response: string): boolean {
    const { toolCall } = parseToolCall(response);
    return toolCall === null;
  }
}

export default AgenticToolService;
