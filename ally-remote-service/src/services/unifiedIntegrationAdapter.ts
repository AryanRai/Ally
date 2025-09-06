/**
 * Unified Integration Adapter for Ally Remote Service
 * 
 * Adapts the unified services to work with the existing ally-remote-service architecture
 */

import { UnifiedMessage, UnifiedAuthState, UnifiedStreamEvent } from '../../../shared-types';
import { getUnifiedAuthService } from '../../../unified-auth-service';
import { getUnifiedMessageService } from '../../../unified-message-service';
import { getUnifiedErrorRecoveryService } from '../../../unified-error-recovery';
import { Message, ChatSession, SendMessageRequest, SendMessageResponse } from '../types';

export class UnifiedIntegrationAdapter {
  private authService = getUnifiedAuthService();
  private messageService = getUnifiedMessageService();
  private errorRecoveryService = getUnifiedErrorRecoveryService();
  private messageListeners: Set<(message: Message) => void> = new Set();
  private authListeners: Set<(authState: any) => void> = new Set();
  private streamListeners: Set<(event: any) => void> = new Set();

  constructor() {
    this.setupListeners();
    this.startAutoRecovery();
  }

  private setupListeners(): void {
    // Listen for auth changes and convert to ally-remote-service format
    this.authService.onAuthStateChange((authState: UnifiedAuthState) => {
      const remoteServiceAuthState = {
        user: authState.user,
        session: authState.session,
        loading: false
      };

      this.authListeners.forEach(listener => {
        try {
          listener(remoteServiceAuthState);
        } catch (error) {
          console.error('Error in auth listener:', error);
        }
      });
    });

    // Listen for messages and convert to ally-remote-service format
    this.messageService.onMessage((unifiedMessage: UnifiedMessage) => {
      const remoteServiceMessage = this.convertToRemoteServiceMessage(unifiedMessage);
      
      this.messageListeners.forEach(listener => {
        try {
          listener(remoteServiceMessage);
        } catch (error) {
          console.error('Error in message listener:', error);
        }
      });
    });

    // Listen for stream events
    this.messageService.onStream((streamEvent: UnifiedStreamEvent) => {
      const remoteServiceStreamEvent = {
        type: streamEvent.type,
        messageId: streamEvent.messageId,
        data: streamEvent.data,
        timestamp: new Date(streamEvent.timestamp).toISOString()
      };

      this.streamListeners.forEach(listener => {
        try {
          listener(remoteServiceStreamEvent);
        } catch (error) {
          console.error('Error in stream listener:', error);
        }
      });
    });
  }

  private convertToRemoteServiceMessage(unifiedMessage: UnifiedMessage): Message {
    return {
      id: unifiedMessage.id,
      session_id: unifiedMessage.session_id || 'default-session',
      user_id: unifiedMessage.user_id || 'default-user',
      content: unifiedMessage.content,
      response: unifiedMessage.response || '',
      status: unifiedMessage.status || 'completed',
      error_message: unifiedMessage.error_message,
      metadata: unifiedMessage.metadata || {},
      is_remote: unifiedMessage.metadata?.isRemote || false,
      local_system_id: unifiedMessage.metadata?.local_system_id || 'default-system',
      created_at: unifiedMessage.created_at || new Date(unifiedMessage.timestamp).toISOString(),
      updated_at: unifiedMessage.updated_at || new Date().toISOString(),
      processed_at: unifiedMessage.processed_at,
      completed_at: unifiedMessage.completed_at
    };
  }

  private convertFromRemoteServiceMessage(message: Message): UnifiedMessage {
    return {
      id: message.id,
      content: message.content,
      role: 'user', // Default role, could be inferred from context
      timestamp: new Date(message.created_at).getTime(),
      session_id: message.session_id,
      user_id: message.user_id,
      status: message.status,
      error_message: message.error_message,
      response: message.response,
      metadata: {
        source: 'web',
        isRemote: message.is_remote,
        local_system_id: message.local_system_id,
        ...message.metadata
      },
      created_at: message.created_at,
      updated_at: message.updated_at,
      processed_at: message.processed_at,
      completed_at: message.completed_at
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
    if (!unifiedState) return { user: null, session: null, loading: false };

    return {
      user: unifiedState.user,
      session: unifiedState.session,
      loading: false
    };
  }

  public onAuthStateChange(callback: (authState: any) => void): () => void {
    this.authListeners.add(callback);
    
    // Immediately call with current state
    const currentState = this.getAuthState();
    callback(currentState);
    
    return () => this.authListeners.delete(callback);
  }

  // Message methods
  public async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    const response = await this.messageService.sendMessage({
      content: request.content,
      sessionId: request.sessionId,
      source: 'web',
      metadata: request.metadata
    });

    return {
      messageId: response.messageId,
      sessionId: response.sessionId,
      status: response.status,
      estimatedProcessingTime: 5000 // Default estimate
    };
  }

  public async getMessages(sessionId: string): Promise<Message[]> {
    const unifiedMessages = await this.messageService.getMessages(sessionId);
    return unifiedMessages.map(msg => this.convertToRemoteServiceMessage(msg));
  }

  public async getChatSessions(): Promise<ChatSession[]> {
    const unifiedSessions = await this.messageService.getChatSessions();
    
    return unifiedSessions.map(session => ({
      id: session.id,
      user_id: session.user_id || 'default-user',
      title: session.title,
      metadata: session.metadata,
      is_remote: session.is_remote,
      created_at: new Date(session.created_at).toISOString(),
      updated_at: new Date(session.updated_at).toISOString()
    }));
  }

  public async createChatSession(title: string): Promise<ChatSession> {
    const session = await this.messageService.createChatSession(title, true);
    
    return {
      id: session.id,
      user_id: session.user_id || 'default-user',
      title: session.title,
      metadata: session.metadata,
      is_remote: session.is_remote,
      created_at: new Date(session.created_at).toISOString(),
      updated_at: new Date(session.updated_at).toISOString()
    };
  }

  public async updateMessageStatus(
    messageId: string,
    status: 'pending' | 'processing' | 'completed' | 'error',
    response?: string,
    errorMessage?: string
  ): Promise<void> {
    return this.messageService.updateMessageStatus(messageId, status, response, errorMessage);
  }

  public async pollForMessages(systemId: string, batchSize: number = 10): Promise<Message[]> {
    const unifiedMessages = await this.messageService.pollForMessages(systemId, batchSize);
    return unifiedMessages.map(msg => this.convertToRemoteServiceMessage(msg));
  }

  // Event listeners
  public onMessage(callback: (message: Message) => void): () => void {
    this.messageListeners.add(callback);
    return () => this.messageListeners.delete(callback);
  }

  public onStream(callback: (event: any) => void): () => void {
    this.streamListeners.add(callback);
    return () => this.streamListeners.delete(callback);
  }

  // Local system management
  public async getLocalSystems(): Promise<any[]> {
    try {
      const { data, error } = await this.authService.getSupabaseClient()
        .from('local_systems')
        .select('*')
        .eq('status', 'online')
        .order('last_heartbeat', { ascending: false });

      if (error) {
        throw new Error(`Failed to get local systems: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error getting local systems:', error);
      return [];
    }
  }

  public async registerLocalSystem(): Promise<void> {
    // This is handled automatically by the auth service
    // when a user signs in
  }

  // Compatibility with existing ally-remote-service
  public getSupabaseClient() {
    return this.authService.getSupabaseClient();
  }

  public async checkAuthIntegrity(): Promise<{ valid: boolean; issues: string[] }> {
    return this.authService.checkAuthIntegrity();
  }

  private startAutoRecovery(): void {
    // Run error recovery every 30 seconds
    setInterval(async () => {
      try {
        await this.errorRecoveryService.runAutoRecovery();
      } catch (error) {
        console.error('Auto recovery failed:', error);
      }
    }, 30000);
  }

  public async runErrorRecovery(): Promise<{ detected: number; recovered: number; failed: number }> {
    return this.errorRecoveryService.runAutoRecovery();
  }

  public getServiceStatus() {
    return this.errorRecoveryService.getServiceStatus();
  }

  public destroy(): void {
    this.messageListeners.clear();
    this.authListeners.clear();
    this.streamListeners.clear();
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