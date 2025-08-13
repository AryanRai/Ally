import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { REMOTE_CONFIG, getServerUrl } from '../config/remote';

interface AllyConfig {
  allyId?: string;
  name?: string;
  serverUrl?: string;
}

interface CommandData {
  command: string;
  payload: any;
}

interface StatusData {
  status: string;
  capabilities?: string[];
  systemInfo?: any;
}

export class AllyRemoteClient {
  private socket: Socket | null = null;
  private serverUrl: string;
  private allyId: string;
  private name: string;
  private token: string | null = null;
  private isConnected: boolean = false;
  private onMessageCallback?: (message: string) => void;
  private onStatusCallback?: (status: string) => void;

  constructor(config: AllyConfig = {}) {
    this.serverUrl = config.serverUrl || getServerUrl();
    this.allyId = config.allyId || `ally-glass-${Date.now()}`;
    this.name = config.name || REMOTE_CONFIG.DEFAULT_ALLY_NAME;
  }

  async initialize(): Promise<boolean> {
    try {
      // Register with the server to get a token
      const response = await fetch(`${this.serverUrl}/api/ally/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allyId: this.allyId,
          name: this.name
        })
      });

      if (!response.ok) {
        throw new Error(`Registration failed: ${response.statusText}`);
      }

      const data = await response.json();
      this.token = data.token;
      
      console.log(`Ally registered with token: ${this.token}`);
      
      // Connect to WebSocket
      this.connect();
      return true;
      
    } catch (error) {
      console.error('Failed to initialize Ally:', error);
      this.onStatusCallback?.('Failed to connect to remote server');
      return false;
    }
  }

  private connect(): void {
    if (!this.token) {
      console.error('No token available. Call initialize() first.');
      return;
    }

    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to Ally middleware server');
      this.isConnected = true;
      this.onStatusCallback?.('Connected to remote server');
      
      // Register as Ally instance
      this.socket?.emit('ally:connect', { token: this.token });
      
      // Send initial status
      this.sendStatus({
        status: 'online',
        capabilities: ['chat', 'glass-pip-interface'],
        systemInfo: {
          platform: navigator.platform,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
        }
      });
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.isConnected = false;
      this.onStatusCallback?.('Disconnected from server');
    });

    this.socket.on('command:receive', async (data: CommandData) => {
      console.log('Received command:', data);
      await this.handleCommand(data);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.onStatusCallback?.('Connection error');
    });

    // Reconnection logic
    this.socket.on('reconnect', () => {
      console.log('Reconnected to server');
      this.onStatusCallback?.('Reconnected to server');
      this.socket?.emit('ally:connect', { token: this.token });
    });
  }

  private async handleCommand(data: CommandData): Promise<void> {
    const { command, payload } = data;
    
    try {
      let response = '';
      
      switch (command) {
        case 'chat':
          response = await this.handleChatCommand(payload);
          break;
          
        case 'status':
          response = JSON.stringify(this.getSystemStatus(), null, 2);
          break;
          
        case 'ping':
          response = 'pong';
          break;
          
        default:
          response = `Unknown command: ${command}`;
      }
      
      this.sendResponse(response, 'success');
      
    } catch (error) {
      console.error('Error handling command:', error);
      this.sendResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }

  private async handleChatCommand(payload: any): Promise<string> {
    const { message } = payload;
    
    // Forward the message to the chat interface
    if (this.onMessageCallback) {
      this.onMessageCallback(message);
      return `Message forwarded to Glass PiP Chat: "${message}"`;
    }
    
    return `Received message: "${message}" (No chat handler configured)`;
  }

  private getSystemStatus(): any {
    return {
      allyId: this.allyId,
      name: this.name,
      connected: this.isConnected,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      token: this.token
    };
  }

  private sendResponse(response: string, type: string = 'message'): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('response:send', { response, type });
    }
  }

  private sendStatus(statusData: StatusData): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('ally:status', statusData);
    }
  }

  // Public methods for integration
  public setMessageHandler(callback: (message: string) => void): void {
    this.onMessageCallback = callback;
  }

  public setStatusHandler(callback: (status: string) => void): void {
    this.onStatusCallback = callback;
  }

  public sendMessageToRemote(message: string): void {
    this.sendResponse(message, 'chat_response');
  }

  public updateServerUrl(url: string): void {
    this.serverUrl = url;
  }

  public getConnectionStatus(): { connected: boolean; token: string | null } {
    return {
      connected: this.isConnected,
      token: this.token
    };
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.onStatusCallback?.('Disconnected');
  }
}