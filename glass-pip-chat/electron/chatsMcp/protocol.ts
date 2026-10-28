// Minimal MCP server protocol (JSON-RPC 2.0 over Streamable HTTP, JSON responses).
// Just what Claude Code and Codex use for tools: initialize, tools/list,
// tools/call, ping. Pure, so it can be tested without a socket.

export const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const SERVER_INFO = { name: 'ally-chats', version: '1.0.0' };

export interface ToolResult {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: 'image/png' | 'image/jpeg'; text?: never }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean; title?: string };
  handler: (args: Record<string, unknown>, ctx: CallContext) => Promise<ToolResult>;
}

export interface CallContext {
  /** "provider:id" of the chat whose agent is calling, when Ally knows it */
  caller?: string;
  signal?: AbortSignal;
}

type JsonRpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

export const text = (t: string, structured?: Record<string, unknown>): ToolResult => ({ content: [{ type: 'text', text: t }], ...(structured ? { structuredContent: structured } : {}) });
export const fail = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }], isError: true });

const error = (id: JsonRpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** Shared provider boundary: Claude accepts nested unions, but never root unions. */
export function assertToolSchema(tool: Pick<ToolDef, 'name' | 'inputSchema'>): void {
  const schema = tool.inputSchema;
  if (!schema || schema.type !== 'object' || ['oneOf', 'allOf', 'anyOf'].some(key => key in schema)) {
    throw new Error(`Tool ${tool.name} must expose an object inputSchema without top-level oneOf, allOf or anyOf.`);
  }
}

/** Handle one JSON-RPC message. Returns null for notifications (HTTP 202, no body). */
export async function handleRpc(msg: JsonRpc, tools: () => ToolDef[], ctx: CallContext, instructions?: string): Promise<object | null> {
  if (!msg || typeof msg !== 'object' || typeof msg.method !== 'string') return error(msg?.id, -32600, 'Invalid request');
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null;
  const id = msg.id;
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          ...(instructions ? { instructions } : {}),
        },
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list': {
      const listing = tools();
      try { listing.forEach(assertToolSchema); }
      catch (e) { return error(id, -32603, e instanceof Error ? e.message : String(e)); }
      return { jsonrpc: '2.0', id, result: { tools: listing.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, ...(annotations ? { annotations } : {}) })) } };
    }
    case 'tools/call': {
      const tool = tools().find(t => t.name === msg.params?.name);
      if (!tool) return error(id, -32602, `Unknown tool: ${msg.params?.name}`);
      try {
        return { jsonrpc: '2.0', id, result: await tool.handler(msg.params?.arguments ?? {}, ctx) };
      } catch (e) {
        // Tool failures are results the model can read, not protocol errors
        return { jsonrpc: '2.0', id, result: fail(e instanceof Error ? e.message : String(e)) };
      }
    }
    default:
      return error(id, -32601, `Method not found: ${msg.method}`);
  }
}
