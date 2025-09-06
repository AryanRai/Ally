/**
 * Shared Supabase Client
 * 
 * Provides a singleton Supabase client to avoid multiple instances
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let supabaseClient: SupabaseClient | null = null;
let supabaseServiceClient: SupabaseClient | null = null;

/**
 * Get the shared Supabase client (anon key)
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
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
  }
  return supabaseClient;
}

/**
 * Get the shared Supabase service client (service role key)
 */
export function getSupabaseServiceClient(): SupabaseClient {
  if (!supabaseServiceClient) {
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