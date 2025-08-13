import { io, Socket } from 'socket.io-client';

class AllySocketManager {
  private socket: Socket | null = null;
  private serverUrl: string;

  constructor() {
    this.serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
  }

  connect() {
    if (this.socket?.connected) return this.socket;

    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to Ally middleware server');
      // Register as web client
      this.socket?.emit('web:connect', { clientId: 'web-dashboard' });
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
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