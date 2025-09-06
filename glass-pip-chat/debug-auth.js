/**
 * Debug authentication script
 * Provides detailed debugging information for auth issues
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://delzfrzfwhycdzozxwgp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbHpmcnpmd2h5Y2R6b3p4d2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNjE2NjQsImV4cCI6MjA3MjczNzY2NH0.aWqbefKFuWZHXbmgjp-a0_QoD17PBrxlIDH_hoIYd9g';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});

async function debugAuth() {
  console.log('🔍 Starting authentication debug session...');
  console.log('Supabase URL:', supabaseUrl);
  console.log('Anon Key (first 20 chars):', supabaseAnonKey.substring(0, 20) + '...');

  const testEmail = 'test@ally-demo.local';
  const testPassword = 'demo123456';

  try {
    // Test 1: Basic connectivity
    console.log('\n📡 Test 1: Basic connectivity');
    const { data: healthData, error: healthError } = await supabase
      .from('local_systems')
      .select('count')
      .limit(1);

    if (healthError) {
      console.error('❌ Basic connectivity failed:', healthError);
      console.log('Error details:', JSON.stringify(healthError, null, 2));
    } else {
      console.log('✅ Basic connectivity working');
    }

    // Test 2: Clear any existing session
    console.log('\n🧹 Test 2: Clearing existing session');
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.warn('⚠️ Sign out error:', signOutError);
    } else {
      console.log('✅ Session cleared');
    }

    // Test 3: Try sign up with detailed error handling
    console.log('\n📝 Test 3: Sign up attempt');
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword
    });

    if (signUpError) {
      console.error('❌ Sign up failed');
      console.log('Error message:', signUpError.message);
      console.log('Error status:', signUpError.status);
      console.log('Full error:', JSON.stringify(signUpError, null, 2));
    } else {
      console.log('✅ Sign up successful');
      console.log('User ID:', signUpData.user?.id);
      console.log('Email confirmed:', signUpData.user?.email_confirmed_at ? 'Yes' : 'No');
      console.log('Session exists:', signUpData.session ? 'Yes' : 'No');
    }

    // Test 4: Try sign in
    console.log('\n🔑 Test 4: Sign in attempt');
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });

    if (signInError) {
      console.error('❌ Sign in failed');
      console.log('Error message:', signInError.message);
      console.log('Error status:', signInError.status);
      console.log('Full error:', JSON.stringify(signInError, null, 2));
    } else {
      console.log('✅ Sign in successful');
      console.log('User ID:', signInData.user?.id);
      console.log('Session expires at:', new Date(signInData.session?.expires_at * 1000));
    }

    // Test 5: Check current session
    console.log('\n🔍 Test 5: Current session check');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('❌ Session check failed');
      console.log('Error message:', sessionError.message);
      console.log('Full error:', JSON.stringify(sessionError, null, 2));
    } else if (session) {
      console.log('✅ Active session found');
      console.log('User ID:', session.user?.id);
      console.log('Email:', session.user?.email);
      console.log('Expires at:', new Date(session.expires_at * 1000));
    } else {
      console.log('ℹ️ No active session');
    }

    // Test 6: Database access with auth
    if (session) {
      console.log('\n🗄️ Test 6: Authenticated database access');
      const { data: systemsData, error: dbError } = await supabase
        .from('local_systems')
        .select('*')
        .limit(1);

      if (dbError) {
        console.error('❌ Database access failed');
        console.log('Error message:', dbError.message);
        console.log('Error code:', dbError.code);
        console.log('Full error:', JSON.stringify(dbError, null, 2));
      } else {
        console.log('✅ Database access successful');
        console.log('Found systems:', systemsData?.length || 0);
      }
    }

  } catch (error) {
    console.error('💥 Debug session crashed:', error);
    console.log('Error stack:', error.stack);
  }

  console.log('\n🏁 Debug session complete');
}

// Run debug
debugAuth().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('💥 Debug crashed:', error);
  process.exit(1);
});