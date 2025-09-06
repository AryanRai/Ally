/**
 * Unified Message Service
 * 
 * Provides consistent message handling and synchronization between applications
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { 
  UnifiedMessage, 
  UnifiedChatSession, 
  UnifiedSendMessageRequest,
  UnifiedSendMessageResponse,
  UnifiedStreamEvent,
  convertToUnifiedMessage,
  convertToLegacyFormat
} from './shared-types';
import { getUnifiedAuthService } from './unified-auth-service';
import { sharedConfig, environment } from './shared-config';

export class UnifiedMessageService {
  private supabaseClient: SupabaseClient;
  private messageListeners: Set<(message: UnifiedMessage) => void> = new Set();
  private streamListeners: Set<(event: UnifiedStreamEvent) => void> = new Set();
  private realtimeSubscription: any = null;

  constructor() {
    const authService = getUnifiedAuthService();
    this.supabaseClient = authService.getSupabaseClient();
    this.setupRealtimeSubscription();
  }

  private setupRealtimeSubscription(): void {
    try {
      // Subscribe to message changes
      this.realtimeSubscription = this.supabaseClient
        .channel('unified-messages')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chat_messages'
          },
          (payload) => {
            this.handleRealtimeMessage(payload);
          }
        )
        .subscribe();
    } catch (error) {
      console.error('Failed to setup realtime subscription:', error);
    }
  }

  private handleRealtimeMessage(payload: any): void {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;
      
      if (eventType === 'INSERT' && newRecord) {
        const unifiedMessage = convertToUnifiedMessage(newRecord, 'web');
        this.notifyMessageListeners(unifiedMessage);
        
        // Emit stream event
        const streamEvent: UnifiedStreamEvent = {
          type: 'response_chunk',
          messageId: unifiedMessage.id,
          sessionId: unifiedMessage.session_id,
          data: {
            content: unifiedMessage.content,
            status: unifiedMessage.status
          },
          timestamp: Date.now(),
          source: environment.isNextJS ? 'web' : 'desktop'
        };
        this.notifyStreamListeners(streamEvent);
      }
      
      if (eventType === 'UPDATE' && newRecord) {
        const unifiedMessage = convertToUnifiedMessage(newRecord, 'web');
        this.notifyMessageListeners(unifiedMessage);
        
        // Emit status change event
        const streamEvent: UnifiedStreamEvent = {
          type: 'status_change',
          messageId: unifiedMessage.id,
          sessionId: unifiedMessage.session_id,
          data: {
            status: unifiedMessage.status
          },
          timestamp: Date.now(),
          source: environment.isNextJS ? 'web' : 'desktop'
        };
        this.notifyStreamListeners(streamEvent);
      }
    } catch (error) {
      console.error('Error handling realtime message:', error);
    }
  }

  private notifyMessageListeners(message: UnifiedMessage): void {
    this.messageListeners.forEach(listener => {
      try {
        listener(message);
      } catch (error) {
        console.error('Error in message listener:', error);
      }
    });
  }

  private notifyStreamListeners(event: UnifiedStreamEvent): void {
    this.streamListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in stream listener:', error);
      }
    });
  }

  // Public API
  public async sendMessage(request: UnifiedSendMessageRequest): Promise<UnifiedSendMessageResponse> {
    try {
      const authService = getUnifiedAuthService();
      const authState = authService.getAuthState();
      
      if (!authState?.isAuthenticated || !authState.user) {
        throw new Error('User not authenticated');
      }

      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const sessionId = request.sessionId || `session_${Date.now()}`;
      
      const messageData = {
        id: messageId,
        session_id: sessionId,
        user_id: authState.user.id,
        content: request.content,
        response: '',
        status: 'pending' as const,
        metadata: {
          source: request.source,
          ...request.metadata
        },
        is_remote: request.source === 'web',
        local_system_id: `${sharedConfig.system.type}-${sharedConfig.system.id}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabaseClient
        .from('chat_messages')
        .insert(messageData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to send message: ${error.message}`);
      }

      return {
        messageId,
        sessionId,
        status: 'pending',
        timestamp: Date.now()
      };
    } catch (error) {
      throw new Error(`Send message failed: ${(error as Error).message}`);
    }
  }

  public async getMessages(sessionId: string, limit: number = 50): Promise<UnifiedMessage[]> {
    try {
      const { data, error } = await this.supabaseClient
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to get messages: ${error.message}`);
      }

      return (data || []).map(msg => convertToUnifiedMessage(msg, 'web'));
    } catch (error) {
      throw new Error(`Get messages failed: ${(error as Error).message}`);
    }
  }

  public async getChatSessions(userId?: string): Promise<UnifiedChatSession[]> {
    try {
      const authService = getUnifiedAuthService();
      const authState = authService.getAuthState();
      
      const targetUserId = userId || authState?.user?.id;
      if (!targetUserId) {
        throw new Error('User ID required');
      }

      const { data, error } = await this.supabaseClient
        .from('chat_sessions')
        .select('*')
        .eq('user_id', targetUserId)
        .order('updated_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to get chat sessions: ${error.message}`);
      }

      const sessions: UnifiedChatSession[] = [];
      
      for (const session of data || []) {
        const messages = await this.getMessages(session.id);
        
        sessions.push({
          id: session.id,
          title: session.title,
          user_id: session.user_id,
          messages,
          metadata: session.metadata || {},
          is_remote: session.is_remote || false,
          created_at: new Date(session.created_at).getTime(),
          updated_at: new Date(session.updated_at).getTime()
        });
      }

      return sessions;
    } catch (error) {
      throw new Error(`Get chat sessions failed: ${(error as Error).message}`);
    }
  }

  public async createChatSession(title: string, isRemote: boolean = false): Promise<UnifiedChatSession> {
    try {
      const authService = getUnifiedAuthService();
      const authState = authService.getAuthState();
      
      if (!authState?.isAuthenticated || !authState.user) {
        throw new Error('User not authenticated');
      }

      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const sessionData = {
        id: sessionId,
        user_id: authState.user.id,
        title,
        metadata: {
          created_by: sharedConfig.system.type,
          system_id: `${sharedConfig.system.type}-${sharedConfig.system.id}`
        },
        is_remote: isRemote,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabaseClient
        .from('chat_sessions')
        .insert(sessionData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create chat session: ${error.message}`);
      }

      return {
        id: sessionId,
        title,
        user_id: authState.user.id,
        messages: [],
        metadata: sessionData.metadata,
        is_remote: isRemote,
        created_at: Date.now(),
        updated_at: Date.now()
      };
    } catch (error) {
      throw new Error(`Create chat session failed: ${(error as Error).message}`);
    }
  }

  public async updateMessageStatus(
    messageId: string, 
    status: 'pending' | 'processing' | 'completed' | 'error',
    response?: string,
    errorMessage?: string
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };

      if (response) updateData.response = response;
      if (errorMessage) updateData.error_message = errorMessage;
      if (status === 'processing') updateData.processed_at = new Date().toISOString();
      if (status === 'completed') updateData.completed_at = new Date().toISOString();

      const { error } = await this.supabaseClient
        .from('chat_messages')
        .update(updateData)
        .eq('id', messageId);

      if (error) {
        throw new Error(`Failed to update message status: ${error.message}`);
      }
    } catch (error) {
      throw new Error(`Update message status failed: ${(error as Error).message}`);
    }
  }

  public async pollForMessages(systemId: string, batchSize: number = 10): Promise<UnifiedMessage[]> {
    try {
      const { data, error } = await this.supabaseClient
        .from('chat_messages')
        .select('*')
        .eq('local_system_id', systemId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(batchSize);

      if (error) {
        throw new Error(`Failed to poll for messages: ${error.message}`);
      }

      return (data || []).map(msg => convertToUnifiedMessage(msg, 'web'));
    } catch (error) {
      throw new Error(`Poll for messages failed: ${(error as Error).message}`);
    }
  }

  // Event listeners
  public onMessage(callback: (message: UnifiedMessage) => void): () => void {
    this.messageListeners.add(callback);
    return () => this.messageListeners.delete(callback);
  }

  public onStream(callback: (event: UnifiedStreamEvent) => void): () => void {
    this.streamListeners.add(callback);
    return () => this.streamListeners.delete(callback);
  }

  // Compatibility methods for legacy applications
  public convertMessageForGlassPip(message: UnifiedMessage): any {
    return convertToLegacyFormat(message, 'desktop');
  }

  public convertMessageForRemoteService(message: UnifiedMessage): any {
    return convertToLegacyFormat(message, 'web');
  }

  public convertFromGlassPip(message: any): UnifiedMessage {
    return convertToUnifiedMessage(message, 'desktop');
  }

  public convertFromRemoteService(message: any): UnifiedMessage {
    return convertToUnifiedMessage(message, 'web');
  }

  public destroy(): void {
    if (this.realtimeSubscription) {
      this.realtimeSubscription.unsubscribe();
      this.realtimeSubscription = null;
    }
    this.messageListeners.clear();
    this.streamListeners.clear();
  }
}

// Singleton instance
let unifiedMessageService: UnifiedMessageService | null = null;

export function getUnifiedMessageService(): UnifiedMessageService {
  if (!unifiedMessageService) {
    unifiedMessageService = new UnifiedMessageService();
  }
  return unifiedMessageService;
}

export function resetUnifiedMessageService(): void {
  if (unifiedMessageService) {
    unifiedMessageService.destroy();
    unifiedMessageService = null;
  }
}