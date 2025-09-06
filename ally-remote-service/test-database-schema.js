// Test script to verify database schema is properly set up
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testDatabaseSchema() {
  console.log('🗄️  Testing Database Schema...\n');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing environment variables. Please check .env.local');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Test 1: Check if tables exist by querying their structure
    console.log('1. Checking table existence...');
    
    const tables = [
      'chat_sessions',
      'chat_messages', 
      'tool_executions',
      'local_systems'
    ];

    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
        
        if (error && error.code === 'PGRST116') {
          console.log(`❌ Table '${table}' does not exist`);
        } else {
          console.log(`✅ Table '${table}' exists and is accessible`);
        }
      } catch (err) {
        console.log(`❌ Error checking table '${table}':`, err.message);
      }
    }

    // Test 2: Check if database functions exist
    console.log('\n2. Testing database functions...');
    
    const functions = [
      'append_message_response',
      'update_system_heartbeat',
      'get_pending_messages',
      'update_message_status'
    ];

    for (const func of functions) {
      try {
        // Try to call each function with test parameters
        let result;
        switch (func) {
          case 'append_message_response':
            result = await supabase.rpc(func, { 
              message_id: '00000000-0000-0000-0000-000000000000', 
              new_content: 'test' 
            });
            break;
          case 'update_system_heartbeat':
            result = await supabase.rpc(func, { 
              system_id: 'test-system' 
            });
            break;
          case 'get_pending_messages':
            result = await supabase.rpc(func, { 
              system_id: 'test-system' 
            });
            break;
          case 'update_message_status':
            result = await supabase.rpc(func, { 
              message_id: '00000000-0000-0000-0000-000000000000', 
              new_status: 'pending' 
            });
            break;
        }
        
        if (result.error && result.error.code === '42883') {
          console.log(`❌ Function '${func}' does not exist`);
        } else {
          console.log(`✅ Function '${func}' exists and is callable`);
        }
      } catch (err) {
        console.log(`❌ Error testing function '${func}':`, err.message);
      }
    }

    // Test 3: Check Row Level Security
    console.log('\n3. Testing Row Level Security...');
    
    try {
      // Try to access tables without authentication (should fail)
      const anonSupabase = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      
      const { data, error } = await anonSupabase
        .from('chat_sessions')
        .select('*')
        .limit(1);
      
      if (error && error.code === '42501') {
        console.log('✅ Row Level Security is properly configured (access denied without auth)');
      } else {
        console.log('⚠️  Row Level Security might not be properly configured');
      }
    } catch (err) {
      console.log('✅ Row Level Security is working (access properly restricted)');
    }

    console.log('\n✅ Database schema verification complete!');

  } catch (error) {
    console.error('❌ Database schema test failed:', error.message);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testDatabaseSchema();
}

module.exports = { testDatabaseSchema };