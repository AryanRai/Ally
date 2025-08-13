const io = require('socket.io-client');

// Test Ally registration and connection
async function testAllyConnection() {
    console.log('Testing Ally connection...');

    const serverUrl = 'http://ally.aryanrai.me:3001';

    try {
        // Step 1: Register Ally
        console.log('1. Registering Ally...');
        const response = await fetch(`${serverUrl}/api/ally/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                allyId: 'test-ally-123',
                name: 'Test Ally Instance'
            })
        });

        const data = await response.json();
        console.log('Registration response:', data);

        // Step 2: Connect via WebSocket
        console.log('2. Connecting via WebSocket...');
        const socket = io(serverUrl, {
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('✅ Connected to server');

            // Register as Ally instance
            socket.emit('ally:connect', { token: data.token });
            console.log('📤 Sent ally:connect with token:', data.token);

            // Send status
            socket.emit('ally:status', {
                status: 'online',
                capabilities: ['chat', 'test'],
                systemInfo: { platform: 'test', timestamp: new Date().toISOString() }
            });
            console.log('📤 Sent ally:status');

            console.log('✅ Ally registered with token:', data.token);

            // Test: Check if we can fetch instances from API
            setTimeout(async () => {
                try {
                    const checkResponse = await fetch(`${serverUrl}/api/ally/instances`);
                    const instances = await checkResponse.json();
                    console.log('🔍 Current instances on server:', instances);
                } catch (err) {
                    console.error('❌ Error checking instances:', err);
                }
            }, 2000);
        });

        socket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
        });

        socket.on('connect_error', (error) => {
            console.error('❌ Connection error:', error);
        });

        // Keep alive indefinitely - press Ctrl+C to stop
        console.log('✅ Test Ally is now running. Check your web dashboard!');
        console.log('Press Ctrl+C to stop.');

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\nShutting down...');
            socket.disconnect();
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

testAllyConnection();