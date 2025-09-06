/**
 * Unified Integration Adapter for Glass-PiP-Chat
 * 
 * Adapts the unified services to work with the existing glass-pip-chat architecture
 */

import { UnifiedMessage, UnifiedAuthState, UnifiedStreamEvent } from '../../../shared-types';
import { getUnifiedAuthService } from '../../../unified-auth-service';
import { getUnifiedMessageService } from '../../../unified-message-service';
import { Message } from '../types/chat';

export class UnifiedIntegrationAdapter {
  private authService = getUnifiedAuthService();
  private messageService = getUnifiedMessageService();
  private messageListeners: Set<(message: Message) => void> = new Set();
  private authListeners: Set<(authState: any) => void> = new Set();

  constructor() {
    this.setupListeners();
  }

  private setupListeners(): void {
    // Listen for auth changes and convert to glass-pip-chat format
    this.authService.onAuthStateChange((authState: UnifiedAuthState) => {
      const glassPipAuthState = {
        user: authState.user,
        session: authState.session,
        isAuthenticated: authState.isAuthenticated
      };

      this.authListeners.forEach(listener => {
        try {
          listener(glassPipAuthState);
        } catch (error) {
          console.error('Error in auth listener:', error);
        }
      });
    });

    // Listen for messages and convert to glass-pip-chat format
    this.messageService.onMessage((unifiedMessage: UnifiedMessage) => {
      const glassPipMessage = this.convertToGlassPipMessage(unifiedMessage);
      
      this.messageListeners.forEach(listener => {
        try {
          listener(glassPipMessage);
        } catch (error) {
          console.error('Error in message listener:', error);
        }
      });
    });
  }

  private convertToGlassPipMessage(unifiedMessage: UnifiedMessage): Message {
    return {
      id: unifiedMessage.id,
      role: unifiedMessage.role === 'system' ? 'assistant' : unifiedMessage.role,
      content: unifiedMessage.content,
      timestamp: unifiedMessage.timestamp,
      metadata: {
        source: unifiedMessage.metadata?.source as 'speech' | 'text' | undefined,
        context: unifiedMessage.metadata?.context,
        toolCalls: unifiedMessage.metadata?.toolCalls,
        toolResults: unifiedMessage.metadata?.toolResults
      }
    };
  }

  private convertFromGlassPipMessage(message: Message): UnifiedMessage {
    return {
      id: message.id,
      content: message.content,
      role: message.role,
      timestamp: message.timestamp,
      metadata: {
        source: 'desktop',
        isRemote: false,
        ...message.metadata
      }
    };
  }

  // Authentication methods
  public async signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    return this.authService.signIn(email, password);
  }

  public async signUp(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    return this.authService.signUp(email, password);
  }

  public async signOut(): Promise<{ success: boolean; error?: string }> {
    return this.authService.signOut();
  }

  public getAuthState(): any {
    const unifiedState = this.authService.getAuthState();
    if (!unifiedState) return null;

    return {
      user: unifiedState.user,
      session: unifiedState.session,
      isAuthenticated: unifiedState.isAuthenticated
    };
  }

  public onAuthStateChange(callback: (authState: any) => void): () => void {
    this.authListeners.add(callback);
    
    // Immediately call with current state
    const currentState = this.getAuthState();
    if (currentState) {
      callback(currentState);
    }
    
    return () => this.authListeners.delete(callback);
  }

  // Message methods
  public async sendMessage(content: string, sessionId?: string): Promise<{ messageId: string; sessionId: string }> {
    const response = await this.messageService.sendMessage({
      content,
      sessionId,
      source: 'desktop',
      metadata: {
        source: 'text'
      }
    });

    return {
      messageId: response.messageId,
      sessionId: response.sessionId
    };
  }

  public async getMessages(sessionId: string): Promise<Message[]> {
    const unifiedMessages = await this.messageService.getMessages(sessionId);
    return unifiedMessages.map(msg => this.convertToGlassPipMessage(msg));
  }

  public async createChatSession(title: string): Promise<{ id: string; title: string }> {
    const session = await this.messageService.createChatSession(title, false);
    return {
      id: session.id,
      title: session.title
    };
  }

  public onMessage(callback: (message: Message) => void): () => void {
    this.messageListeners.add(callback);
    return () => this.messageListeners.delete(callback);
  }

  // Remote integration methods
  public async checkRemoteConnection(): Promise<{ connected: boolean; status: string }> {
    try {
      const authState = this.authService.getAuthState();
      if (!authState?.isAuthenticated) {
        return { connected: false, status: 'Not authenticated' };
      }

      // Try to fetch a test message to verify connection
      const testSessionId = 'connection-test';
      await this.messageService.getMessages(testSessionId, 1);
      
      return { connected: true, status: 'Connected to remote service' };
    } catch (error) {
      return { connected: false, status: `Connection failed: ${(error as Error).message}` };
    }
  }

  public async syncWithRemote(): Promise<{ success: boolean; synced: number }> {
    try {
      // This would implement actual sync logic
      // For now, just return success
      return { success: true, synced: 0 };
    } catch (error) {
      console.error('Sync with remote failed:', error);
      return { success: false, synced: 0 };
    }
  }

  // Compatibility with existing glass-pip-chat services
  public getSupabaseClient() {
    return this.authService.getSupabaseClient();
  }

  public async checkAuthIntegrity(): Promise<{ valid: boolean; issues: string[] }> {
    return this.authService.checkAuthIntegrity();
  }

  public destroy(): void {
    this.messageListeners.clear();
    this.authListeners.clear();
  }
}

// Singleton instance
let unifiedIntegrationAdapter: UnifiedIntegrationAdapter | null = null;

export function getUnifiedIntegrationAdapter(): UnifiedIntegrationAdapter {
  if (!unifiedIntegrationAdapter) {
    unifiedIntegrationAdapter = new UnifiedIntegrationAdapter();
  }
  return unifiedIntegrationAdapter;
}

export function resetUnifiedIntegrationAdapter(): void {
  if (unifiedIntegrationAdapter) {
    unifiedIntegrationAdapter.destroy();
    unifiedIntegrationAdapter = null;
  }
}