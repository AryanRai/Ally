/**
 * Remote Tool Bridge
 * 
 * Event bridge between the RemoteMessagePoller and GlassChatPiP's tool pipeline.
 * When a web message requests tool usage, the poller delegates to this bridge,
 * which emits an event that GlassChatPiP picks up and processes through its
 * full MCP-aware agentic pipeline.
 */

export interface RemoteToolRequest {
  messageId: string;
  sessionId: string;
  content: string;
  userId: string;
}

type RequestHandler = (request: RemoteToolRequest) => Promise<void>;

class RemoteToolBridgeClass {
  private handler: RequestHandler | null = null;

  /** Register the handler (called by GlassChatPiP on mount) */
  registerHandler(handler: RequestHandler): void {
    this.handler = handler;
  }

  /** Unregister the handler (called on unmount) */
  unregisterHandler(): void {
    this.handler = null;
  }

  /** Check if a handler is registered */
  get isReady(): boolean {
    return this.handler !== null;
  }

  /** Dispatch a remote message for tool-aware processing */
  async dispatch(request: RemoteToolRequest): Promise<boolean> {
    if (!this.handler) {
      console.warn('⚠️ RemoteToolBridge: No handler registered, cannot process with tools');
      return false;
    }
    try {
      await this.handler(request);
      return true;
    } catch (error) {
      console.error('❌ RemoteToolBridge: Handler error:', error);
      return false;
    }
  }
}

export const RemoteToolBridge = new RemoteToolBridgeClass();
