/**
 * Ally Browser Bridge — WebSocket Server (runs in Electron main process)
 *
 * Listens on ws://localhost:9009
 * Chrome extension connects here, registers itself.
 * Tool calls from Ally are forwarded to the extension and results returned.
 */

import { WebSocketServer, WebSocket } from 'ws';

const PORT = 9009;

export interface BrowserToolResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

type PendingResolve = (result: BrowserToolResult) => void;

let wss: WebSocketServer | null = null;
let extensionSocket: WebSocket | null = null;
let pendingCalls = new Map<string, PendingResolve>();
let callIdCounter = 0;

export function startBrowserBridgeServer() {
  if (wss) return; // already running

  wss = new WebSocketServer({ port: PORT });

  wss.on('listening', () => {
    console.log(`[BrowserBridge] WebSocket server listening on ws://localhost:${PORT}`);
  });

  wss.on('connection', (socket) => {
    console.log('[BrowserBridge] Client connected');

    socket.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      // Keepalive ping from extension — reply with pong
      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (msg.type === 'register' && msg.client === 'ally-browser-extension') {
        extensionSocket = socket;
        console.log('[BrowserBridge] ✅ Extension registered (version:', msg.version, ')');
        // Confirm registration
        socket.send(JSON.stringify({ type: 'registered', ok: true }));
        return;
      }

      if (msg.type === 'result' && msg.id) {
        const resolve = pendingCalls.get(msg.id);
        if (resolve) {
          pendingCalls.delete(msg.id);
          resolve(msg);
        }
      }
    });

    socket.on('close', () => {
      if (socket === extensionSocket) {
        extensionSocket = null;
        console.log('[BrowserBridge] Extension disconnected');
      }
    });
  });

  wss.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[BrowserBridge] Port ${PORT} in use — browsermcp may be running. Browser bridge disabled.`);
    } else {
      console.error('[BrowserBridge] Server error:', err);
    }
  });
}

export function stopBrowserBridgeServer() {
  wss?.close();
  wss = null;
  extensionSocket = null;
}

export function isBrowserExtensionConnected(): boolean {
  return extensionSocket !== null && extensionSocket.readyState === WebSocket.OPEN;
}

export async function callBrowserTool(
  tool: string,
  params: Record<string, unknown>,
  timeoutMs = 15000
): Promise<BrowserToolResult> {
  if (!isBrowserExtensionConnected()) {
    return { success: false, error: 'Ally Browser Extension is not connected. Make sure it is installed and Chrome is open.' };
  }

  const id = `call_${++callIdCounter}_${Date.now()}`;

  return new Promise<BrowserToolResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingCalls.delete(id);
      resolve({ success: false, error: `Browser tool ${tool} timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    pendingCalls.set(id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });

    extensionSocket!.send(JSON.stringify({ type: 'command', id, tool, params }));
  });
}
