import { createClientComponentClient, createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const createClient = () => createClientComponentClient();

export const createServerClient = () => {
  const cookieStore = cookies();
  return createServerComponentClient({ cookies: () => cookieStore });
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