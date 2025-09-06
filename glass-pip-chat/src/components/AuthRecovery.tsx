/**
 * Authentication Recovery Component
 * 
 * Handles authentication session recovery and refresh token issues
 */

import React, { useEffect, useState } from 'react';
import { getSupabaseClient } from '../utils/supabase';
import { User } from '@supabase/supabase-js';

interface AuthRecoveryProps {
  onAuthStateChange?: (user: User | null) => void;
}

export const AuthRecovery: React.FC<AuthRecoveryProps> = ({ onAuthStateChange }) => {
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string>('');

  useEffect(() => {
    const supabase = getSupabaseClient();
    let mounted = true;

    const handleAuthRecovery = async () => {
      try {
        setIsRecovering(true);
        setRecoveryMessage('Checking authentication status...');

        // Try to get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.warn('Session error:', sessionError.message);
          
          // If refresh token is invalid, clear the session
          if (sessionError.message.includes('refresh_token_not_found') || 
              sessionError.message.includes('Invalid Refresh Token')) {
            setRecoveryMessage('Clearing invalid session...');
            await supabase.auth.signOut({ scope: 'local' });
            
            // Clear localStorage manually
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
              if (key.startsWith('ally-glass-pip-auth') || key.includes('supabase')) {
                localStorage.removeItem(key);
              }
            });
            
            setRecoveryMessage('Session cleared. Please sign in again.');
            onAuthStateChange?.(null);
          }
        } else if (session?.user) {
          setRecoveryMessage('Authentication restored successfully');
          onAuthStateChange?.(session.user);
        } else {
          setRecoveryMessage('No active session found');
          onAuthStateChange?.(null);
        }

      } catch (error) {
        console.error('Auth recovery error:', error);
        setRecoveryMessage('Authentication recovery failed');
        onAuthStateChange?.(null);
      } finally {
        if (mounted) {
          setIsRecovering(false);
          // Clear message after 3 seconds
          setTimeout(() => {
            if (mounted) setRecoveryMessage('');
          }, 3000);
        }
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      console.log('Auth state changed:', event, session?.user?.id);

      switch (event) {
        case 'SIGNED_IN':
          setRecoveryMessage('Successfully signed in');
          onAuthStateChange?.(session?.user || null);
          break;
        
        case 'SIGNED_OUT':
          setRecoveryMessage('Signed out');
          onAuthStateChange?.(null);
          break;
        
        case 'TOKEN_REFRESHED':
          setRecoveryMessage('Session refreshed');
          onAuthStateChange?.(session?.user || null);
          break;
        
        case 'USER_UPDATED':
          onAuthStateChange?.(session?.user || null);
          break;
        
        default:
          onAuthStateChange?.(session?.user || null);
      }

      // Clear message after 2 seconds
      setTimeout(() => {
        if (mounted) setRecoveryMessage('');
      }, 2000);
    });

    // Initial recovery attempt
    handleAuthRecovery();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [onAuthStateChange]);

  if (!isRecovering && !recoveryMessage) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <div className="bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg border border-gray-600">
        <div className="flex items-center space-x-2">
          {isRecovering && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
          )}
          <span className="text-sm">{recoveryMessage}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Utility function to manually clear all auth data
 */
export const clearAllAuthData = async () => {
  const supabase = getSupabaseClient();
  
  try {
    // Sign out from Supabase
    await supabase.auth.signOut({ scope: 'global' });
    
    // Clear all localStorage
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.includes('supabase') || key.includes('auth') || key.includes('ally')) {
        localStorage.removeItem(key);
      }
    });
    
    // Clear sessionStorage
    const sessionKeys = Object.keys(sessionStorage);
    sessionKeys.forEach(key => {
      if (key.includes('supabase') || key.includes('auth') || key.includes('ally')) {
        sessionStorage.removeItem(key);
      }
    });
    
    console.log('All auth data cleared successfully');
    return true;
  } catch (error) {
    console.error('Failed to clear auth data:', error);
    return false;
  }
};

/**
 * Utility function to test authentication health
 */
export const testAuthHealth = async () => {
  const supabase = getSupabaseClient();
  
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      return { healthy: false, error: error.message };
    }
    
    if (!session) {
      return { healthy: true, authenticated: false };
    }
    
    // Test database access
    const { error: dbError } = await supabase
      .from('local_systems')
      .select('id')
      .limit(1);
    
    if (dbError) {
      return { healthy: false, authenticated: true, error: dbError.message };
    }
    
    return { healthy: true, authenticated: true, user: session.user };
  } catch (error) {
    return { healthy: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};