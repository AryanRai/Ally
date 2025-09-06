/**
 * Comprehensive authentication test script
 * Run this to test Supabase authentication and fix common issues
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://delzfrzfwhycdzozxwgp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbHpmcnpmd2h5Y2R6b3p4d2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNjE2NjQsImV4cCI6MjA3MjczNzY2NH0.aWqbefKFuWZHXbmgjp-a0_QoD17PBrxlIDH_hoIYd9g';

// Create client with improved configuration
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});

async function clearCorruptedSession() {
  console.log('🧹 Clearing potentially corrupted session data...');
  
  try {
    // Sign out to clear any corrupted session
    await supabase.auth.signOut({ scope: 'local' });
    console.log('✅ Session cleared');
    return true;
  } catch (error) {
    console.warn('⚠️ Error clearing session:', error.message);
    return false;
  }
}

async function testAuth() {
  console.log('🔐 Starting comprehensive authentication test...');

  const testEmail = 'buzzaryanrai@gmail.com';
  const testPassword = 'Aryanrai@2000';

  try {
    // Step 1: Clear any corrupted session
    await clearCorruptedSession();

    // Step 2: Check current session status
    console.log('🔍 Checking current session status...');
    const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.warn('⚠️ Session check error:', sessionError.message);
      
      if (sessionError.message.includes('refresh_token_not_found') || 
          sessionError.message.includes('Invalid Refresh Token')) {
        console.log('🔄 Detected refresh token issue, clearing session...');
        await supabase.auth.signOut({ scope: 'local' });
      }
    } else if (currentSession) {
      console.log('✅ Found existing valid session');
      console.log('User ID:', currentSession.user?.id);
      console.log('Expires at:', new Date(currentSession.expires_at * 1000));
    }

    // Step 3: Try to sign in
    console.log('� Attemptaing to sign in...');
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });

    if (signInError) {
      if (signInError.message.includes('Invalid login credentials')) {
        console.log('📝 User may not exist, attempting to create...');
        
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: testEmail,
          password: testPassword
        });

        if (signUpError) {
          console.error('❌ Sign up failed:', signUpError.message);
          return false;
        }

        console.log('✅ User created successfully!');
        console.log('User ID:', signUpData.user?.id);
        
        if (signUpData.user && !signUpData.session) {
          console.log('📧 Please check your email to confirm your account');
          console.log('💡 You may need to confirm your email before signing in');
        }
        
        return true;
      } else {
        console.error('❌ Sign in failed:', signInError.message);
        return false;
      }
    }

    console.log('✅ Sign in successful!');
    console.log('User ID:', signInData.user?.id);
    console.log('Email:', signInData.user?.email);
    console.log('Session expires at:', new Date(signInData.session?.expires_at * 1000));

    // Step 4: Test database connection
    console.log('🗄️ Testing database connection...');
    const { data: systems, error: dbError } = await supabase
      .from('local_systems')
      .select('*')
      .limit(1);

    if (dbError) {
      console.error('❌ Database connection failed:', dbError.message);
      console.log('💡 This might be a Row Level Security (RLS) issue');
      return false;
    }

    console.log('✅ Database connection successful!');
    console.log('Found systems:', systems?.length || 0);

    // Step 5: Test session persistence
    console.log('🔄 Testing session persistence...');
    const { data: { session: persistedSession }, error: persistError } = await supabase.auth.getSession();
    
    if (persistError) {
      console.error('❌ Session persistence failed:', persistError.message);
      return false;
    }

    if (!persistedSession) {
      console.error('❌ Session not persisted');
      return false;
    }

    console.log('✅ Session persistence working correctly');
    
    return true;

  } catch (error) {
    console.error('💥 Test failed with exception:', error.message);
    return false;
  }
}

// Run the test
testAuth().then(() => {
  console.log('🏁 Authentication test complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});