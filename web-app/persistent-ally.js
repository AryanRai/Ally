const io = require('socket.io-client');

async function createPersistentAlly() {
  const serverUrl = 'http://ally.aryanrai.me:3001';
  
  try {
    // Step 1: Register
    console.log('🔄 Registering ally...');
    const response = await fetch(`${serverUrl}/api/ally/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allyId: 'persistent-ally-123',
        name: 'Persistent Test Ally'
      })
    });
    
    const data = await response.json();
    console.log('✅ Registered with token:', data.token);
    
    // Step 2: Connect via WebSocket and stay connected
    console.log('🔄 Connecting via WebSocket...');
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling']
    });
    
    socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      
      // Register as ally
      socket.emit('ally:connect', { token: data.token });
      console.log('📤 Sent ally:connect');
      
      // Send status
      socket.emit('ally:status', {
        status: 'online',
        capabilities: ['chat', 'test'],
        systemInfo: { platform: 'test', timestamp: new Date().toISOString() }
      });
      console.log('📤 Sent ally:status');
    });
    
    socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
    });
    
    socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error);
    });
    
    // Handle commands
    socket.on('command:receive', (data) => {
      console.log('📨 Received command:', data);
      
      // Send a response
      socket.emit('response:send', {
        response: `Hello! I received your command: ${data.command}`,
        type: 'success'
      });
    });
    
    console.log('🚀 Persistent ally is now running!');
    console.log('💡 Check your web dashboard - you should see "Persistent Test Ally" online');
    console.log('🔄 Press Ctrl+C to stop');
    
    // Keep alive
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down...');
      socket.disconnect();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createPersistentAlly();