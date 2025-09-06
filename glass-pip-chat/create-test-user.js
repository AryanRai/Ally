/**
 * Create a test user that can sign in immediately
 * This uses a workaround for development testing
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://delzfrzfwhycdzozxwgp.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbHpmcnpmd2h5Y2R6b3p4d2dwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzE2MTY2NCwiZXhwIjoyMDcyNzM3NjY0fQ.xBgsm4NsZSde7Emm65GWaE0TcLl1xQhx6Uhx2h4tV20';

// Use service role key to bypass email confirmation
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createConfirmedUser() {
  console.log('🔧 Creating confirmed test user...');
  
  const testEmail = 'test@ally-demo.local';
  const testPassword = 'demo123456';
  
  try {
    // Create user with admin client (bypasses email confirmation)
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true // This bypasses email confirmation
    });
    
    if (error) {
      console.error('❌ Failed to create user:', error.message);
      return;
    }
    
    console.log('✅ Test user created successfully!');
    console.log('📧 Email:', testEmail);
    console.log('🔑 Password:', testPassword);
    console.log('🆔 User ID:', data.user?.id);
    console.log('✨ Email confirmed: YES');
    
    // Test sign in with regular client
    console.log('🔑 Testing sign in...');
    const supabaseClient = createClient(supabaseUrl, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbHpmcnpmd2h5Y2R6b3p4d2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNjE2NjQsImV4cCI6MjA3MjczNzY2NH0.aWqbefKFuWZHXbmgjp-a0_QoD17PBrxlIDH_hoIYd9g');
    
    const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    
    if (signInError) {
      console.error('❌ Sign in test failed:', signInError.message);
    } else {
      console.log('✅ Sign in test successful!');
      console.log('🎉 Ready to use in glass-pip-chat!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createConfirmedUser().then(() => {
  console.log('🏁 Test user creation complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Failed:', error);
  process.exit(1);
});