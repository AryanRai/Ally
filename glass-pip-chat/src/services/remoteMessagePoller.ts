/**
 * Remote Message Poller Service
 * Requirements: 3.1, 3.2, 3.3
 * 
 * Polls Supabase for new remote messages and processes them through the local Ally system
 * Implements heartbeat system for local system registration
 * Handles message fetching with proper filtering and error handling
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { OllamaService, ChatMessage } from './ollamaService';
import { ToolCallingService } from './toolCallingService';
import { RemoteMessageProcessor, ProcessMessageRequest } from './remoteMessageProcessor';
import { getSupabaseClient, isSupabaseEnabled } from '../utils/supabase';
import { RemoteToolBridge } from './remoteToolBridge';

export interface RemoteMessage {
  id: string;
  session_id: string;
  user_id: string;
  content: string;
  response: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error_message?: string;
  metadata: Record<string, any>;
  is_remote: boolean;
  local_system_id: string;
  created_at: string;
  updated_at: string;
  processed_at?: string;
  completed_at?: string;
}

export interface LocalSystem {
  id: string;
  user_id: string;
  name: string;
  last_heartbeat: string;
  status: 'online' | 'offline' | 'busy';
  capabilities: {
    models: string[];
    tools: string[];
    features: string[];
  };
  metadata: Record<string, any>;
  created_at: string;
}

export interface MessagePollerConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
  systemId: string;
  systemName: string;
  pollInterval: number;
  batchSize: number;
  heartbeatInterval: number;
  maxRetryAttempts: number;
  retryDelay: number;
}

export interface ProcessMessageRequest {
  messageId: string;
  content: string;
  sessionId: string;
  userId: string;
  onProgress?: (chunk: string) => void;
  onToolExecution?: (execution: any) => void;
}

export class RemoteMessagePoller {
  private supabaseClient: SupabaseClient;
  private messageProcessor: RemoteMessageProcessor;
  private config: MessagePollerConfig;
  private isPolling = false;
  private pollTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private retryCount = 0;

  constructor(
    config: MessagePollerConfig,
    ollamaService: OllamaService,
    toolCallingService: ToolCallingService
  ) {
    this.config = config;
    this.messageProcessor = new RemoteMessageProcessor(ollamaService, toolCallingService);
    
    // Use the regular (publishable key) client with the user's auth session.
    // The secret/service key must NOT be used in the browser — Supabase blocks it.
    // RLS policies on the tables handle authorization instead.
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase client not available — cannot start poller');
    }
    this.supabaseClient = client;
  }

  /**
   * Start the polling service
   */
  async startPolling(): Promise<void> {
    if (this.isPolling) {
      console.log('Message poller is already running');
      return;
    }

    console.log(`🚀 RemoteMessagePoller: Starting remote message poller for system: ${this.config.systemId}`);
    console.log('⚙️ RemoteMessagePoller: Full config:', this.config);
    
    try {
      // Register the local system
      await this.registerLocalSystem();
      
      this.isPolling = true;
      this.retryCount = 0;
      
      // Start polling loop
      this.scheduleNextPoll();
      
      // Start heartbeat
      this.startHeartbeat();
      
      console.log('✅ RemoteMessagePoller: Remote message poller started successfully');
    } catch (error) {
      console.error('❌ RemoteMessagePoller: Failed to start message poller:', error);
      throw error;
    }
  }

  /**
   * Stop the polling service
   */
  async stopPolling(): Promise<void> {
    console.log('Stopping remote message poller');
    
    this.isPolling = false;
    
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
    
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    
    // Update system status to offline
    try {
      await this.updateSystemStatus('offline');
    } catch (error) {
      console.error('Failed to update system status to offline:', error);
    }
    
    console.log('Remote message poller stopped');
  }

  /**
   * Register the local system in Supabase
   */
  private async registerLocalSystem(): Promise<void> {
    // Check if Supabase is enabled
    if (!isSupabaseEnabled()) {
      console.log('🔒 RemoteMessagePoller: Supabase disabled - skipping system registration');
      return;
    }
    
    // Get the current user from the regular client (not service client)
    const regularClient = getSupabaseClient();
    
    if (!regularClient) {
      console.log('🔒 RemoteMessagePoller: Supabase client not available - skipping system registration');
      return;
    }
    
    const { data: { session }, error: sessionError } = await regularClient.auth.getSession();
    
    if (sessionError || !session?.user) {
      console.error('❌ RemoteMessagePoller: No authenticated user found:', sessionError);
      throw new Error('Must be authenticated to register local system');
    }

    console.log('👤 RemoteMessagePoller: Authenticated user:', session.user.id, session.user.email);

    const systemData = {
      id: this.config.systemId,
      user_id: session.user.id, // Use the authenticated user's ID
      name: this.config.systemName,
      status: 'online',
      capabilities: {
        models: ['llama3.2', 'llama3.1', 'codellama'], // Default models
        tools: ['file_operations', 'system_commands', 'web_search'], // Default tools
        features: ['streaming', 'tool_calling', 'voice_mode'],
        currentModel: localStorage.getItem('ally-current-model') || 'unknown'
      },
      metadata: {
        version: '1.0.0',
        platform: 'browser',
        nodeVersion: 'browser'
      },
      last_heartbeat: new Date().toISOString()
    };

    console.log('🔧 RemoteMessagePoller: Registering local system with data:', systemData);

    // Use service client for the actual upsert (to bypass RLS)
    const { error } = await this.supabaseClient
      .from('local_systems')
      .upsert(systemData, { onConflict: 'id' });

    if (error) {
      console.error('❌ RemoteMessagePoller: Failed to register system:', error);
      throw new Error(`Failed to register local system: ${error.message}`);
    }

    console.log(`✅ RemoteMessagePoller: Local system registered successfully: ${this.config.systemId} for user: ${session.user.id}`);
  }

  /**
   * Start the heartbeat timer
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.sendHeartbeat();
      } catch (error) {
        console.error('Heartbeat failed:', error);
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Send heartbeat to update system status
   */
  private async sendHeartbeat(): Promise<void> {
    console.log('💓 RemoteMessagePoller: Sending heartbeat for system:', this.config.systemId);
    
    try {
      const { error } = await this.supabaseClient.rpc('update_system_heartbeat', {
        system_id: this.config.systemId,
        new_status: 'online'
      });

      if (error) {
        console.error('❌ RemoteMessagePoller: Heartbeat failed:', error);
        // Fallback to direct update if RPC fails
        await this.updateSystemStatus('online');
      } else {
        console.log('✅ RemoteMessagePoller: Heartbeat sent successfully');
      }
    } catch (error) {
      console.error('❌ RemoteMessagePoller: Heartbeat error:', error);
      // Fallback to direct update
      await this.updateSystemStatus('online');
    }
  }

  /**
   * Update system status
   */
  private async updateSystemStatus(status: 'online' | 'offline' | 'busy'): Promise<void> {
    console.log(`🔄 RemoteMessagePoller: Updating system status to ${status} for system:`, this.config.systemId);
    
    const { error } = await this.supabaseClient
      .from('local_systems')
      .update({ 
        status,
        last_heartbeat: new Date().toISOString()
      })
      .eq('id', this.config.systemId);

    if (error) {
      console.error('❌ RemoteMessagePoller: Failed to update system status:', error);
    } else {
      console.log(`✅ RemoteMessagePoller: System status updated to ${status}`);
    }
  }

  /**
   * Schedule the next polling cycle
   */
  private scheduleNextPoll(): void {
    if (!this.isPolling) return;

    const delay = this.retryCount > 0 
      ? Math.min(this.config.retryDelay * Math.pow(2, this.retryCount - 1), 30000)
      : this.config.pollInterval;

    this.pollTimer = setTimeout(async () => {
      await this.pollForMessages();
      this.scheduleNextPoll();
    }, delay);
  }

  /**
   * Poll for new messages from Supabase
   */
  private async pollForMessages(): Promise<void> {
    try {
      console.log('🔍 RemoteMessagePoller: Polling for messages...');
      const messages = await this.fetchPendingMessages();
      
      if (messages.length > 0) {
        console.log(`📨 RemoteMessagePoller: Found ${messages.length} pending messages:`, messages);
        
        for (const message of messages) {
          console.log(`🔄 RemoteMessagePoller: Processing message ${message.id}:`, message);
          await this.processMessage(message);
        }
      } else {
        console.log('📭 RemoteMessagePoller: No pending messages found');
      }
      
      // Reset retry count on successful poll
      this.retryCount = 0;
      
    } catch (error) {
      console.error('❌ RemoteMessagePoller: Polling error:', error);
      this.handlePollingError(error as Error);
    }
  }

  /**
   * Fetch pending messages from Supabase
   */
  private async fetchPendingMessages(): Promise<RemoteMessage[]> {
    console.log('🔍 RemoteMessagePoller: Fetching pending messages for system:', this.config.systemId);
    
    // First, let's see ALL pending messages to debug the issue
    const { data: allMessages, error: allError } = await this.supabaseClient
      .from('chat_messages')
      .select('id, local_system_id, status, is_remote, content, created_at')
      .eq('status', 'pending')
      .eq('is_remote', true)
      .order('created_at', { ascending: true })
      .limit(10);

    if (!allError && allMessages) {
      console.log('🔍 RemoteMessagePoller: ALL pending remote messages:', allMessages);
      console.log('🎯 RemoteMessagePoller: Looking for system_id:', this.config.systemId);
      
      allMessages.forEach(msg => {
        console.log(`📋 Message ${msg.id}: local_system_id="${msg.local_system_id}", matches=${msg.local_system_id === this.config.systemId}`);
      });
    }

    const { data, error } = await this.supabaseClient
      .from('chat_messages')
      .select('*')
      .eq('status', 'pending')
      .eq('is_remote', true)
      .eq('local_system_id', this.config.systemId)
      .order('created_at', { ascending: true })
      .limit(this.config.batchSize);

    if (error) {
      console.error('❌ RemoteMessagePoller: Failed to fetch messages:', error);
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }

    console.log('📊 RemoteMessagePoller: Fetched messages for our system:', data?.length || 0, data);
    return data || [];
  }

  /**
   * Process a single message using the integrated message processor
   */
  private async processMessage(message: RemoteMessage): Promise<void> {
    console.log(`🔄 RemoteMessagePoller: Processing message ${message.id}: ${message.content.substring(0, 100)}...`);
    
    try {
      // If the message requests tool usage and the bridge is ready, delegate to GlassChatPiP's pipeline
      if (message.metadata?.useTools && RemoteToolBridge.isReady) {
        console.log(`🔧 RemoteMessagePoller: Delegating to tool bridge for message ${message.id}`);
        await this.updateMessageStatus(message.id, 'processing');
        
        const handled = await RemoteToolBridge.dispatch({
          messageId: message.id,
          sessionId: message.session_id,
          content: message.content,
          userId: message.user_id,
        });
        
        if (handled) {
          console.log(`✅ RemoteMessagePoller: Tool bridge handled message ${message.id}`);
          return; // Bridge handles status updates
        }
        // Fall through to normal processing if bridge fails
        console.log(`⚠️ RemoteMessagePoller: Tool bridge failed, falling back to normal processing`);
      }

      // Update status to processing
      console.log(`📝 RemoteMessagePoller: Updating message ${message.id} status to processing`);
      await this.updateMessageStatus(message.id, 'processing');
      
      // Create processing request
      const request: ProcessMessageRequest = {
        messageId: message.id,
        content: message.content,
        sessionId: message.session_id,
        userId: message.user_id,
        onToolExecution: async (execution) => {
          console.log(`🔧 RemoteMessagePoller: Tool execution for message ${message.id}:`, execution);
          await this.logToolExecution(message.id, execution);
        }
      };

      console.log(`🤖 RemoteMessagePoller: Sending to message processor:`, request);
      
      // Process through the integrated message processor
      const result = await this.messageProcessor.processMessage(request);
      
      console.log(`📊 RemoteMessagePoller: Message processor result:`, result);
      
      if (result.error) {
        console.error(`❌ RemoteMessagePoller: Message processor returned error:`, result.error);
        throw new Error(result.error);
      }

      // Tool results are now handled by the message processor's streaming

      // Mark as completed
      console.log(`✅ RemoteMessagePoller: Marking message ${message.id} as completed`);
      await this.updateMessageStatus(message.id, 'completed');
      
      console.log(`🎉 RemoteMessagePoller: Successfully processed message ${message.id} in ${result.processingTime}ms`);
      
    } catch (error) {
      console.error(`❌ RemoteMessagePoller: Failed to process message ${message.id}:`, error);
      await this.updateMessageStatus(message.id, 'error');
      await this.logMessageError(message.id, error as Error);
    }
  }

  /**
   * Build conversation context from session history
   */
  private async buildConversationContext(sessionId: string): Promise<ChatMessage[]> {
    const { data, error } = await this.supabaseClient
      .from('chat_messages')
      .select('content, response')
      .eq('session_id', sessionId)
      .eq('status', 'completed')
      .order('created_at', { ascending: true })
      .limit(10); // Last 10 messages for context

    if (error) {
      console.error('Failed to fetch conversation context:', error);
      return [];
    }

    const messages: ChatMessage[] = [];
    
    data?.forEach(msg => {
      messages.push({ role: 'user', content: msg.content });
      if (msg.response) {
        messages.push({ role: 'assistant', content: msg.response });
      }
    });

    return messages;
  }

  /**
   * Log tool execution update
   */
  private async logToolExecution(messageId: string, execution: any): Promise<void> {
    try {
      if (execution.status === 'started') {
        // Log tool execution start
        await this.supabaseClient
          .from('tool_executions')
          .insert({
            id: execution.id,
            message_id: messageId,
            tool_name: execution.toolName,
            parameters: {},
            status: 'running'
          });
      } else if (execution.status === 'completed' || execution.status === 'failed') {
        // Update tool execution completion
        await this.supabaseClient
          .from('tool_executions')
          .update({
            result: execution.result || null,
            status: execution.status === 'completed' ? 'completed' : 'failed',
            error_message: execution.error || null,
            execution_time_ms: execution.executionTime || 0,
            completed_at: new Date().toISOString()
          })
          .eq('id', execution.id);
      }
    } catch (error) {
      console.error('Failed to log tool execution:', error);
    }
  }



  /**
   * Update message status
   */
  private async updateMessageStatus(
    messageId: string, 
    status: 'pending' | 'processing' | 'completed' | 'error'
  ): Promise<void> {
    const updateData: any = { 
      status,
      updated_at: new Date().toISOString()
    };
    
    if (status === 'processing') {
      updateData.processed_at = new Date().toISOString();
    } else if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { error } = await this.supabaseClient
      .from('chat_messages')
      .update(updateData)
      .eq('id', messageId);

    if (error) {
      console.error(`Failed to update message status to ${status}:`, error);
    }
  }

  /**
   * Log message processing error
   */
  private async logMessageError(messageId: string, error: Error): Promise<void> {
    const { error: updateError } = await this.supabaseClient
      .from('chat_messages')
      .update({ 
        error_message: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', messageId);

    if (updateError) {
      console.error('Failed to log message error:', updateError);
    }
  }



  /**
   * Handle polling errors with exponential backoff
   */
  private handlePollingError(error: Error): void {
    this.retryCount++;
    
    if (this.retryCount <= this.config.maxRetryAttempts) {
      const delay = Math.min(this.config.retryDelay * Math.pow(2, this.retryCount - 1), 30000);
      console.log(`Polling failed, retrying in ${delay}ms (attempt ${this.retryCount}/${this.config.maxRetryAttempts})`);
    } else {
      console.error(`Polling failed after ${this.config.maxRetryAttempts} attempts, continuing with normal interval`);
      this.retryCount = 0; // Reset to continue polling
    }
  }

  /**
   * Get current polling status
   */
  getStatus(): {
    isPolling: boolean;
    systemId: string;
    retryCount: number;
    lastPollTime?: Date;
  } {
    return {
      isPolling: this.isPolling,
      systemId: this.config.systemId,
      retryCount: this.retryCount
    };
  }
}