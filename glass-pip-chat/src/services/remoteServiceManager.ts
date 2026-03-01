/**
 * Remote Service Manager
 * Requirements: 3.4, 13.1, 13.2, 13.3
 * 
 * Manages the lifecycle of remote message polling services
 * Integrates with existing Ally services and maintains service health
 */

import { OllamaService } from './ollamaService';
import { ToolCallingService } from './toolCallingService';
import { RemoteMessagePoller } from './remoteMessagePoller';
import { RemoteMessageProcessor } from './remoteMessageProcessor';
import { createRemotePollerConfig } from '../config/remotePollerConfig';

export interface RemoteServiceStatus {
  isRunning: boolean;
  pollerStatus: {
    isPolling: boolean;
    systemId: string;
    retryCount: number;
  };
  processorStatus: {
    ollamaConnected: boolean;
    toolCallingEnabled: boolean;
  };
  lastError?: string;
  startTime?: Date;
}

export class RemoteServiceManager {
  private ollamaService: OllamaService;
  private toolCallingService: ToolCallingService;
  private messagePoller?: RemoteMessagePoller;
  private messageProcessor?: RemoteMessageProcessor;
  private isInitialized = false;
  private startTime?: Date;
  private lastError?: string;

  constructor() {
    // Initialize core services
    this.ollamaService = new OllamaService({
      baseUrl: 'http://localhost:11434',
      defaultModel: 'llama3.2',
      timeout: 60000,
      streamTimeout: 120000
    });

    // Initialize tool calling service with proper dependencies
    // Note: This is a simplified initialization - in production you'd want to properly initialize these
    const toolManager = {} as any; // Placeholder
    const toolRegistry = {} as any; // Placeholder  
    const toolExecutor = {} as any; // Placeholder
    
    this.toolCallingService = new ToolCallingService(
      this.ollamaService,
      toolManager,
      toolRegistry,
      toolExecutor,
      {
        enableToolCalling: true,
        maxToolCalls: 5,
        toolCallTimeout: 30000,
        enableMultiStepReasoning: true,
        toolCallPromptTemplate: 'default'
      }
    );
  }

  /**
   * Initialize and start remote services
   */
  async start(): Promise<void> {
    if (this.isInitialized) {
      console.log('Remote services are already running');
      return;
    }

    try {
      console.log('Starting remote service manager...');
      
      // Load configuration
      const config = createRemotePollerConfig();
      
      // Initialize message processor with streaming config
      this.messageProcessor = new RemoteMessageProcessor(
        this.ollamaService,
        this.toolCallingService,
        {
          supabaseUrl: config.supabaseUrl,
          supabaseServiceKey: '', // Not used — browser client uses publishable key + auth session
          batchSize: 3,
          flushInterval: 100,
          maxRetries: 3,
          retryDelay: 1000
        }
      );
      
      // Initialize message poller
      this.messagePoller = new RemoteMessagePoller(
        config,
        this.ollamaService,
        this.toolCallingService
      );

      // Start polling
      await this.messagePoller.startPolling();
      
      this.isInitialized = true;
      this.startTime = new Date();
      this.lastError = undefined;
      
      console.log('Remote service manager started successfully');
      
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to start remote service manager:', error);
      throw error;
    }
  }

  /**
   * Stop remote services
   */
  async stop(): Promise<void> {
    if (!this.isInitialized) {
      console.log('Remote services are not running');
      return;
    }

    try {
      console.log('Stopping remote service manager...');
      
      if (this.messagePoller) {
        await this.messagePoller.stopPolling();
        this.messagePoller = undefined;
      }
      
      if (this.messageProcessor) {
        await this.messageProcessor.shutdown();
        this.messageProcessor = undefined;
      }
      
      this.isInitialized = false;
      this.startTime = undefined;
      
      console.log('Remote service manager stopped');
      
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to stop remote service manager:', error);
      throw error;
    }
  }

  /**
   * Restart remote services
   */
  async restart(): Promise<void> {
    console.log('Restarting remote service manager...');
    
    if (this.isInitialized) {
      await this.stop();
    }
    
    await this.start();
  }

  /**
   * Get current service status
   */
  getStatus(): RemoteServiceStatus {
    const pollerStatus = this.messagePoller?.getStatus() || {
      isPolling: false,
      systemId: 'unknown',
      retryCount: 0
    };

    const processorStatus = this.messageProcessor?.getStatus() || {
      ollamaConnected: false,
      toolCallingEnabled: false,
      activeStreams: []
    };

    return {
      isRunning: this.isInitialized,
      pollerStatus,
      processorStatus,
      lastError: this.lastError,
      startTime: this.startTime
    };
  }

  /**
   * Check if services are healthy
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Check if services are running
      if (!this.isInitialized) {
        issues.push('Remote services are not initialized');
      }

      // Check Ollama connection
      try {
        await this.ollamaService.getModels();
      } catch (error) {
        issues.push('Ollama service is not accessible');
      }

      // Check message poller status
      if (this.messagePoller) {
        const status = this.messagePoller.getStatus();
        if (!status.isPolling) {
          issues.push('Message poller is not active');
        }
        if (status.retryCount > 0) {
          issues.push(`Message poller has ${status.retryCount} retry attempts`);
        }
      } else {
        issues.push('Message poller is not initialized');
      }

      return {
        healthy: issues.length === 0,
        issues
      };

    } catch (error) {
      issues.push(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        healthy: false,
        issues
      };
    }
  }

  /**
   * Get service metrics
   */
  getMetrics(): {
    uptime: number;
    isRunning: boolean;
    systemId: string;
    lastError?: string;
  } {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    const status = this.getStatus();

    return {
      uptime,
      isRunning: status.isRunning,
      systemId: status.pollerStatus.systemId,
      lastError: this.lastError
    };
  }
}

// Singleton instance for global access
export const remoteServiceManager = new RemoteServiceManager();