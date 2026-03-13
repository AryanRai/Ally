/**
 * Unified Authentication Service
 *
 * Provides consistent authentication across both ally-remote-service and glass-pip-chat
 */
import { createClient } from '@supabase/supabase-js';
import { sharedConfig, environment } from './shared-config';
export class UnifiedAuthService {
    supabaseClient;
    authStateListeners = new Set();
    currentAuthState = null;
    heartbeatInterval = null;
    constructor(config) {
        const finalConfig = { ...sharedConfig, ...config };
        this.supabaseClient = createClient(finalConfig.supabase.url, finalConfig.supabase.anonKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
                flowType: 'pkce',
                storage: environment.isBrowser ? window.localStorage : undefined,
                storageKey: finalConfig.storage.authKey
            }
        });
        this.initializeAuthState();
        this.setupAuthListener();
    }
    async initializeAuthState() {
        try {
            const { data: { session } } = await this.supabaseClient.auth.getSession();
            await this.updateAuthState(session?.user || null, session);
        }
        catch (error) {
            console.error('Failed to initialize auth state:', error);
            await this.updateAuthState(null, null);
        }
    }
    setupAuthListener() {
        this.supabaseClient.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth state changed:', event);
            await this.updateAuthState(session?.user || null, session);
            if (event === 'SIGNED_IN' && session?.user) {
                await this.registerLocalSystem(session.user.id);
                this.startHeartbeat();
            }
            else if (event === 'SIGNED_OUT') {
                this.stopHeartbeat();
            }
        });
    }
    async updateAuthState(user, session) {
        const newAuthState = {
            user: user ? {
                id: user.id,
                email: user.email,
                ...user.user_metadata
            } : null,
            session: session ? {
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                expires_at: session.expires_at || 0,
                ...session
            } : null,
            isAuthenticated: !!user && !!session,
            lastAuthenticated: user && session ? Date.now() : undefined,
            source: environment.isNextJS ? 'web' : 'desktop'
        };
        this.currentAuthState = newAuthState;
        // Notify all listeners
        this.authStateListeners.forEach(listener => {
            try {
                listener(newAuthState);
            }
            catch (error) {
                console.error('Error in auth state listener:', error);
            }
        });
        // Store in localStorage for cross-tab sync (web only)
        if (environment.isBrowser) {
            try {
                localStorage.setItem(`${sharedConfig.storage.authKey}-state`, JSON.stringify(newAuthState));
            }
            catch (error) {
                console.error('Failed to store auth state:', error);
            }
        }
    }
    async registerLocalSystem(userId) {
        try {
            const systemId = `${sharedConfig.system.type}-${sharedConfig.system.id}`;
            const systemData = {
                id: systemId,
                user_id: userId,
                name: sharedConfig.system.name,
                type: sharedConfig.system.type,
                status: 'online',
                last_heartbeat: Date.now(),
                capabilities: {
                    models: environment.isNextJS ? [] : ['llama3.2:latest'], // Desktop has Ollama
                    tools: environment.isNextJS ? ['web-interface'] : ['desktop-interface', 'speech'],
                    features: environment.isNextJS ?
                        ['web-interface', 'remote-chat'] :
                        ['desktop-interface', 'pip-mode', 'speech', 'local-ai']
                },
                metadata: {
                    userAgent: environment.isBrowser ? navigator.userAgent : 'Electron',
                    platform: environment.isBrowser ? navigator.platform : process.platform,
                    version: '1.0.0',
                    environment: environment.isNextJS ? 'web' : 'desktop'
                },
                created_at: Date.now()
            };
            const { error } = await this.supabaseClient
                .from('local_systems')
                .upsert(systemData);
            if (error) {
                console.error('Error registering local system:', error);
            }
            else {
                console.log('Local system registered:', systemId);
            }
        }
        catch (error) {
            console.error('Error registering local system:', error);
        }
    }
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        this.heartbeatInterval = setInterval(async () => {
            if (this.currentAuthState?.isAuthenticated) {
                await this.sendHeartbeat();
            }
        }, sharedConfig.polling.heartbeatInterval);
    }
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    async sendHeartbeat() {
        try {
            const systemId = `${sharedConfig.system.type}-${sharedConfig.system.id}`;
            const { error } = await this.supabaseClient
                .from('local_systems')
                .update({
                last_heartbeat: Date.now(),
                status: 'online'
            })
                .eq('id', systemId);
            if (error) {
                console.error('Error sending heartbeat:', error);
            }
        }
        catch (error) {
            console.error('Error sending heartbeat:', error);
        }
    }
    // Public API
    async signIn(email, password) {
        try {
            const { data, error } = await this.supabaseClient.auth.signInWithPassword({
                email,
                password
            });
            if (error) {
                return { success: false, error: error.message };
            }
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async signUp(email, password) {
        try {
            const { data, error } = await this.supabaseClient.auth.signUp({
                email,
                password
            });
            if (error) {
                return { success: false, error: error.message };
            }
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async signOut() {
        try {
            const { error } = await this.supabaseClient.auth.signOut();
            if (error) {
                return { success: false, error: error.message };
            }
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async refreshSession() {
        try {
            const { data, error } = await this.supabaseClient.auth.refreshSession();
            if (error) {
                return { success: false, error: error.message };
            }
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    getAuthState() {
        return this.currentAuthState;
    }
    onAuthStateChange(callback) {
        this.authStateListeners.add(callback);
        // Immediately call with current state
        if (this.currentAuthState) {
            callback(this.currentAuthState);
        }
        // Return unsubscribe function
        return () => {
            this.authStateListeners.delete(callback);
        };
    }
    getSupabaseClient() {
        return this.supabaseClient;
    }
    async checkAuthIntegrity() {
        const issues = [];
        try {
            // Check if session is valid
            const { data: { session }, error } = await this.supabaseClient.auth.getSession();
            if (error) {
                issues.push(`Session error: ${error.message}`);
            }
            if (!session && this.currentAuthState?.isAuthenticated) {
                issues.push('Auth state mismatch: claims authenticated but no session');
            }
            if (session && !this.currentAuthState?.isAuthenticated) {
                issues.push('Auth state mismatch: has session but claims not authenticated');
            }
            // Check token expiry
            if (session && session.expires_at) {
                const expiresAt = session.expires_at * 1000; // Convert to milliseconds
                const now = Date.now();
                const timeUntilExpiry = expiresAt - now;
                if (timeUntilExpiry < 0) {
                    issues.push('Session token has expired');
                }
                else if (timeUntilExpiry < 5 * 60 * 1000) { // Less than 5 minutes
                    issues.push('Session token expires soon');
                }
            }
            return {
                valid: issues.length === 0,
                issues
            };
        }
        catch (error) {
            issues.push(`Auth integrity check failed: ${error.message}`);
            return { valid: false, issues };
        }
    }
    destroy() {
        this.stopHeartbeat();
        this.authStateListeners.clear();
        this.currentAuthState = null;
    }
}
// Singleton instance
let unifiedAuthService = null;
export function getUnifiedAuthService(config) {
    if (!unifiedAuthService) {
        unifiedAuthService = new UnifiedAuthService(config);
    }
    return unifiedAuthService;
}
export function resetUnifiedAuthService() {
    if (unifiedAuthService) {
        unifiedAuthService.destroy();
        unifiedAuthService = null;
    }
}
