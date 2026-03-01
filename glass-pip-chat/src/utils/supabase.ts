/**
 * Shared Supabase Client
 * 
 * Provides a singleton Supabase client to avoid multiple instances
 * Can be disabled for local-only mode
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let supabaseClient: SupabaseClient | null = null;
let supabaseServiceClient: SupabaseClient | null = null;
let supabaseEnabled = true;

// Check if we should enable Supabase
// Disable if: no URL configured, explicitly disabled, or running in local-only mode
const SUPABASE_DISABLED_REASONS: string[] = [];

function checkSupabaseEnabled(): boolean {
  // Check settings from localStorage first
  try {
    const savedSettings = localStorage.getItem('ally-glass-pip-settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      if (settings.network?.enableSupabase === false) {
        SUPABASE_DISABLED_REASONS.push('Disabled in settings');
        return false;
      }
    }
  } catch (e) {
    // Ignore parse errors
  }
  
  // Check if explicitly disabled via env
  if (import.meta.env.VITE_DISABLE_SUPABASE === 'true') {
    SUPABASE_DISABLED_REASONS.push('Explicitly disabled via VITE_DISABLE_SUPABASE');
    return false;
  }
  
  // Check if URL is missing or placeholder
  if (!env.SUPABASE_URL || env.SUPABASE_URL === 'https://your-project.supabase.co') {
    SUPABASE_DISABLED_REASONS.push('Supabase URL not configured');
    return false;
  }
  
  // Check if publishable key is missing or placeholder
  if (!env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY.length < 20) {
    SUPABASE_DISABLED_REASONS.push('Supabase publishable key not configured');
    return false;
  }
  
  // Note: We no longer gate Supabase on ENABLE_REMOTE.
  // Supabase auth should work independently so users can sign in
  // even when remote polling/message features are off.
  
  return true;
}

// Initialize on module load
supabaseEnabled = checkSupabaseEnabled();

if (!supabaseEnabled) {
  console.log('🔒 Supabase disabled:', SUPABASE_DISABLED_REASONS.join(', '));
}

/**
 * Check if Supabase is enabled
 */
export function isSupabaseEnabled(): boolean {
  return supabaseEnabled;
}

/**
 * Re-check if Supabase should be enabled (call after settings change)
 */
export function recheckSupabaseEnabled(): boolean {
  SUPABASE_DISABLED_REASONS.length = 0; // Clear reasons
  supabaseEnabled = checkSupabaseEnabled();
  if (!supabaseEnabled) {
    supabaseClient = null;
    supabaseServiceClient = null;
    console.log('🔒 Supabase disabled:', SUPABASE_DISABLED_REASONS.join(', '));
  }
  return supabaseEnabled;
}

/**
 * Get reasons why Supabase is disabled
 */
export function getSupabaseDisabledReasons(): string[] {
  return SUPABASE_DISABLED_REASONS;
}

/**
 * Manually disable Supabase (useful for runtime toggling)
 */
export function disableSupabase(): void {
  supabaseEnabled = false;
  supabaseClient = null;
  supabaseServiceClient = null;
  console.log('🔒 Supabase manually disabled');
}

/**
 * Get the shared Supabase client (anon key)
 * Returns null if Supabase is disabled
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseEnabled) {
    return null;
  }
  
  if (!supabaseClient) {
    try {
      supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
          storage: typeof window !== 'undefined' ? window.localStorage : undefined,
          storageKey: 'ally-glass-pip-auth'
        }
      });
    } catch (error) {
      console.error('Failed to create Supabase client:', error);
      supabaseEnabled = false;
      return null;
    }
  }
  return supabaseClient;
}

/**
 * Get the shared Supabase service client (service role key)
 * Returns null if Supabase is disabled
 */
export function getSupabaseServiceClient(): SupabaseClient | null {
  if (!supabaseEnabled) {
    return null;
  }
  
  if (!supabaseServiceClient) {
    try {
      supabaseServiceClient = createClient(
        env.SUPABASE_URL, 
        env.SUPABASE_SERVICE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );
    } catch (error) {
      console.error('Failed to create Supabase service client:', error);
      return null;
    }
  }
  return supabaseServiceClient;
}

/**
 * Reset clients (useful for testing)
 */
export function resetSupabaseClients(): void {
  supabaseClient = null;
  supabaseServiceClient = null;
}
