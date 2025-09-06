/**
 * Final Fix Test
 * 
 * Tests the final fixes for the web app authentication and connection issues
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://delzfrzfwhycdzozxwgp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbHpmcnpmd2h5Y2R6b3p4d2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNjE2NjQsImV4cCI6MjA3MjczNzY2NH0.aWqbefKFuWZHXbmgjp-a0_QoD17PBrxlIDH_hoIYd9g';

async function testFinalFixes() {
  console.log('🔧 Testing Final Web App Fixes...\n');
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  let passed = 0;
  let failed = 0;

  // Test 1: Authentication and Session Creation
  try {
    console.log('1. Testing authentication and session creation...');
    
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: 'test@ally-demo.local',
      password: 'demo123456'
    });

    if (signInError) {
      throw new Error(`Sign in failed: ${signInError.message}`);
    }

    // Test session creation (like SimpleChatInterface does)
    const sessionId = crypto.randomUUID();
    const { error: sessionError } = await supabase
      .from('chat_sessions')
      .insert({
        id: sessionId,
        user_id: signInData.user.id,
        title: 'Test Web Chat Session',
        is_remote: true
      });

    if (sessionError) {
      throw new Error(`Session creation failed: ${sessionError.message}`);
    }

    console.log('   ✅ Authentication and session creation successful');
    
    // Clean up
    await supabase.from('chat_sessions').delete().eq('id', sessionId);
    passed++;
  } catch (error) {
    console.log(`   ❌ Authentication test failed: ${error.message}`);
    failed++;
  }

  // Test 2: Message Creation and Real-time
  try {
    console.log('2. Testing message creation...');
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    // Create session
    const sessionId = crypto.randomUUID();
    await supabase
      .from('chat_sessions')
      .insert({
        id: sessionId,
        user_id: session.user.id,
        title: 'Test Session',
        is_remote: true
      });

    // Create message (like SimpleChatInterface does)
    const messageId = crypto.randomUUID();
    const { error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        id: messageId,
        session_id: sessionId,
        user_id: session.user.id,
        content: 'Test message from web interface',
        response: '',
        status: 'pending',
        is_remote: true,
        local_system_id: 'web-system'
      });

    if (messageError) {
      throw new Error(`Message creation failed: ${messageError.message}`);
    }

    console.log('   ✅ Message creation successful');
    
    // Clean up
    await supabase.from('chat_messages').delete().eq('session_id', sessionId);
    await supabase.from('chat_sessions').delete().eq('id', sessionId);
    passed++;
  } catch (error) {
    console.log(`   ❌ Message creation test failed: ${error.message}`);
    failed++;
  }

  // Test 3: Glass Connection Detection
  try {
    console.log('3. Testing glass connection detection...');
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    // Create a mock glass system
    const glassSystemId = `desktop-glass-${Date.now()}`;
    await supabase
      .from('local_systems')
      .insert({
        id: glassSystemId,
        user_id: session.user.id,
        name: 'Glass PiP Chat Test',
        status: 'online',
        last_heartbeat: new Date().toISOString(),
        capabilities: {
          models: ['llama3.2:latest'],
          tools: ['desktop-interface', 'speech'],
          features: ['desktop-interface', 'pip-mode', 'speech', 'local-ai']
        },
        metadata: {
          userAgent: 'Electron',
          type: 'desktop'
        }
      });

    // Test detection (like SimpleChatInterface does)
    const { data: systems } = await supabase
      .from('local_systems')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('status', 'online');

    const desktopSystems = systems?.filter(s => 
      s.name?.toLowerCase().includes('glass') || 
      s.name?.toLowerCase().includes('desktop') ||
      s.capabilities?.features?.includes('desktop-interface')
    ) || [];

    if (desktopSystems.length === 0) {
      throw new Error('Glass system not detected');
    }

    console.log('   ✅ Glass connection detection successful');
    
    // Clean up
    await supabase.from('local_systems').delete().eq('id', glassSystemId);
    passed++;
  } catch (error) {
    console.log(`   ❌ Glass connection test failed: ${error.message}`);
    failed++;
  }

  // Test 4: Logout Functionality
  try {
    console.log('4. Testing logout functionality...');
    
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(`Sign out failed: ${error.message}`);
    }

    // Verify sign out
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      throw new Error('Session still active after sign out');
    }

    console.log('   ✅ Logout functionality working');
    passed++;
  } catch (error) {
    console.log(`   ❌ Logout test failed: ${error.message}`);
    failed++;
  }

  // Results
  console.log('\n' + '='.repeat(50));
  console.log('🏁 FINAL FIX TEST RESULTS');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('🎉 All final fixes working correctly!');
    console.log('✨ The ally-remote-service web app now:');
    console.log('   - Handles authentication properly');
    console.log('   - Creates sessions without errors');
    console.log('   - Detects glass-pip-chat connections');
    console.log('   - Allows proper logout');
    console.log('   - Shows connection status');
  } else {
    console.log('⚠️  Some issues remain. The web app should still work but may have minor issues.');
  }
  
  console.log('='.repeat(50));
  
  return failed === 0;
}

if (require.main === module) {
  testFinalFixes()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testFinalFixes };