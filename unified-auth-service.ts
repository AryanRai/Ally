/**
 * Unified Authentication Service
 * 
 * Provides consistent authentication across both ally-remote-service and glass-pip-chat
 */

import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { UnifiedAuthState, UnifiedLocalSystem, UnifiedConfig } from './shared-types';
import { sharedConfig, environment } from './shared-config';

export class UnifiedAuthService {
  private supabaseClient: SupabaseClient;
  private authStateListeners: Set<(state: UnifiedAuthState) => void> = new Set();
  private currentAuthState: UnifiedAuthState | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<UnifiedConfig>) {
    const finalConfig = { ...sharedConfig, ...config };
    
    this.supabaseClient = createClient(
      finalConfig.supabase.url,
      finalConfig.supabase.anonKey,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
          storage: environment.isBrowser ? window.localStorage : undefined,
          storageKey: finalConfig.storage.authKey
        }
      }
    );

    this.initializeAuthState();
    this.setupAuthListener();
  }

  private async initializeAuthState(): Promise<void> {
    try {
      const { data: { session } } = await this.supabaseClient.auth.getSession();
      await this.updateAuthState(session?.user || null, session);
    } catch (error) {
      console.error('Failed to initialize auth state:', error);
      await this.updateAuthState(null, null);
    }
  }

  private setupAuthListener(): void {
    this.supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);
      
      await this.updateAuthState(session?.user || null, session);
      
      if (event === 'SIGNED_IN' && session?.user) {
        await this.registerLocalSystem(session.user.id);
        this.startHeartbeat();
      } else if (event === 'SIGNED_OUT') {
        this.stopHeartbeat();
      }
    });
  }

  private async updateAuthState(user: User | null, session: Session | null): Promise<void> {
    const newAuthState: UnifiedAuthState = {
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
      } catch (error) {
        console.error('Error in auth state listener:', error);
      }
    });

    // Store in localStorage for cross-tab sync (web only)
    if (environment.isBrowser) {
      try {
        localStorage.setItem(
          `${sharedConfig.storage.authKey}-state`,
          JSON.stringify(newAuthState)
        );
      } catch (error) {
        console.error('Failed to store auth state:', error);
      }
    }
  }

  private async registerLocalSystem(userId: string): Promise<void> {
    try {
      const systemId = `${sharedConfig.system.type}-${sharedConfig.system.id}`;
      
      const systemData: Partial<UnifiedLocalSystem> = {
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
      } else {
        console.log('Local system registered:', systemId);
      }
    } catch (error) {
      console.error('Error registering local system:', error);
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      if (this.currentAuthState?.isAuthenticated) {
        await this.sendHeartbeat();
      }
    }, sharedConfig.polling.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async sendHeartbeat(): Promise<void> {
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
    } catch (error) {
      console.error('Error sending heartbeat:', error);
    }
  }

  // Public API
  public async signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await this.supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  public async signUp(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await this.supabaseClient.auth.signUp({
        email,
        password
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  public async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabaseClient.auth.signOut();
      
      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  public async refreshSession(): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await this.supabaseClient.auth.refreshSession();
      
      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  public getAuthState(): UnifiedAuthState | null {
    return this.currentAuthState;
  }

  public onAuthStateChange(callback: (state: UnifiedAuthState) => void): () => void {
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

  public getSupabaseClient(): SupabaseClient {
    return this.supabaseClient;
  }

  public async checkAuthIntegrity(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
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
        } else if (timeUntilExpiry < 5 * 60 * 1000) { // Less than 5 minutes
          issues.push('Session token expires soon');
        }
      }
      
      return {
        valid: issues.length === 0,
        issues
      };
    } catch (error) {
      issues.push(`Auth integrity check failed: ${(error as Error).message}`);
      return { valid: false, issues };
    }
  }

  public destroy(): void {
    this.stopHeartbeat();
    this.authStateListeners.clear();
    this.currentAuthState = null;
  }
}

// Singleton instance
let unifiedAuthService: UnifiedAuthService | null = null;

export function getUnifiedAuthService(config?: Partial<UnifiedConfig>): UnifiedAuthService {
  if (!unifiedAuthService) {
    unifiedAuthService = new UnifiedAuthService(config);
  }
  return unifiedAuthService;
}

export function resetUnifiedAuthService(): void {
  if (unifiedAuthService) {
    unifiedAuthService.destroy();
    unifiedAuthService = null;
  }
}