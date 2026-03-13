/**
 * Unified Message Service
 *
 * Provides consistent message handling and synchronization between applications
 */
import { convertToUnifiedMessage, convertToLegacyFormat } from './shared-types';
import { getUnifiedAuthService } from './unified-auth-service';
import { sharedConfig, environment } from './shared-config';
export class UnifiedMessageService {
    supabaseClient;
    messageListeners = new Set();
    streamListeners = new Set();
    realtimeSubscription = null;
    constructor() {
        const authService = getUnifiedAuthService();
        this.supabaseClient = authService.getSupabaseClient();
        this.setupRealtimeSubscription();
    }
    setupRealtimeSubscription() {
        try {
            // Subscribe to message changes
            this.realtimeSubscription = this.supabaseClient
                .channel('unified-messages')
                .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'chat_messages'
            }, (payload) => {
                this.handleRealtimeMessage(payload);
            })
                .subscribe();
        }
        catch (error) {
            console.error('Failed to setup realtime subscription:', error);
        }
    }
    handleRealtimeMessage(payload) {
        try {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            if (eventType === 'INSERT' && newRecord) {
                const unifiedMessage = convertToUnifiedMessage(newRecord, 'web');
                this.notifyMessageListeners(unifiedMessage);
                // Emit stream event
                const streamEvent = {
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
                const streamEvent = {
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
        }
        catch (error) {
            console.error('Error handling realtime message:', error);
        }
    }
    notifyMessageListeners(message) {
        this.messageListeners.forEach(listener => {
            try {
                listener(message);
            }
            catch (error) {
                console.error('Error in message listener:', error);
            }
        });
    }
    notifyStreamListeners(event) {
        this.streamListeners.forEach(listener => {
            try {
                listener(event);
            }
            catch (error) {
                console.error('Error in stream listener:', error);
            }
        });
    }
    // Public API
    async sendMessage(request) {
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
                status: 'pending',
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
        }
        catch (error) {
            throw new Error(`Send message failed: ${error.message}`);
        }
    }
    async getMessages(sessionId, limit = 50) {
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
        }
        catch (error) {
            throw new Error(`Get messages failed: ${error.message}`);
        }
    }
    async getChatSessions(userId) {
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
            const sessions = [];
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
        }
        catch (error) {
            throw new Error(`Get chat sessions failed: ${error.message}`);
        }
    }
    async createChatSession(title, isRemote = false) {
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
        }
        catch (error) {
            throw new Error(`Create chat session failed: ${error.message}`);
        }
    }
    async updateMessageStatus(messageId, status, response, errorMessage) {
        try {
            const updateData = {
                status,
                updated_at: new Date().toISOString()
            };
            if (response)
                updateData.response = response;
            if (errorMessage)
                updateData.error_message = errorMessage;
            if (status === 'processing')
                updateData.processed_at = new Date().toISOString();
            if (status === 'completed')
                updateData.completed_at = new Date().toISOString();
            const { error } = await this.supabaseClient
                .from('chat_messages')
                .update(updateData)
                .eq('id', messageId);
            if (error) {
                throw new Error(`Failed to update message status: ${error.message}`);
            }
        }
        catch (error) {
            throw new Error(`Update message status failed: ${error.message}`);
        }
    }
    async pollForMessages(systemId, batchSize = 10) {
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
        }
        catch (error) {
            throw new Error(`Poll for messages failed: ${error.message}`);
        }
    }
    // Event listeners
    onMessage(callback) {
        this.messageListeners.add(callback);
        return () => this.messageListeners.delete(callback);
    }
    onStream(callback) {
        this.streamListeners.add(callback);
        return () => this.streamListeners.delete(callback);
    }
    // Compatibility methods for legacy applications
    convertMessageForGlassPip(message) {
        return convertToLegacyFormat(message, 'desktop');
    }
    convertMessageForRemoteService(message) {
        return convertToLegacyFormat(message, 'web');
    }
    convertFromGlassPip(message) {
        return convertToUnifiedMessage(message, 'desktop');
    }
    convertFromRemoteService(message) {
        return convertToUnifiedMessage(message, 'web');
    }
    destroy() {
        if (this.realtimeSubscription) {
            this.realtimeSubscription.unsubscribe();
            this.realtimeSubscription = null;
        }
        this.messageListeners.clear();
        this.streamListeners.clear();
    }
}
// Singleton instance
let unifiedMessageService = null;
export function getUnifiedMessageService() {
    if (!unifiedMessageService) {
        unifiedMessageService = new UnifiedMessageService();
    }
    return unifiedMessageService;
}
export function resetUnifiedMessageService() {
    if (unifiedMessageService) {
        unifiedMessageService.destroy();
        unifiedMessageService = null;
    }
}
