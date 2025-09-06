/**
 * Remote Message Poller Service
 * Requirements: 3.1, 3.2, 3.3
 * 
 * Polls Supabase for new remote messages and processes them through the local Ally system
 * Implements heartbeat system for local system registration
 * Handles message fetching with proper filtering and error handling
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { OllamaService, ChatMessage } from './ollamaService';
import { ToolCallingService } from './toolCallingService';
import { RemoteMessageProcessor, ProcessMessageRequest } from './remoteMessageProcessor';

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
    
    this.supabaseClient = createClient(
      config.supabaseUrl,
      config.supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  /**
   * Start the polling service
   */
  async startPolling(): Promise<void> {
    if (this.isPolling) {
      console.log('Message poller is already running');
      return;
    }

    console.log(`Starting remote message poller for system: ${this.config.systemId}`);
    
    try {
      // Register the local system
      await this.registerLocalSystem();
      
      this.isPolling = true;
      this.retryCount = 0;
      
      // Start polling loop
      this.scheduleNextPoll();
      
      // Start heartbeat
      this.startHeartbeat();
      
      console.log('Remote message poller started successfully');
    } catch (error) {
      console.error('Failed to start message poller:', error);
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
    const systemData = {
      id: this.config.systemId,
      name: this.config.systemName,
      status: 'online',
      capabilities: {
        models: ['llama3.2', 'llama3.1', 'codellama'], // Default models
        tools: ['file_operations', 'system_commands', 'web_search'], // Default tools
        features: ['streaming', 'tool_calling', 'voice_mode']
      },
      metadata: {
        version: '1.0.0',
        platform: process.platform,
        nodeVersion: process.version
      },
      last_heartbeat: new Date().toISOString()
    };

    const { error } = await this.supabaseClient
      .from('local_systems')
      .upsert(systemData, { onConflict: 'id' });

    if (error) {
      throw new Error(`Failed to register local system: ${error.message}`);
    }

    console.log(`Local system registered: ${this.config.systemId}`);
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
    await this.supabaseClient.rpc('update_system_heartbeat', {
      system_id: this.config.systemId,
      new_status: 'online'
    });
  }

  /**
   * Update system status
   */
  private async updateSystemStatus(status: 'online' | 'offline' | 'busy'): Promise<void> {
    const { error } = await this.supabaseClient
      .from('local_systems')
      .update({ 
        status,
        last_heartbeat: new Date().toISOString()
      })
      .eq('id', this.config.systemId);

    if (error) {
      console.error('Failed to update system status:', error);
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
      const messages = await this.fetchPendingMessages();
      
      if (messages.length > 0) {
        console.log(`Found ${messages.length} pending messages`);
        
        for (const message of messages) {
          await this.processMessage(message);
        }
      }
      
      // Reset retry count on successful poll
      this.retryCount = 0;
      
    } catch (error) {
      console.error('Polling error:', error);
      this.handlePollingError(error as Error);
    }
  }

  /**
   * Fetch pending messages from Supabase
   */
  private async fetchPendingMessages(): Promise<RemoteMessage[]> {
    const { data, error } = await this.supabaseClient
      .from('chat_messages')
      .select('*')
      .eq('status', 'pending')
      .eq('is_remote', true)
      .eq('local_system_id', this.config.systemId)
      .order('created_at', { ascending: true })
      .limit(this.config.batchSize);

    if (error) {
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Process a single message using the integrated message processor
   */
  private async processMessage(message: RemoteMessage): Promise<void> {
    console.log(`Processing message ${message.id}: ${message.content.substring(0, 100)}...`);
    
    try {
      // Update status to processing
      await this.updateMessageStatus(message.id, 'processing');
      
      // Create processing request
      const request: ProcessMessageRequest = {
        messageId: message.id,
        content: message.content,
        sessionId: message.session_id,
        userId: message.user_id,
        onToolExecution: async (execution) => {
          await this.logToolExecution(message.id, execution);
        }
      };

      // Process through the integrated message processor
      const result = await this.messageProcessor.processMessage(request);
      
      if (result.error) {
        throw new Error(result.error);
      }

      // Tool results are now handled by the message processor's streaming

      // Mark as completed
      await this.updateMessageStatus(message.id, 'completed');
      
      console.log(`Successfully processed message ${message.id} in ${result.processingTime}ms`);
      
    } catch (error) {
      console.error(`Failed to process message ${message.id}:`, error);
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