// Test script to create a test user and verify RLS with authentication
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function testAuthAndRLS() {
  console.log('🔐 Testing Authentication and RLS...\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Missing environment variables. Please check .env.local');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    // Test 1: Try to access data without authentication
    console.log('1. Testing unauthenticated access...');
    
    const { data: unauthData, error: unauthError } = await supabase
      .from('chat_sessions')
      .select('*')
      .limit(1);
    
    if (unauthError) {
      console.log('✅ Unauthenticated access blocked:', unauthError.message);
    } else {
      console.log('⚠️  Unauthenticated access allowed. Data returned:', unauthData?.length || 0, 'rows');
    }

    // Test 2: Create a test user (or sign in if exists)
    console.log('\n2. Creating/signing in test user...');
    
    const testEmail = 'test.user@testdomain.com';
    const testPassword = 'TestPassword123!';
    
    // Try to sign in first (user likely already exists)
    let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    
    if (signInError && signInError.message.includes('Invalid login credentials')) {
      // User doesn't exist, try to sign up
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword
      });
      
      if (signUpError) {
        console.log('❌ Could not create test user:', signUpError.message);
        return;
      } else {
        console.log('✅ Created new test user');
      }
    } else if (signInError) {
      console.log('❌ Could not sign in test user:', signInError.message);
      return;
    } else {
      console.log('✅ Signed in existing test user');
    }

    // Test 3: Try to access data with authentication
    console.log('\n3. Testing authenticated access...');
    
    const { data: authData, error: authError } = await supabase
      .from('chat_sessions')
      .select('*')
      .limit(1);
    
    if (authError) {
      console.log('❌ Authenticated access failed:', authError.message);
    } else {
      console.log('✅ Authenticated access successful. Data returned:', authData?.length || 0, 'rows');
    }

    // Test 4: Create test data and verify isolation
    console.log('\n4. Testing data isolation...');
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('❌ No authenticated user found');
      return;
    }
    
    console.log('✅ Authenticated user ID:', user.id);
    
    // Create a test session
    const { data: sessionData, error: sessionError } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: user.id,
        title: 'Test Session',
        is_remote: true
      })
      .select()
      .single();
    
    if (sessionError) {
      console.log('❌ Could not create test session:', sessionError.message);
    } else {
      console.log('✅ Created test session:', sessionData.id);
      
      // Create a test message
      const { data: messageData, error: messageError } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionData.id,
          user_id: user.id,
          content: 'Test message',
          is_remote: true,
          local_system_id: 'test-system'
        })
        .select()
        .single();
      
      if (messageError) {
        console.log('❌ Could not create test message:', messageError.message);
      } else {
        console.log('✅ Created test message:', messageData.id);
        
        // Test database functions
        console.log('\n5. Testing database functions with real data...');
        
        // Test append_message_response
        const { error: appendError } = await supabase.rpc('append_message_response', {
          message_id: messageData.id,
          new_content: ' - appended content'
        });
        
        if (appendError) {
          console.log('❌ append_message_response failed:', appendError.message);
        } else {
          console.log('✅ append_message_response worked');
        }
        
        // Test update_message_status
        const { error: statusError } = await supabase.rpc('update_message_status', {
          message_id: messageData.id,
          new_status: 'processing'
        });
        
        if (statusError) {
          console.log('❌ update_message_status failed:', statusError.message);
        } else {
          console.log('✅ update_message_status worked');
        }
        
        // Test get_pending_messages
        const { data: pendingData, error: pendingError } = await supabase.rpc('get_pending_messages', {
          system_id: 'test-system',
          batch_size: 5
        });
        
        if (pendingError) {
          console.log('❌ get_pending_messages failed:', pendingError.message);
        } else {
          console.log('✅ get_pending_messages worked, returned:', pendingData?.length || 0, 'messages');
        }
        
        // Test update_system_heartbeat
        const { error: heartbeatError } = await supabase.rpc('update_system_heartbeat', {
          system_id: 'test-system-' + Date.now(),
          new_status: 'online'
        });
        
        if (heartbeatError) {
          console.log('❌ update_system_heartbeat failed:', heartbeatError.message);
        } else {
          console.log('✅ update_system_heartbeat worked');
        }
      }
    }

    // Test 6: Sign out and verify access is blocked
    console.log('\n6. Testing access after sign out...');
    
    await supabase.auth.signOut();
    
    const { data: signedOutData, error: signedOutError } = await supabase
      .from('chat_sessions')
      .select('*')
      .limit(1);
    
    if (signedOutError) {
      console.log('✅ Access blocked after sign out:', signedOutError.message);
    } else {
      console.log('⚠️  Access still allowed after sign out. Data returned:', signedOutData?.length || 0, 'rows');
    }

    console.log('\n✅ Authentication and RLS test complete!');

  } catch (error) {
    console.error('❌ Auth and RLS test failed:', error.message);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testAuthAndRLS();
}

module.exports = { testAuthAndRLS };