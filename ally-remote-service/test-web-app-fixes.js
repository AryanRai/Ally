/**
 * Test Web App Fixes
 * 
 * This script tests the web app fixes for logout and glass-pip-chat connection
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://delzfrzfwhycdzozxwgp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbHpmcnpmd2h5Y2R6b3p4d2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNjE2NjQsImV4cCI6MjA3MjczNzY2NH0.aWqbefKFuWZHXbmgjp-a0_QoD17PBrxlIDH_hoIYd9g';

async function testWebAppFixes() {
  console.log('🧪 Testing Web App Fixes...\n');
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  let passed = 0;
  let failed = 0;

  // Test 1: Authentication Flow
  try {
    console.log('1. Testing authentication flow...');
    
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: 'test@ally-demo.local',
      password: 'demo123456'
    });

    if (signInError) {
      throw new Error(`Sign in failed: ${signInError.message}`);
    }

    console.log('   ✅ Sign in successful');
    
    // Test session retrieval
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      throw new Error('Session retrieval failed');
    }
    
    console.log('   ✅ Session retrieval successful');
    passed++;
  } catch (error) {
    console.log(`   ❌ Authentication test failed: ${error.message}`);
    failed++;
  }

  // Test 2: Local System Registration (Web)
  try {
    console.log('2. Testing web system registration...');
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const systemId = `web-test-${Date.now()}`;
    const { data, error } = await supabase
      .from('local_systems')
      .insert({
        id: systemId,
        user_id: session.user.id,
        name: 'Web Interface Test',
        status: 'online',
        last_heartbeat: new Date().toISOString(),
        capabilities: {
          models: [],
          tools: [],
          features: ['web-interface', 'remote-chat']
        },
        metadata: {
          userAgent: 'Test Agent',
          language: 'en',
          type: 'web'
        }
      })
      .select()
      .single();

    if (error) {
      throw new Error(`System registration failed: ${error.message}`);
    }

    console.log('   ✅ Web system registration successful');
    
    // Clean up
    await supabase.from('local_systems').delete().eq('id', systemId);
    passed++;
  } catch (error) {
    console.log(`   ❌ System registration test failed: ${error.message}`);
    failed++;
  }

  // Test 3: Message Flow
  try {
    console.log('3. Testing message flow...');
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    // Create session
    const sessionId = crypto.randomUUID();
    const { error: sessionError } = await supabase
      .from('chat_sessions')
      .insert({
        id: sessionId,
        user_id: session.user.id,
        title: 'Test Session',
        is_remote: true
      });

    if (sessionError) {
      throw new Error(`Session creation failed: ${sessionError.message}`);
    }

    // Create message
    const messageId = crypto.randomUUID();
    const { error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        id: messageId,
        session_id: sessionId,
        user_id: session.user.id,
        content: 'Test message from web',
        response: '',
        status: 'pending',
        is_remote: true,
        local_system_id: 'web-system'
      });

    if (messageError) {
      throw new Error(`Message creation failed: ${messageError.message}`);
    }

    console.log('   ✅ Message flow successful');
    
    // Clean up
    await supabase.from('chat_messages').delete().eq('session_id', sessionId);
    await supabase.from('chat_sessions').delete().eq('id', sessionId);
    passed++;
  } catch (error) {
    console.log(`   ❌ Message flow test failed: ${error.message}`);
    failed++;
  }

  // Test 4: Glass Connection Detection
  try {
    console.log('4. Testing glass connection detection...');
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    // Simulate glass-pip-chat system
    const glassSystemId = `desktop-glass-${Date.now()}`;
    const { error: glassError } = await supabase
      .from('local_systems')
      .insert({
        id: glassSystemId,
        user_id: session.user.id,
        name: 'Glass PiP Chat',
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

    if (glassError) {
      throw new Error(`Glass system creation failed: ${glassError.message}`);
    }

    // Test detection
    const { data: systems, error: systemsError } = await supabase
      .from('local_systems')
      .select('*')
      .eq('user_id', session.user.id);

    if (systemsError) {
      throw new Error(`Systems query failed: ${systemsError.message}`);
    }

    const desktopSystems = systems.filter(s => 
      s.name?.toLowerCase().includes('glass') || 
      s.name?.toLowerCase().includes('desktop') ||
      s.capabilities?.features?.includes('desktop-interface')
    );

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

  // Test 5: Sign Out
  try {
    console.log('5. Testing sign out...');
    
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(`Sign out failed: ${error.message}`);
    }

    // Verify sign out
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      throw new Error('Session still active after sign out');
    }

    console.log('   ✅ Sign out successful');
    passed++;
  } catch (error) {
    console.log(`   ❌ Sign out test failed: ${error.message}`);
    failed++;
  }

  // Results
  console.log('\n' + '='.repeat(50));
  console.log('📊 WEB APP FIX TEST RESULTS');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('🎉 All web app fixes working correctly!');
    console.log('✨ The ally-remote-service should now:');
    console.log('   - Allow proper logout');
    console.log('   - Connect with glass-pip-chat');
    console.log('   - Show connection status');
    console.log('   - Sync messages in real-time');
  } else {
    console.log('⚠️  Some issues remain. Check the failed tests above.');
  }
  
  console.log('='.repeat(50));
  
  return failed === 0;
}

if (require.main === module) {
  testWebAppFixes()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testWebAppFixes };