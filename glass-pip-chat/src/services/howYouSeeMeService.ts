/**
 * HowYouSeeMe MCP Service
 *
 * HTTP client for the HowYouSeeMe MCP server (streamable-http transport).
 * Handles the MCP session handshake automatically — initialize once, reuse session ID.
 *
 * Server: http://localhost:8090/mcp
 */

const MCP_URL = 'http://localhost:8090/mcp';
const TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// Session management — initialize once, reuse session ID
// ---------------------------------------------------------------------------

let _sessionId: string | null = null;
let _initPromise: Promise<string> | null = null;
let _msgId = 1;

async function _fetcher(url: string, opts: any): Promise<any> {
  const fn =
    typeof window !== 'undefined' && (window as any).pip?.system?.fetchUrl
      ? (u: string, o: any) => (window as any).pip.system.fetchUrl(u, o)
      : null;
  if (!fn) throw new Error('fetchUrl not available');
  return fn(url, opts);
}

async function _initSession(): Promise<string> {
  const result = await Promise.race([
    _fetcher(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: _msgId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'ally', version: '1.0' },
        },
      }),
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('MCP initialize timeout')), TIMEOUT_MS)
    ),
  ]);

  if (!result.success) throw new Error(`MCP initialize failed: HTTP ${result.status}`);

  // Session ID is in the response headers
  const sessionId =
    result.headers?.['mcp-session-id'] ||
    result.headers?.['Mcp-Session-Id'] ||
    result.headers?.['MCP-Session-Id'];

  if (!sessionId) throw new Error('MCP server did not return a session ID');
  return sessionId;
}

async function _getSession(): Promise<string> {
  if (_sessionId) return _sessionId;
  if (_initPromise) return _initPromise;

  _initPromise = _initSession().then((id) => {
    _sessionId = id;
    _initPromise = null;
    return id;
  }).catch((err) => {
    _initPromise = null;
    throw err;
  });

  return _initPromise;
}

/** Force a new session (call if server restarts) */
export function resetSession(): void {
  _sessionId = null;
  _initPromise = null;
}

// ---------------------------------------------------------------------------
// Low-level JSON-RPC over HTTP with session
// ---------------------------------------------------------------------------

async function rpc(method: string, params: Record<string, unknown> = {}): Promise<any> {
  const sessionId = await _getSession();

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: _msgId++,
    method,
    params,
  });

  const result = await Promise.race([
    _fetcher(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
      },
      body,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('HowYouSeeMe MCP timeout')), TIMEOUT_MS)
    ),
  ]);

  if (!result.success) {
    // Session may have expired — reset and let caller retry
    if (result.status === 400) {
      resetSession();
    }
    throw new Error(`HTTP error: ${result.status}`);
  }

  // FastMCP returns SSE-framed JSON: "event: message\ndata: {...}\n\n"
  const raw: string = result.body || '';
  const jsonLine = raw
    .split('\n')
    .map((l: string) => l.replace(/^data:\s*/, '').trim())
    .find((l: string) => l.startsWith('{'));

  if (!jsonLine) throw new Error('Empty response from MCP server');

  const parsed = JSON.parse(jsonLine);
  if (parsed.error) throw new Error(parsed.error.message || 'MCP error');
  return parsed.result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RobotStatus {
  summary: string;
  available: boolean;
}

export interface WorldState {
  robot?: { position: number[]; orientation: number[] };
  objects?: Record<string, any>;
  people?: Record<string, any>;
  named_memories?: Record<string, any>;
  recent_events?: any[];
}

/** Check if the MCP server is reachable and initialize session */
export async function pingHowYouSeeMe(): Promise<boolean> {
  try {
    // Only reset if we don't have a session yet
    if (!_sessionId) resetSession();
    await _getSession();
    return true;
  } catch {
    return false;
  }
}

/** Get a natural language status summary */
export async function getRobotStatus(): Promise<RobotStatus> {
  try {
    const result = await rpc('tools/call', { name: 'get_robot_status', arguments: {} });
    const text = result?.content?.[0]?.text ?? result?.content ?? String(result);
    return { summary: text, available: true };
  } catch (e: any) {
    return { summary: `HowYouSeeMe offline: ${e.message}`, available: false };
  }
}

/** Get the full world state JSON */
export async function queryWorld(filter = ''): Promise<WorldState | null> {
  try {
    const result = await rpc('tools/call', { name: 'query_world', arguments: { filter } });
    const text = result?.content?.[0]?.text ?? result?.content ?? '{}';
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Find where a labelled object is */
export async function whereIs(label: string): Promise<string> {
  try {
    const result = await rpc('tools/call', { name: 'where_is', arguments: { label } });
    return result?.content?.[0]?.text ?? result?.content ?? '{}';
  } catch (e: any) {
    return JSON.stringify({ found: false, error: e.message });
  }
}

/** Get recent perception events */
export async function getRecentEvents(limit = 10): Promise<string> {
  try {
    const result = await rpc('tools/call', { name: 'get_recent_events', arguments: { limit } });
    return result?.content?.[0]?.text ?? result?.content ?? '[]';
  } catch (e: any) {
    return JSON.stringify({ error: e.message });
  }
}

/** Get the robot context block (for system prompt injection) */
export async function getRobotContext(): Promise<string | null> {
  try {
    const result = await rpc('tools/call', { name: 'get_robot_context', arguments: {} });
    return result?.content?.[0]?.text ?? result?.content ?? null;
  } catch {
    return null;
  }
}

/** Remember an object by name */
export async function rememberObject(name: string, label: string): Promise<string> {
  try {
    const result = await rpc('tools/call', { name: 'remember_object', arguments: { name, label } });
    return result?.content?.[0]?.text ?? result?.content ?? '{}';
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e.message });
  }
}

/** Recall a named memory */
export async function recallMemory(name: string): Promise<string> {
  try {
    const result = await rpc('tools/call', { name: 'recall_memory', arguments: { name } });
    return result?.content?.[0]?.text ?? result?.content ?? '{}';
  } catch (e: any) {
    return JSON.stringify({ found: false, error: e.message });
  }
}

/**
 * Generic tool executor — used by the tool-calling loop in GlassChatPiP
 * when robot mode is active.
 */
export async function executeRobotTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  try {
    const result = await rpc('tools/call', { name: toolName, arguments: args });
    return result?.content?.[0]?.text ?? result?.content ?? JSON.stringify(result);
  } catch (e: any) {
    // If session expired mid-conversation, reset and retry once
    if (e.message?.includes('400') || e.message?.includes('session')) {
      resetSession();
      try {
        const result = await rpc('tools/call', { name: toolName, arguments: args });
        return result?.content?.[0]?.text ?? result?.content ?? JSON.stringify(result);
      } catch (e2: any) {
        return JSON.stringify({ error: e2.message });
      }
    }
    return JSON.stringify({ error: e.message });
  }
}
