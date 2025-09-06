/**
 * Simple authentication test script
 * Run this to test Supabase authentication and create a test user
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://delzfrzfwhycdzozxwgp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbHpmcnpmd2h5Y2R6b3p4d2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNjE2NjQsImV4cCI6MjA3MjczNzY2NH0.aWqbefKFuWZHXbmgjp-a0_QoD17PBrxlIDH_hoIYd9g';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testAuth() {
  console.log('🔐 Testing Supabase Authentication...');

  const testEmail = 'buzzaryanrai@gmail.com';
  const testPassword = 'Aryanrai@2000';

  try {
    // Try to sign up first
    console.log('📝 Attempting to create test user...');
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword
    });

    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        console.log('✅ User already exists, trying to sign in...');

        // Try to sign in
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: testEmail,
          password: testPassword
        });

        if (signInError) {
          console.error('❌ Sign in failed:', signInError.message);
          return;
        }

        console.log('✅ Sign in successful!');
        console.log('User ID:', signInData.user?.id);
        console.log('Email:', signInData.user?.email);

      } else {
        console.error('❌ Sign up failed:', signUpError.message);
        return;
      }
    } else {
      console.log('✅ Sign up successful!');
      console.log('User ID:', signUpData.user?.id);
      console.log('Email:', signUpData.user?.email);

      if (signUpData.user && !signUpData.session) {
        console.log('📧 Please check your email to confirm your account');
      }
    }

    // Test connection to database
    console.log('🗄️ Testing database connection...');
    const { data: systems, error: dbError } = await supabase
      .from('local_systems')
      .select('*')
      .limit(1);

    if (dbError) {
      console.error('❌ Database connection failed:', dbError.message);
    } else {
      console.log('✅ Database connection successful!');
      console.log('Found systems:', systems?.length || 0);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
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