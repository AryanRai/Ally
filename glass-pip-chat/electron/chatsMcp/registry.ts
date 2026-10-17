// Shared, dependency-free state for the ally-chats MCP server, so the agent
// runner can ask "which MCP servers does this run get?" without importing the
// server (which itself starts agent runs).

export const SERVER_NAME = 'ally_chats';

let endpoint: { port: number; token: string } | null = null;
/** Chats currently answering a forwarded message ("provider:id"): loop guard. */
export const forwarding = new Set<string>();

export function setEndpoint(e: { port: number; token: string } | null): void {
  endpoint = e;
}

export function isListening(): boolean {
  return !!endpoint;
}

export function serverUrl(caller?: string): string {
  if (!endpoint) return '';
  const base = `http://127.0.0.1:${endpoint.port}/mcp/${endpoint.token}`;
  return caller ? `${base}?caller=${encodeURIComponent(caller)}` : base;
}

/**
 * MCP servers to hand an agent run: ally_chats, carrying the calling chat's
 * identity, except for throwaway runs and turns that are answering a forward.
 */
export function allyChatsMcpServers(opts: { provider: string; sessionId?: string; ephemeral?: boolean }): Record<string, string> {
  if (!endpoint || opts.ephemeral) return {};
  if (opts.sessionId && forwarding.has(`${opts.provider}:${opts.sessionId}`)) return {};
  return { [SERVER_NAME]: serverUrl(opts.sessionId ? `${opts.provider}:${opts.sessionId}` : undefined) };
}
