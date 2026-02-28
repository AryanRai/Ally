/**
 * Authentication Fixer Utility
 * 
 * Provides utilities to fix common authentication issues in the browser
 */

import { getSupabaseClient, isSupabaseEnabled } from './supabase';

export interface AuthFixResult {
  success: boolean;
  message: string;
  details?: any;
}

/**
 * Clear all corrupted authentication data
 */
export async function clearCorruptedAuth(): Promise<AuthFixResult> {
  try {
    const supabase = getSupabaseClient();
    
    // Sign out from Supabase if available
    if (supabase) {
      await supabase.auth.signOut({ scope: 'local' });
    }
    
    // Clear localStorage
    const keys = Object.keys(localStorage);
    let clearedKeys = 0;
    
    keys.forEach(key => {
      if (key.includes('supabase') || 
          key.includes('auth') || 
          key.includes('ally-glass-pip') ||
          key.startsWith('sb-')) {
        localStorage.removeItem(key);
        clearedKeys++;
      }
    });
    
    // Clear sessionStorage
    const sessionKeys = Object.keys(sessionStorage);
    sessionKeys.forEach(key => {
      if (key.includes('supabase') || 
          key.includes('auth') || 
          key.includes('ally')) {
        sessionStorage.removeItem(key);
        clearedKeys++;
      }
    });
    
    return {
      success: true,
      message: `Cleared ${clearedKeys} corrupted auth entries`,
      details: { clearedKeys }
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to clear auth data: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Test authentication health
 */
export async function testAuthHealth(): Promise<AuthFixResult> {
  // If Supabase is disabled, return success (local mode)
  if (!isSupabaseEnabled()) {
    return {
      success: true,
      message: 'Running in local mode - Supabase disabled',
      details: { authenticated: false, localMode: true }
    };
  }
  
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return {
        success: true,
        message: 'Supabase not available - running in local mode',
        details: { authenticated: false, localMode: true }
      };
    }
    
    // Check session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      // Handle refresh token errors
      if (sessionError.message.includes('refresh_token_not_found') || 
          sessionError.message.includes('Invalid Refresh Token')) {
        
        const clearResult = await clearCorruptedAuth();
        return {
          success: false,
          message: 'Refresh token expired - cleared corrupted session',
          details: { sessionError: sessionError.message, clearResult }
        };
      }
      
      return {
        success: false,
        message: `Session error: ${sessionError.message}`,
        details: { sessionError }
      };
    }
    
    if (!session) {
      return {
        success: true,
        message: 'No active session - ready for login',
        details: { authenticated: false }
      };
    }
    
    // Test database access
    const { error: dbError } = await supabase
      .from('local_systems')
      .select('id')
      .limit(1);
    
    if (dbError) {
      return {
        success: false,
        message: `Database access failed: ${dbError.message}`,
        details: { dbError, session: session.user.id }
      };
    }
    
    return {
      success: true,
      message: 'Authentication healthy',
      details: { 
        authenticated: true, 
        userId: session.user.id,
        expiresAt: new Date(session.expires_at! * 1000)
      }
    };
  } catch (error) {
    return {
      success: false,
      message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Attempt to recover authentication
 */
export async function recoverAuth(email: string, password: string): Promise<AuthFixResult> {
  if (!isSupabaseEnabled()) {
    return {
      success: false,
      message: 'Supabase is disabled - cannot recover auth in local mode'
    };
  }
  
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return {
        success: false,
        message: 'Supabase client not available'
      };
    }
    
    // First clear any corrupted data
    await clearCorruptedAuth();
    
    // Try to sign in
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      // If user doesn't exist, try to create
      if (error.message.includes('Invalid login credentials')) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password
        });
        
        if (signUpError) {
          return {
            success: false,
            message: `Sign up failed: ${signUpError.message}`,
            details: { signUpError }
          };
        }
        
        return {
          success: true,
          message: signUpData.session ? 'Account created and signed in' : 'Account created - check email to confirm',
          details: { 
            userId: signUpData.user?.id,
            needsConfirmation: !signUpData.session
          }
        };
      }
      
      return {
        success: false,
        message: `Sign in failed: ${error.message}`,
        details: { error }
      };
    }
    
    return {
      success: true,
      message: 'Authentication recovered successfully',
      details: { 
        userId: data.user?.id,
        expiresAt: data.session ? new Date(data.session.expires_at! * 1000) : undefined
      }
    };
  } catch (error) {
    return {
      success: false,
      message: `Recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Auto-fix common authentication issues
 */
export async function autoFixAuth(): Promise<AuthFixResult> {
  try {
    // Step 1: Test current health
    const healthResult = await testAuthHealth();
    
    if (healthResult.success && healthResult.details?.authenticated) {
      return {
        success: true,
        message: 'Authentication already healthy',
        details: healthResult.details
      };
    }
    
    // Step 2: Clear corrupted data if needed
    if (!healthResult.success) {
      const clearResult = await clearCorruptedAuth();
      if (!clearResult.success) {
        return clearResult;
      }
    }
    
    // Step 3: Test again after clearing
    const retestResult = await testAuthHealth();
    
    return {
      success: true,
      message: 'Auto-fix completed - ready for authentication',
      details: { 
        healthAfterFix: retestResult,
        needsLogin: !retestResult.details?.authenticated
      }
    };
  } catch (error) {
    return {
      success: false,
      message: `Auto-fix failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// Make utilities available globally in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).authFixer = {
    clearCorruptedAuth,
    testAuthHealth,
    recoverAuth,
    autoFixAuth
  };
}