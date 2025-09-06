/**
 * Authentication Issues Fix Script
 * 
 * This script addresses the common authentication issues:
 * 1. Invalid refresh token errors
 * 2. Session persistence problems
 * 3. Connection establishment issues
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://delzfrzfwhycdzozxwgp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbHpmcnpmd2h5Y2R6b3p4d2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNjE2NjQsImV4cCI6MjA3MjczNzY2NH0.aWqbefKFuWZHXbmgjp-a0_QoD17PBrxlIDH_hoIYd9g';

async function fixAuthIssues() {
  console.log('🔧 Starting authentication issues fix...');

  // Create a fresh client with proper session management
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  });

  try {
    // Step 1: Clear any corrupted session data
    console.log('🧹 Clearing corrupted session data...');
    await supabase.auth.signOut({ scope: 'local' });
    
    // Clear localStorage manually as well
    if (typeof window !== 'undefined') {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('sb-delzfrzfwhycdzozxwgp-auth-token')) {
          localStorage.removeItem(key);
          console.log(`Removed: ${key}`);
        }
      });
    }

    console.log('✅ Session data cleared');

    // Step 2: Test fresh authentication
    console.log('🔐 Testing fresh authentication...');
    
    const testEmail = 'buzzaryanrai@gmail.com';
    const testPassword = 'Aryanrai@2000';

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });

    if (signInError) {
      console.error('❌ Fresh sign in failed:', signInError.message);
      
      // Try to create the user if it doesn't exist
      console.log('📝 Attempting to create user...');
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword
      });

      if (signUpError) {
        console.error('❌ Sign up failed:', signUpError.message);
        return false;
      }

      console.log('✅ User created successfully');
      return true;
    }

    console.log('✅ Fresh authentication successful');
    console.log('User ID:', signInData.user?.id);
    console.log('Session expires at:', new Date(signInData.session?.expires_at * 1000));

    // Step 3: Test database connection
    console.log('🗄️ Testing database connection...');
    const { data: systems, error: dbError } = await supabase
      .from('local_systems')
      .select('*')
      .limit(1);

    if (dbError) {
      console.error('❌ Database connection failed:', dbError.message);
      return false;
    }

    console.log('✅ Database connection successful');
    console.log('Found systems:', systems?.length || 0);

    // Step 4: Test session persistence
    console.log('🔄 Testing session persistence...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('❌ Session retrieval failed:', sessionError.message);
      return false;
    }

    if (!session) {
      console.error('❌ No active session found');
      return false;
    }

    console.log('✅ Session persistence working');
    console.log('Session valid until:', new Date(session.expires_at * 1000));

    return true;

  } catch (error) {
    console.error('💥 Fix process failed:', error.message);
    return false;
  }
}

// Additional utility functions
async function clearAllAuthData() {
  console.log('🧹 Clearing all authentication data...');
  
  if (typeof window !== 'undefined') {
    // Clear localStorage
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.includes('supabase') || key.includes('auth')) {
        localStorage.removeItem(key);
        console.log(`Removed localStorage: ${key}`);
      }
    });

    // Clear sessionStorage
    const sessionKeys = Object.keys(sessionStorage);
    sessionKeys.forEach(key => {
      if (key.includes('supabase') || key.includes('auth')) {
        sessionStorage.removeItem(key);
        console.log(`Removed sessionStorage: ${key}`);
      }
    });
  }

  console.log('✅ All auth data cleared');
}

async function testConnectionHealth() {
  console.log('🏥 Testing connection health...');
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  
  try {
    // Test basic connectivity
    const { data, error } = await supabase
      .from('local_systems')
      .select('count')
      .limit(1);

    if (error) {
      console.error('❌ Connection health check failed:', error.message);
      return false;
    }

    console.log('✅ Connection health check passed');
    return true;
  } catch (error) {
    console.error('💥 Health check crashed:', error.message);
    return false;
  }
}

// Run the fix
if (typeof window !== 'undefined') {
  // Browser environment
  window.fixAuthIssues = fixAuthIssues;
  window.clearAllAuthData = clearAllAuthData;
  window.testConnectionHealth = testConnectionHealth;
  
  console.log('🔧 Auth fix utilities loaded. Run:');
  console.log('- fixAuthIssues() to fix authentication issues');
  console.log('- clearAllAuthData() to clear all auth data');
  console.log('- testConnectionHealth() to test connection');
} else {
  // Node environment
  fixAuthIssues().then(success => {
    if (success) {
      console.log('🎉 Authentication issues fixed successfully!');
      process.exit(0);
    } else {
      console.log('❌ Failed to fix authentication issues');
      process.exit(1);
    }
  }).catch(error => {
    console.error('💥 Fix script crashed:', error);
    process.exit(1);
  });
}