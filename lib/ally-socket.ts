import { io, Socket } from 'socket.io-client';

class AllySocketManager {
  private socket: Socket | null = null;
  private serverUrl: string;
  private connectionCallbacks: ((connected: boolean) => void)[] = [];

  constructor() {
    this.serverUrl = this.getStoredUrl() || process.env.NEXT_PUBLIC_SOCKET_URL || 'http://YOUR_DROPLET_IP:3001';
  }

  private getStoredUrl(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ally-server-url');
    }
    return null;
  }

  private storeUrl(url: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ally-server-url', url);
    }
  }

  public updateServerUrl(url: string): void {
    this.serverUrl = url;
    this.storeUrl(url);
    
    // Disconnect current connection if exists
    if (this.socket?.connected) {
      this.disconnect();
    }
  }

  public getServerUrl(): string {
    return this.serverUrl;
  }

  public onConnectionChange(callback: (connected: boolean) => void): void {
    this.connectionCallbacks.push(callback);
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionCallbacks.forEach(callback => callback(connected));
  }

  connect() {
    if (this.socket?.connected) return this.socket;

    console.log(`Connecting to Ally server: ${this.serverUrl}`);
    
    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to Ally middleware server');
      this.notifyConnectionChange(true);
      // Register as web client
      this.socket?.emit('web:connect', { clientId: 'web-dashboard' });
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.notifyConnectionChange(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.notifyConnectionChange(false);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.notifyConnectionChange(false);
    }
  }

  public isConnected(): boolean {
    return this.socket?.connected || false;
  }

  public async testConnection(url?: string): Promise<boolean> {
    const testUrl = url || this.serverUrl;
    
    try {
      // Test if the server is reachable by making a simple HTTP request
      const response = await fetch(`${testUrl}/api/ally/instances`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      return response.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  getSocket() {
    return this.socket;
  }

  sendCommand(token: string, command: string, payload?: any) {
    if (this.socket?.connected) {
      this.socket.emit('command:send', { token, command, payload });
    }
  }

  onAllyResponse(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('response:receive', callback);
    }
  }

  onAllyStatus(callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on('ally:status', callback);
    }
  }

  onAllyInstances(callback: (instances: any[]) => void) {
    if (this.socket) {
      this.socket.on('ally:instances', callback);
    }
  }
}

export const allySocketManager = new AllySocketManager();