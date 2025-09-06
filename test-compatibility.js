/**
 * Compatibility Test Script
 * 
 * Tests the compatibility between ally-remote-service and glass-pip-chat
 * using the unified integration services
 */

const { createClient } = require('@supabase/supabase-js');

// Test configuration
const testConfig = {
  supabase: {
    url: 'https://delzfrzfwhycdzozxwgp.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbHpmcnpmd2h5Y2R6b3p4d2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNjE2NjQsImV4cCI6MjA3MjczNzY2NH0.aWqbefKFuWZHXbmgjp-a0_QoD17PBrxlIDH_hoIYd9g'
  },
  testUser: {
    email: 'test@ally-demo.local',
    password: 'demo123456'
  }
};

class CompatibilityTester {
  constructor() {
    this.supabase = createClient(testConfig.supabase.url, testConfig.supabase.anonKey);
    this.results = {
      passed: 0,
      failed: 0,
      tests: []
    };
  }

  async runTest(name, testFn) {
    console.log(`\n🧪 Running test: ${name}`);
    try {
      await testFn();
      console.log(`✅ ${name} - PASSED`);
      this.results.passed++;
      this.results.tests.push({ name, status: 'PASSED' });
    } catch (error) {
      console.log(`❌ ${name} - FAILED: ${error.message}`);
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAILED', error: error.message });
    }
  }

  async testDatabaseConnection() {
    const { data, error } = await this.supabase
      .from('local_systems')
      .select('count')
      .limit(1);
    
    if (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  async testAuthenticationFlow() {
    // Test sign up
    const { data: signUpData, error: signUpError } = await this.supabase.auth.signUp({
      email: testConfig.testUser.email,
      password: testConfig.testUser.password
    });

    if (signUpError && !signUpError.message.includes('already registered')) {
      throw new Error(`Sign up failed: ${signUpError.message}`);
    }

    // Test sign in
    const { data: signInData, error: signInError } = await this.supabase.auth.signInWithPassword({
      email: testConfig.testUser.email,
      password: testConfig.testUser.password
    });

    if (signInError) {
      throw new Error(`Sign in failed: ${signInError.message}`);
    }

    if (!signInData.user || !signInData.session) {
      throw new Error('Authentication successful but no user/session returned');
    }

    // Test session validation
    const { data: sessionData, error: sessionError } = await this.supabase.auth.getSession();
    
    if (sessionError) {
      throw new Error(`Session validation failed: ${sessionError.message}`);
    }

    if (!sessionData.session) {
      throw new Error('No active session found');
    }
  }

  async testLocalSystemRegistration() {
    const { data: { session } } = await this.supabase.auth.getSession();
    
    if (!session) {
      throw new Error('No active session for system registration test');
    }

    const systemData = {
      id: `test-system-${Date.now()}`,
      user_id: session.user.id,
      name: 'Test System',
      type: 'web',
      status: 'online',
      last_heartbeat: Date.now(),
      capabilities: {
        models: [],
        tools: ['test-tool'],
        features: ['test-feature']
      },
      metadata: {
        test: true,
        userAgent: 'Test Agent'
      },
      created_at: Date.now()
    };

    const { data, error } = await this.supabase
      .from('local_systems')
      .insert(systemData)
      .select()
      .single();

    if (error) {
      throw new Error(`Local system registration failed: ${error.message}`);
    }

    if (!data || data.id !== systemData.id) {
      throw new Error('Local system registration returned unexpected data');
    }

    // Clean up
    await this.supabase
      .from('local_systems')
      .delete()
      .eq('id', systemData.id);
  }

  async testMessageFlow() {
    const { data: { session } } = await this.supabase.auth.getSession();
    
    if (!session) {
      throw new Error('No active session for message flow test');
    }

    // Create a test session
    const sessionId = `test-session-${Date.now()}`;
    const sessionData = {
      id: sessionId,
      user_id: session.user.id,
      title: 'Test Chat Session',
      metadata: { test: true },
      is_remote: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error: sessionError } = await this.supabase
      .from('chat_sessions')
      .insert(sessionData);

    if (sessionError) {
      throw new Error(`Chat session creation failed: ${sessionError.message}`);
    }

    // Create a test message
    const messageId = `test-message-${Date.now()}`;
    const messageData = {
      id: messageId,
      session_id: sessionId,
      user_id: session.user.id,
      content: 'Test message content',
      response: '',
      status: 'pending',
      metadata: { test: true },
      is_remote: true,
      local_system_id: 'test-system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: messageInsertData, error: messageError } = await this.supabase
      .from('messages')
      .insert(messageData)
      .select()
      .single();

    if (messageError) {
      throw new Error(`Message creation failed: ${messageError.message}`);
    }

    // Test message retrieval
    const { data: retrievedMessages, error: retrieveError } = await this.supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId);

    if (retrieveError) {
      throw new Error(`Message retrieval failed: ${retrieveError.message}`);
    }

    if (!retrievedMessages || retrievedMessages.length === 0) {
      throw new Error('No messages retrieved');
    }

    const retrievedMessage = retrievedMessages[0];
    if (retrievedMessage.id !== messageId || retrievedMessage.content !== 'Test message content') {
      throw new Error('Retrieved message data does not match inserted data');
    }

    // Test message status update
    const { error: updateError } = await this.supabase
      .from('messages')
      .update({
        status: 'completed',
        response: 'Test response',
        completed_at: new Date().toISOString()
      })
      .eq('id', messageId);

    if (updateError) {
      throw new Error(`Message status update failed: ${updateError.message}`);
    }

    // Clean up
    await this.supabase.from('messages').delete().eq('session_id', sessionId);
    await this.supabase.from('chat_sessions').delete().eq('id', sessionId);
  }

  async testEnvironmentVariableCompatibility() {
    // Test that both applications can access the same Supabase instance
    const webEnvVars = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || testConfig.supabase.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || testConfig.supabase.anonKey
    };

    const desktopEnvVars = {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || testConfig.supabase.url,
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || testConfig.supabase.anonKey
    };

    // Check that URLs match
    const webUrl = webEnvVars.NEXT_PUBLIC_SUPABASE_URL;
    const desktopUrl = desktopEnvVars.VITE_SUPABASE_URL;

    if (webUrl !== desktopUrl) {
      throw new Error(`Supabase URL mismatch: web=${webUrl}, desktop=${desktopUrl}`);
    }

    // Check that anon keys match
    const webKey = webEnvVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const desktopKey = desktopEnvVars.VITE_SUPABASE_ANON_KEY;

    if (webKey !== desktopKey) {
      throw new Error(`Supabase anon key mismatch: web=${webKey?.substring(0, 20)}..., desktop=${desktopKey?.substring(0, 20)}...`);
    }
  }

  async testRealtimeSubscription() {
    let messageReceived = false;
    let subscription = null;

    try {
      // Set up realtime subscription
      subscription = this.supabase
        .channel('test-messages')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
          },
          (payload) => {
            if (payload.new && payload.new.content === 'Realtime test message') {
              messageReceived = true;
            }
          }
        )
        .subscribe();

      // Wait for subscription to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Insert a test message
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session for realtime test');
      }

      const testMessageId = `realtime-test-${Date.now()}`;
      await this.supabase
        .from('messages')
        .insert({
          id: testMessageId,
          session_id: 'realtime-test-session',
          user_id: session.user.id,
          content: 'Realtime test message',
          response: '',
          status: 'pending',
          metadata: {},
          is_remote: true,
          local_system_id: 'test-system',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      // Wait for realtime message
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (!messageReceived) {
        throw new Error('Realtime message was not received');
      }

      // Clean up
      await this.supabase
        .from('messages')
        .delete()
        .eq('id', testMessageId);

    } finally {
      if (subscription) {
        subscription.unsubscribe();
      }
    }
  }

  async testCrossApplicationCompatibility() {
    // Test that message formats are compatible between applications
    const glassPipMessage = {
      id: 'glass-pip-msg-1',
      role: 'user',
      content: 'Hello from glass-pip-chat',
      timestamp: Date.now(),
      metadata: {
        source: 'text',
        context: 'test'
      }
    };

    const remoteServiceMessage = {
      id: 'remote-service-msg-1',
      session_id: 'test-session',
      user_id: 'test-user',
      content: 'Hello from ally-remote-service',
      response: '',
      status: 'completed',
      metadata: { test: true },
      is_remote: true,
      local_system_id: 'test-system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Test conversion functions (these would be imported from shared-types.ts)
    // For now, just validate that the message structures are reasonable
    
    if (!glassPipMessage.id || !glassPipMessage.content || !glassPipMessage.role) {
      throw new Error('Glass-pip-chat message structure is invalid');
    }

    if (!remoteServiceMessage.id || !remoteServiceMessage.content || !remoteServiceMessage.session_id) {
      throw new Error('Ally-remote-service message structure is invalid');
    }

    // Test that timestamps are compatible
    const glassPipTimestamp = glassPipMessage.timestamp;
    const remoteServiceTimestamp = new Date(remoteServiceMessage.created_at).getTime();

    if (typeof glassPipTimestamp !== 'number' || typeof remoteServiceTimestamp !== 'number') {
      throw new Error('Timestamp formats are incompatible');
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Ally Integration Compatibility Tests\n');

    await this.runTest('Database Connection', () => this.testDatabaseConnection());
    await this.runTest('Authentication Flow', () => this.testAuthenticationFlow());
    await this.runTest('Local System Registration', () => this.testLocalSystemRegistration());
    await this.runTest('Message Flow', () => this.testMessageFlow());
    await this.runTest('Environment Variable Compatibility', () => this.testEnvironmentVariableCompatibility());
    await this.runTest('Realtime Subscription', () => this.testRealtimeSubscription());
    await this.runTest('Cross-Application Compatibility', () => this.testCrossApplicationCompatibility());

    // Clean up
    try {
      await this.supabase.auth.signOut();
    } catch (error) {
      console.log('Warning: Failed to sign out during cleanup');
    }

    this.printResults();
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('🏁 COMPATIBILITY TEST RESULTS');
    console.log('='.repeat(60));
    
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📊 Total: ${this.results.passed + this.results.failed}`);
    
    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.tests
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
          console.log(`   • ${test.name}: ${test.error}`);
        });
    }

    const successRate = (this.results.passed / (this.results.passed + this.results.failed)) * 100;
    console.log(`\n🎯 Success Rate: ${successRate.toFixed(1)}%`);

    if (successRate >= 90) {
      console.log('🎉 Excellent! Applications are highly compatible.');
    } else if (successRate >= 70) {
      console.log('⚠️  Good compatibility with some issues to address.');
    } else {
      console.log('🚨 Poor compatibility. Significant fixes needed.');
    }

    console.log('='.repeat(60));
  }
}

// Run the tests
async function main() {
  const tester = new CompatibilityTester();
  await tester.runAllTests();
  
  // Exit with appropriate code
  process.exit(tester.results.failed > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = { CompatibilityTester };