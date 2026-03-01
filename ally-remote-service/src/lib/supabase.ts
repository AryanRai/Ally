import { createBrowserClient } from '@supabase/ssr';
import { createMockClient } from './supabase-mock';

export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return createMockClient() as any;
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
          source: 'web' | 'discord' | 'phone' | 'desktop';
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
          source?: 'web' | 'discord' | 'phone' | 'desktop';
          is_remote?: boolean;
          local_system_id: string;
          created_at?: string;
          updated_at?: string;
          processed_at?: string | null;
          completed_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['chat_messages']['Row']>;
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
        Update: Partial<Database['public']['Tables']['chat_sessions']['Row']>;
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
        Update: Partial<Database['public']['Tables']['local_systems']['Row']>;
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
        Update: Partial<Database['public']['Tables']['tool_executions']['Row']>;
      };
      link_tokens: {
        Row: {
          id: string;
          token: string;
          user_id: string | null;
          system_id: string | null;
          system_name: string | null;
          status: 'pending' | 'claimed' | 'expired';
          claimed_at: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id: string;
          token: string;
          user_id?: string | null;
          system_id?: string | null;
          system_name?: string | null;
          status?: 'pending' | 'claimed' | 'expired';
          claimed_at?: string | null;
          expires_at: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['link_tokens']['Row']>;
      };
      discord_links: {
        Row: {
          id: string;
          user_id: string;
          discord_user_id: string;
          discord_username: string | null;
          discord_guild_id: string | null;
          discord_channel_id: string | null;
          linked_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          discord_user_id: string;
          discord_username?: string | null;
          discord_guild_id?: string | null;
          discord_channel_id?: string | null;
          linked_at?: string;
        };
        Update: Partial<Database['public']['Tables']['discord_links']['Row']>;
      };
    };
  };
};