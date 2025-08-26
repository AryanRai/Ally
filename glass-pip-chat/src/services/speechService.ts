/**
 * Speech Service Client for Ally
 * Handles communication with the Python speech service via WebSocket
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface SpeechConfig {
  websocketHost: string;
  websocketPort: number;
  autoReconnect: boolean;
  reconnectInterval: number;
}

export interface SpeechRecognitionResult {
  text: string;
  confidence: number;
  timestamp: number;
}

export interface SpeechSynthesisRequest {
  text: string;
  voice?: string;
  speed?: number;
}

export interface GGWaveRequest {
  text: string;
  protocol?: number;
  volume?: number;
}

export interface ServiceStatus {
  listening: boolean;
  device: string;
  models_loaded: boolean;
}

interface QueuedTTSMessage {
  id: string;
  request: SpeechSynthesisRequest;
  timestamp: number;
}

export class SpeechServiceClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: SpeechConfig;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isConnected = false;
  
  // TTS Queue management
  private ttsQueue: QueuedTTSMessage[] = [];
  private isProcessingTTS = false;
  private currentTTSId: string | null = null;

  constructor(config: Partial<SpeechConfig> = {}) {
    super();
    
    this.config = {
      websocketHost: 'localhost',
      websocketPort: 8765,
      autoReconnect: true,
      reconnectInterval: 5000,
      ...config
    };
  }

  /**
   * Connect to the speech service
   */
  async connect(): Promise<void> {
    if (this.isConnecting || this.isConnected) {
      console.log('Already connecting or connected to speech service');
      return;
    }

    this.isConnecting = true;
    const url = `ws://${this.config.websocketHost}:${this.config.websocketPort}`;
    console.log(`Attempting to connect to speech service at ${url}`);

    try {
      this.ws = new WebSocket(url);
      
      this.ws.on('open', () => {
        console.log('✅ Connected to speech service');
        this.isConnecting = false;
        this.isConnected = true;
        this.emit('connected');
        
        // Clear any reconnect timer
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('📨 Received message from speech service:', message.command);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      this.ws.on('close', (code, reason) => {
        console.log(`❌ Disconnected from speech service (code: ${code}, reason: ${reason})`);
        this.isConnected = false;
        this.isConnecting = false;
        this.emit('disconnected');
        
        // Auto-reconnect if enabled
        if (this.config.autoReconnect && !this.reconnectTimer) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error) => {
        console.error('❌ Speech service WebSocket error:', error);
        this.isConnecting = false;
        this.isConnected = false;
        this.emit('error', error);
        
        // Schedule reconnect on error
        if (this.config.autoReconnect && !this.reconnectTimer) {
          this.scheduleReconnect();
        }
      });

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Disconnect from the speech service
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Clear TTS queue on disconnect
    this.clearTTSQueue();
    this.isProcessingTTS = false;
    this.currentTTSId = null;
    
    this.isConnected = false;
    this.isConnecting = false;
  }

  /**
   * Check if connected to speech service
   */
  isServiceConnected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send a command to the speech service
   */
  private sendCommand(command: string, payload: any = {}): void {
    if (!this.isServiceConnected()) {
      throw new Error('Not connected to speech service');
    }

    const message = {
      command,
      payload,
      timestamp: Date.now()
    };

    this.ws!.send(JSON.stringify(message));
  }

  /**
   * Handle incoming messages from speech service
   */
  private handleMessage(message: any): void {
    const { command, payload } = message;

    switch (command) {
      case 'speech_recognized':
        this.emit('speechRecognized', payload as SpeechRecognitionResult);
        break;
        
      case 'speech_generated':
        this.emit('speechGenerated', payload);
        break;
        
      case 'speech_error':
        this.emit('speechError', payload.error);
        break;
        
      // Streaming TTS events
      case 'tts_stream_start':
        this.emit('ttsStreamStart', payload);
        break;
        
      case 'tts_stream_chunk':
        this.emit('ttsStreamChunk', payload);
        break;
        
      case 'tts_stream_complete':
        this.emit('ttsStreamComplete', payload);
        // Process next TTS message in queue
        this.onTTSComplete();
        break;
        
      case 'tts_stream_error':
        this.emit('ttsStreamError', payload.error);
        // Process next TTS message in queue even on error
        this.onTTSComplete();
        break;
        
      case 'ggwave_sent':
        this.emit('ggwaveSent', payload);
        break;
        
      case 'ggwave_error':
        this.emit('ggwaveError', payload.error);
        break;
        
      case 'status':
        this.emit('statusUpdate', payload as ServiceStatus);
        break;
        
      case 'listening_started':
        this.emit('listeningStarted');
        break;
        
      case 'listening_stopped':
        this.emit('listeningStopped');
        break;
        
      default:
        console.warn('Unknown command from speech service:', command);
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('Attempting to reconnect to speech service...');
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, this.config.reconnectInterval);
  }

  /**
   * Generate unique ID for TTS messages
   */
  private generateTTSId(): string {
    return `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Process next TTS message in queue
   */
  private processNextTTS(): void {
    if (this.isProcessingTTS || this.ttsQueue.length === 0) {
      return;
    }

    const nextMessage = this.ttsQueue.shift()!;
    this.isProcessingTTS = true;
    this.currentTTSId = nextMessage.id;

    console.log(`🎵 Processing TTS message ${nextMessage.id} (${this.ttsQueue.length} remaining in queue)`);
    
    // Send the actual TTS command
    this.sendCommand('synthesize_speech', { 
      ...nextMessage.request, 
      streaming: true,
      messageId: nextMessage.id 
    });
  }

  /**
   * Handle TTS completion
   */
  private onTTSComplete(): void {
    console.log(`✅ TTS message ${this.currentTTSId} completed`);
    this.isProcessingTTS = false;
    this.currentTTSId = null;
    
    // Process next message in queue
    this.processNextTTS();
  }

  /**
   * Add TTS message to queue
   */
  private queueTTSMessage(request: SpeechSynthesisRequest): string {
    const id = this.generateTTSId();
    const queuedMessage: QueuedTTSMessage = {
      id,
      request,
      timestamp: Date.now()
    };

    this.ttsQueue.push(queuedMessage);
    console.log(`📝 Queued TTS message ${id} (queue length: ${this.ttsQueue.length})`);
    
    // Start processing if not already processing
    this.processNextTTS();
    
    return id;
  }

  // Public API methods

  /**
   * Start listening for speech
   */
  startListening(): void {
    this.sendCommand('start_listening');
  }

  /**
   * Stop listening for speech
   */
  stopListening(): void {
    this.sendCommand('stop_listening');
  }

  /**
   * Synthesize speech from text (queued for sequential playback)
   */
  synthesizeSpeech(request: SpeechSynthesisRequest): string {
    return this.queueTTSMessage(request);
  }

  /**
   * Synthesize speech from text with streaming (queued for sequential playback)
   */
  synthesizeSpeechStreaming(request: SpeechSynthesisRequest): string {
    return this.queueTTSMessage(request);
  }

  /**
   * Synthesize speech immediately (bypasses queue - use with caution)
   */
  synthesizeSpeechImmediate(request: SpeechSynthesisRequest): void {
    console.log('⚡ Sending immediate TTS (bypassing queue)');
    this.sendCommand('synthesize_speech', { ...request, streaming: true });
  }

  /**
   * Send text via ggwave
   */
  sendGGWave(request: GGWaveRequest): void {
    this.sendCommand('send_ggwave', request);
  }

  /**
   * Get service status
   */
  getStatus(): void {
    this.sendCommand('get_status');
  }

  /**
   * Update service configuration
   */
  updateConfig(config: Partial<SpeechConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clear TTS queue
   */
  clearTTSQueue(): void {
    const queueLength = this.ttsQueue.length;
    this.ttsQueue = [];
    console.log(`🗑️ Cleared TTS queue (${queueLength} messages removed)`);
  }

  /**
   * Get TTS queue status
   */
  getTTSQueueStatus(): { queueLength: number; isProcessing: boolean; currentId: string | null } {
    return {
      queueLength: this.ttsQueue.length,
      isProcessing: this.isProcessingTTS,
      currentId: this.currentTTSId
    };
  }

  /**
   * Skip current TTS and move to next
   */
  skipCurrentTTS(): void {
    if (this.isProcessingTTS) {
      console.log(`⏭️ Skipping current TTS message ${this.currentTTSId}`);
      // Send stop command to interrupt current TTS
      this.sendCommand('stop_tts');
      this.onTTSComplete();
    }
  }
}

// Singleton instance for use in Electron main process
let speechServiceInstance: SpeechServiceClient | null = null;

export function getSpeechService(): SpeechServiceClient {
  if (!speechServiceInstance) {
    speechServiceInstance = new SpeechServiceClient();
  }
  return speechServiceInstance;
}