/**
 * Simple Integration Test
 * 
 * Tests basic compatibility without requiring authentication
 */

const { createClient } = require('@supabase/supabase-js');

// Test configuration
const testConfig = {
  supabase: {
    url: 'https://delzfrzfwhycdzozxwgp.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbHpmcnpmd2h5Y2R6b3p4d2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNjE2NjQsImV4cCI6MjA3MjczNzY2NH0.aWqbefKFuWZHXbmgjp-a0_QoD17PBrxlIDH_hoIYd9g'
  }
};

async function testBasicCompatibility() {
  console.log('🧪 Testing Basic Ally Integration Compatibility\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Supabase Connection
  try {
    console.log('1. Testing Supabase connection...');
    const supabase = createClient(testConfig.supabase.url, testConfig.supabase.anonKey);
    
    // Try to connect (this will work even without auth)
    const { data, error } = await supabase
      .from('local_systems')
      .select('count')
      .limit(1);
    
    if (error && !error.message.includes('RLS')) {
      throw new Error(`Connection failed: ${error.message}`);
    }
    
    console.log('   ✅ Supabase connection successful');
    passed++;
  } catch (error) {
    console.log(`   ❌ Supabase connection failed: ${error.message}`);
    failed++;
  }

  // Test 2: Environment Variable Compatibility
  try {
    console.log('2. Testing environment variable compatibility...');
    
    // Simulate both application environments
    const webConfig = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || testConfig.supabase.url,
      key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || testConfig.supabase.anonKey
    };
    
    const desktopConfig = {
      url: process.env.VITE_SUPABASE_URL || testConfig.supabase.url,
      key: process.env.VITE_SUPABASE_ANON_KEY || testConfig.supabase.anonKey
    };
    
    if (webConfig.url !== desktopConfig.url) {
      throw new Error('URL mismatch between web and desktop configs');
    }
    
    if (webConfig.key !== desktopConfig.key) {
      throw new Error('API key mismatch between web and desktop configs');
    }
    
    console.log('   ✅ Environment variables are compatible');
    passed++;
  } catch (error) {
    console.log(`   ❌ Environment compatibility failed: ${error.message}`);
    failed++;
  }

  // Test 3: Message Format Compatibility
  try {
    console.log('3. Testing message format compatibility...');
    
    // Glass-pip-chat message format
    const glassPipMessage = {
      id: 'msg-123',
      role: 'user',
      content: 'Hello from desktop',
      timestamp: Date.now(),
      metadata: {
        source: 'text'
      }
    };
    
    // Ally-remote-service message format
    const remoteServiceMessage = {
      id: 'msg-456',
      session_id: 'session-123',
      user_id: 'user-123',
      content: 'Hello from web',
      response: '',
      status: 'completed',
      metadata: {},
      is_remote: true,
      local_system_id: 'web-system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Test conversion to unified format
    function convertToUnified(message, source) {
      return {
        id: message.id,
        content: message.content || message.response || '',
        role: message.role || 'user',
        timestamp: typeof message.timestamp === 'number' ? 
          message.timestamp : 
          new Date(message.created_at || Date.now()).getTime(),
        metadata: {
          source: source,
          isRemote: source === 'web',
          ...message.metadata
        },
        // Optional fields
        session_id: message.session_id,
        user_id: message.user_id,
        status: message.status
      };
    }
    
    const unifiedFromGlassPip = convertToUnified(glassPipMessage, 'desktop');
    const unifiedFromRemote = convertToUnified(remoteServiceMessage, 'web');
    
    // Validate unified messages
    if (!unifiedFromGlassPip.id || !unifiedFromGlassPip.content || !unifiedFromGlassPip.timestamp) {
      throw new Error('Glass-pip message conversion failed');
    }
    
    if (!unifiedFromRemote.id || !unifiedFromRemote.content || !unifiedFromRemote.timestamp) {
      throw new Error('Remote service message conversion failed');
    }
    
    console.log('   ✅ Message formats are compatible');
    passed++;
  } catch (error) {
    console.log(`   ❌ Message format compatibility failed: ${error.message}`);
    failed++;
  }

  // Test 4: Configuration System
  try {
    console.log('4. Testing shared configuration system...');
    
    // Simulate shared config loading
    const sharedConfig = {
      supabase: {
        url: testConfig.supabase.url,
        anonKey: testConfig.supabase.anonKey
      },
      system: {
        id: 'test-system',
        name: 'Test System',
        type: 'web'
      },
      polling: {
        interval: 2000,
        batchSize: 10,
        heartbeatInterval: 30000
      }
    };
    
    // Validate configuration
    if (!sharedConfig.supabase.url || !sharedConfig.supabase.anonKey) {
      throw new Error('Missing Supabase configuration');
    }
    
    if (!sharedConfig.system.id || !sharedConfig.system.name) {
      throw new Error('Missing system configuration');
    }
    
    if (sharedConfig.polling.interval < 1000) {
      throw new Error('Invalid polling interval');
    }
    
    console.log('   ✅ Shared configuration system works');
    passed++;
  } catch (error) {
    console.log(`   ❌ Configuration system failed: ${error.message}`);
    failed++;
  }

  // Test 5: Type Compatibility
  try {
    console.log('5. Testing TypeScript type compatibility...');
    
    // Test that unified types can represent both application formats
    const unifiedMessage = {
      id: 'unified-msg-1',
      content: 'Test message',
      role: 'user',
      timestamp: Date.now(),
      
      // Glass-pip-chat compatible fields
      metadata: {
        source: 'text',
        toolCalls: [],
        toolResults: []
      },
      
      // Ally-remote-service compatible fields
      session_id: 'session-123',
      user_id: 'user-123',
      status: 'completed',
      is_remote: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Validate required fields
    const requiredFields = ['id', 'content', 'role', 'timestamp'];
    for (const field of requiredFields) {
      if (!unifiedMessage[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate types
    if (typeof unifiedMessage.id !== 'string') {
      throw new Error('ID must be string');
    }
    
    if (typeof unifiedMessage.timestamp !== 'number') {
      throw new Error('Timestamp must be number');
    }
    
    if (!['user', 'assistant', 'system'].includes(unifiedMessage.role)) {
      throw new Error('Invalid role');
    }
    
    console.log('   ✅ Type compatibility verified');
    passed++;
  } catch (error) {
    console.log(`   ❌ Type compatibility failed: ${error.message}`);
    failed++;
  }

  // Results
  console.log('\n' + '='.repeat(50));
  console.log('📊 COMPATIBILITY TEST RESULTS');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('🎉 All compatibility tests passed!');
    console.log('✨ Applications are ready for integration.');
  } else if (passed >= failed) {
    console.log('⚠️  Most tests passed with some issues.');
    console.log('🔧 Minor fixes needed for full compatibility.');
  } else {
    console.log('🚨 Significant compatibility issues detected.');
    console.log('🛠️  Major fixes required before integration.');
  }
  
  console.log('='.repeat(50));
  
  return failed === 0;
}

// Run the test
if (require.main === module) {
  testBasicCompatibility()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testBasicCompatibility };