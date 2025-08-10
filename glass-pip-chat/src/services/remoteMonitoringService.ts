interface RemoteMonitoringConfig {
  serverUrl: string;
  instanceName: string;
  heartbeatInterval: number;
}

interface AllyStatus {
  id: string;
  token: string;
  name: string;
  status: 'online' | 'offline';
  lastSeen: number;
  messages: any[];
  isTyping: boolean;
  currentModel: string;
  platform: string;
}

export class RemoteMonitoringService {
  private config: RemoteMonitoringConfig;
  private status: AllyStatus | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isRegistered = false;

  constructor(config: Partial<RemoteMonitoringConfig> = {}) {
    this.config = {
      serverUrl: config.serverUrl || 'https://aryanrai.me',
      instanceName: config.instanceName || 'Ally Desktop',
      heartbeatInterval: config.heartbeatInterval || 10000, // 10 seconds
    };
  }

  // Register this Ally instance with the remote server
  async register(): Promise<{ id: string; token: string } | null> {
    try {
      const response = await fetch(`${this.config.serverUrl}/api/ally`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: this.config.instanceName,
          platform: this.getPlatform(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Registration failed: ${response.status}`);
      }

      const data = await response.json();
      this.status = {
        id: data.id,
        token: data.token,
        name: this.config.instanceName,
        status: 'online',
        lastSeen: Date.now(),
        messages: [],
        isTyping: false,
        currentModel: 'llama3.2',
        platform: this.getPlatform(),
      };

      this.isRegistered = true;
      this.startHeartbeat();
      
      console.log('Ally instance registered successfully:', data.id);
      return { id: data.id, token: data.token };
    } catch (error) {
      console.error('Failed to register Ally instance:', error);
      return null;
    }
  }

  // Start sending heartbeat updates
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);
  }

  // Send heartbeat update to server
  private async sendHeartbeat(): Promise<void> {
    if (!this.status || !this.isRegistered) return;

    try {
      const response = await fetch(`${this.config.serverUrl}/api/ally/${this.status.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: this.status.token,
          status: this.status.status,
          messages: this.status.messages,
          isTyping: this.status.isTyping,
          currentModel: this.status.currentModel,
        }),
      });

      if (!response.ok) {
        console.warn('Heartbeat failed:', response.status);
      }
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
    }
  }

  // Update local status
  updateStatus(updates: Partial<Pick<AllyStatus, 'status' | 'messages' | 'isTyping' | 'currentModel'>>): void {
    if (!this.status) return;

    this.status = { ...this.status, ...updates, lastSeen: Date.now() };
  }

  // Unregister from server
  async unregister(): Promise<void> {
    if (!this.status || !this.isRegistered) return;

    try {
      await fetch(`${this.config.serverUrl}/api/ally/${this.status.id}?token=${this.status.token}`, {
        method: 'DELETE',
      });

      this.isRegistered = false;
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      console.log('Ally instance unregistered successfully');
    } catch (error) {
      console.error('Failed to unregister Ally instance:', error);
    }
  }

  // Get platform information
  private getPlatform(): string {
    if (typeof window !== 'undefined') {
      return window.navigator.platform || 'unknown';
    }
    return process.platform || 'unknown';
  }

  // Get current status
  getStatus(): AllyStatus | null {
    return this.status;
  }

  // Check if registered
  isInstanceRegistered(): boolean {
    return this.isRegistered;
  }

  // Update configuration
  updateConfig(newConfig: Partial<RemoteMonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Get configuration
  getConfig(): RemoteMonitoringConfig {
    return { ...this.config };
  }
}