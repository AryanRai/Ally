const io = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');

class AllyClient {
  constructor(serverUrl, allyConfig = {}) {
    this.serverUrl = serverUrl;
    this.allyId = allyConfig.allyId || `ally-${Date.now()}`;
    this.name = allyConfig.name || 'Ally Desktop';
    this.token = null;
    this.socket = null;
    this.isConnected = false;
    
    // Your AI model integration goes here
    this.aiModel = allyConfig.aiModel || null;
  }

  async initialize() {
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

      const data = await response.json();
      this.token = data.token;
      
      console.log(`Ally registered with token: ${this.token}`);
      
      // Connect to WebSocket
      this.connect();
      
    } catch (error) {
      console.error('Failed to initialize Ally:', error);
    }
  }

  connect() {
    if (!this.token) {
      console.error('No token available. Call initialize() first.');
      return;
    }

    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to middleware server');
      this.isConnected = true;
      
      // Register as Ally instance
      this.socket.emit('ally:connect', { token: this.token });
      
      // Send initial status
      this.sendStatus({
        status: 'online',
        capabilities: ['chat', 'code-analysis', 'file-operations'],
        systemInfo: {
          platform: process.platform,
          nodeVersion: process.version,
          memory: process.memoryUsage()
        }
      });
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.isConnected = false;
    });

    this.socket.on('command:receive', async (data) => {
      console.log('Received command:', data);
      await this.handleCommand(data);
    });

    // Reconnection logic
    this.socket.on('reconnect', () => {
      console.log('Reconnected to server');
      this.socket.emit('ally:connect', { token: this.token });
    });
  }

  async handleCommand(data) {
    const { command, payload } = data;
    
    try {
      let response = '';
      
      switch (command) {
        case 'chat':
          response = await this.handleChatCommand(payload);
          break;
          
        case 'status':
          response = this.getSystemStatus();
          break;
          
        case 'execute':
          response = await this.executeCode(payload);
          break;
          
        default:
          response = `Unknown command: ${command}`;
      }
      
      this.sendResponse(response, 'success');
      
    } catch (error) {
      console.error('Error handling command:', error);
      this.sendResponse(`Error: ${error.message}`, 'error');
    }
  }

  async handleChatCommand(payload) {
    const { message } = payload;
    
    // This is where you integrate with your AI model
    // For now, we'll return a simple response
    if (this.aiModel && typeof this.aiModel.generate === 'function') {
      try {
        const response = await this.aiModel.generate(message);
        return response;
      } catch (error) {
        return `AI Model Error: ${error.message}`;
      }
    }
    
    // Fallback response
    return `Ally received: "${message}". AI model integration needed for intelligent responses.`;
  }

  async executeCode(payload) {
    const { code, language } = payload;
    
    // Basic code execution (be careful with security!)
    if (language === 'javascript') {
      try {
        const result = eval(code);
        return `Execution result: ${result}`;
      } catch (error) {
        return `Execution error: ${error.message}`;
      }
    }
    
    return `Code execution not supported for language: ${language}`;
  }

  getSystemStatus() {
    return {
      allyId: this.allyId,
      name: this.name,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      platform: process.platform,
      nodeVersion: process.version,
      connected: this.isConnected,
      timestamp: new Date().toISOString()
    };
  }

  sendResponse(response, type = 'message') {
    if (this.socket && this.isConnected) {
      this.socket.emit('response:send', { response, type });
    }
  }

  sendStatus(statusData) {
    if (this.socket && this.isConnected) {
      this.socket.emit('ally:status', statusData);
    }
  }

  // Method to integrate your AI model
  setAIModel(aiModel) {
    this.aiModel = aiModel;
    console.log('AI model integrated with Ally');
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

module.exports = AllyClient;