// Test script to verify Supabase setup
const SUPABASE_URL = 'https://delzfrzfwhycdzozxwgp.supabase.co';

async function testSetup() {
  console.log('🧪 Testing Supabase Remote Chat API Setup...\n');

  try {
    // Test 1: Check if Edge Functions are deployed
    console.log('1. Testing Edge Functions deployment...');
    
    const authResponse = await fetch(`${SUPABASE_URL}/functions/v1/auth/user`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer invalid-token'
      }
    });
    
    if (authResponse.status === 401) {
      console.log('✅ Auth function is deployed and responding correctly');
    } else {
      console.log('❌ Auth function deployment issue');
    }

    const messagesResponse = await fetch(`${SUPABASE_URL}/functions/v1/messages`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer invalid-token'
      }
    });
    
    if (messagesResponse.status === 401) {
      console.log('✅ Messages function is deployed and responding correctly');
    } else {
      console.log('❌ Messages function deployment issue');
    }

    const streamResponse = await fetch(`${SUPABASE_URL}/functions/v1/stream?sessionId=test`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer invalid-token'
      }
    });
    
    if (streamResponse.status === 401) {
      console.log('✅ Stream function is deployed and responding correctly');
    } else {
      console.log('❌ Stream function deployment issue');
    }

    const systemsResponse = await fetch(`${SUPABASE_URL}/functions/v1/systems`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer invalid-token'
      }
    });
    
    if (systemsResponse.status === 401) {
      console.log('✅ Systems function is deployed and responding correctly');
    } else {
      console.log('❌ Systems function deployment issue');
    }

    console.log('\n2. Testing CORS configuration...');
    
    // Test CORS preflight
    const corsResponse = await fetch(`${SUPABASE_URL}/functions/v1/auth`, {
      method: 'OPTIONS'
    });
    
    if (corsResponse.ok) {
      console.log('✅ CORS is properly configured');
    } else {
      console.log('❌ CORS configuration issue');
    }

    console.log('\n✅ Basic setup verification complete!');
    console.log('\n📋 Next steps:');
    console.log('   1. Set up authentication (create user account)');
    console.log('   2. Implement web interface (Task 4)');
    console.log('   3. Implement local message poller (Task 5)');
    console.log('   4. Test end-to-end message flow');

  } catch (error) {
    console.error('❌ Setup test failed:', error.message);
  }
}

// Run the test if this script is executed directly
if (typeof window === 'undefined') {
  testSetup();
}

module.exports = { testSetup };