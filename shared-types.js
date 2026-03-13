/**
 * Shared Types for Ally Integration
 *
 * Unified type definitions that work across both applications
 */
// Type guards for compatibility
export function isUnifiedMessage(obj) {
    return obj &&
        typeof obj.id === 'string' &&
        typeof obj.content === 'string' &&
        ['user', 'assistant', 'system'].includes(obj.role) &&
        typeof obj.timestamp === 'number';
}
export function isLegacyGlassPipMessage(obj) {
    return obj &&
        typeof obj.id === 'string' &&
        typeof obj.content === 'string' &&
        ['user', 'assistant'].includes(obj.role) &&
        typeof obj.timestamp === 'number' &&
        !obj.session_id; // Glass-pip-chat doesn't have session_id
}
export function isLegacyRemoteServiceMessage(obj) {
    return obj &&
        typeof obj.id === 'string' &&
        typeof obj.content === 'string' &&
        typeof obj.session_id === 'string' &&
        typeof obj.user_id === 'string' &&
        ['pending', 'processing', 'completed', 'error'].includes(obj.status);
}
// Conversion utilities
export function convertToUnifiedMessage(message, source) {
    const baseMessage = {
        id: message.id,
        content: message.content || message.response || '',
        role: message.role || 'user',
        timestamp: typeof message.timestamp === 'number' ? message.timestamp :
            message.created_at ? new Date(message.created_at).getTime() : Date.now(),
        metadata: {
            source: source === 'desktop' ? 'text' : 'remote',
            isRemote: source === 'web',
            ...message.metadata
        }
    };
    // Add optional fields if they exist
    if (message.session_id)
        baseMessage.session_id = message.session_id;
    if (message.user_id)
        baseMessage.user_id = message.user_id;
    if (message.status)
        baseMessage.status = message.status;
    if (message.error_message)
        baseMessage.error_message = message.error_message;
    if (message.response)
        baseMessage.response = message.response;
    if (message.created_at)
        baseMessage.created_at = message.created_at;
    if (message.updated_at)
        baseMessage.updated_at = message.updated_at;
    if (message.processed_at)
        baseMessage.processed_at = message.processed_at;
    if (message.completed_at)
        baseMessage.completed_at = message.completed_at;
    return baseMessage;
}
export function convertToLegacyFormat(message, targetFormat) {
    if (targetFormat === 'desktop') {
        // Convert to glass-pip-chat format
        return {
            id: message.id,
            role: message.role === 'system' ? 'assistant' : message.role,
            content: message.content,
            timestamp: message.timestamp,
            metadata: message.metadata
        };
    }
    else {
        // Convert to ally-remote-service format
        return {
            id: message.id,
            session_id: message.session_id || 'default-session',
            user_id: message.user_id || 'default-user',
            content: message.content,
            response: message.response || '',
            status: message.status || 'completed',
            error_message: message.error_message,
            metadata: message.metadata || {},
            is_remote: message.metadata?.isRemote || false,
            local_system_id: message.metadata?.local_system_id || 'default-system',
            created_at: message.created_at || new Date(message.timestamp).toISOString(),
            updated_at: message.updated_at || new Date().toISOString(),
            processed_at: message.processed_at,
            completed_at: message.completed_at
        };
    }
}
