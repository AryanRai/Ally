// Simple test to register an ally and check if it persists
async function testServer() {
  const serverUrl = 'http://ally.aryanrai.me:3001';
  
  try {
    console.log('1. Testing server registration...');
    
    // Register an ally
    const response = await fetch(`${serverUrl}/api/ally/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allyId: 'simple-test-ally',
        name: 'Simple Test Ally'
      })
    });
    
    const data = await response.json();
    console.log('✅ Registration successful:', data);
    
    // Check if it appears in instances
    const instancesResponse = await fetch(`${serverUrl}/api/ally/instances`);
    const instances = await instancesResponse.json();
    console.log('📋 Current instances:', instances);
    
    if (instances.length > 0) {
      console.log('✅ Server is storing instances correctly!');
    } else {
      console.log('❌ Server is not storing instances - this is the bug!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testServer();