import { createBrowserClient } from '@supabase/ssr';

export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a mock client for build time
    return {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: new Error('Supabase not configured') }),
        signUp: () => Promise.resolve({ data: { user: null, session: null }, error: new Error('Supabase not configured') }),
        signOut: () => Promise.resolve({ error: null }),
        resetPasswordForEmail: () => Promise.resolve({ error: new Error('Supabase not configured') }),
      },
      from: () => ({
        select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }) }) }),
        update: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }) }) }) }),
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        upsert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') }) }) }),
      }),
    } as any;
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
};

export type Database = {
  public: {
    Tables: {
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          content: string;
          response: string;
          status: 'pending' | 'processing' | 'completed' | 'error';
          error_message: string | null;
          metadata: Record<string, any>;
          is_remote: boolean;
          local_system_id: string;
          created_at: string;
          updated_at: string;
          processed_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id: string;
          session_id: string;
          user_id: string;
          content: string;
          response?: string;
          status?: 'pending' | 'processing' | 'completed' | 'error';
          error_message?: string | null;
          metadata?: Record<string, any>;
          is_remote?: boolean;
          local_system_id: string;
          created_at?: string;
          updated_at?: string;
          processed_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          session_id?: string;
          user_id?: string;
          content?: string;
          response?: string;
          status?: 'pending' | 'processing' | 'completed' | 'error';
          error_message?: string | null;
          metadata?: Record<string, any>;
          is_remote?: boolean;
          local_system_id?: string;
          created_at?: string;
          updated_at?: string;
          processed_at?: string | null;
          completed_at?: string | null;
        };
      };
      chat_sessions: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          metadata: Record<string, any>;
          is_remote: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          title: string;
          metadata?: Record<string, any>;
          is_remote?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          metadata?: Record<string, any>;
          is_remote?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      local_systems: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          status: 'online' | 'offline' | 'busy';
          capabilities: Record<string, any>;
          metadata: Record<string, any>;
          last_heartbeat: string;
          created_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          status?: 'online' | 'offline' | 'busy';
          capabilities?: Record<string, any>;
          metadata?: Record<string, any>;
          last_heartbeat?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          status?: 'online' | 'offline' | 'busy';
          capabilities?: Record<string, any>;
          metadata?: Record<string, any>;
          last_heartbeat?: string;
          created_at?: string;
        };
      };
      tool_executions: {
        Row: {
          id: string;
          message_id: string;
          tool_name: string;
          parameters: Record<string, any>;
          result: any;
          status: 'running' | 'completed' | 'failed';
          error_message: string | null;
          execution_time_ms: number;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id: string;
          message_id: string;
          tool_name: string;
          parameters?: Record<string, any>;
          result?: any;
          status?: 'running' | 'completed' | 'failed';
          error_message?: string | null;
          execution_time_ms?: number;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          message_id?: string;
          tool_name?: string;
          parameters?: Record<string, any>;
          result?: any;
          status?: 'running' | 'completed' | 'failed';
          error_message?: string | null;
          execution_time_ms?: number;
          created_at?: string;
          completed_at?: string | null;
        };
      };
    };
  };
};