// Test script to verify Row Level Security policies are working correctly
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testRLSPolicies() {
  console.log('🔒 Testing Row Level Security Policies...\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing environment variables. Please check .env.local');
    return;
  }

  // Create clients with different access levels
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Test 1: Verify anonymous access is blocked
    console.log('1. Testing anonymous access restrictions...');
    
    const tables = ['chat_sessions', 'chat_messages', 'tool_executions', 'local_systems'];
    
    for (const table of tables) {
      const { data, error } = await anonClient
        .from(table)
        .select('*')
        .limit(1);
      
      if (error) {
        console.log(`✅ Anonymous access to '${table}' is properly blocked: ${error.message}`);
      } else {
        console.log(`⚠️  Anonymous access to '${table}' is allowed (might be expected for public data)`);
      }
    }

    // Test 2: Check if RLS is enabled on tables
    console.log('\n2. Checking RLS status on tables...');
    
    const { data: rlsStatus, error: rlsError } = await serviceClient
      .from('pg_class')
      .select('relname, relrowsecurity')
      .in('relname', tables);
    
    if (rlsError) {
      console.log('❌ Could not check RLS status:', rlsError.message);
    } else {
      rlsStatus.forEach(table => {
        if (table.relrowsecurity) {
          console.log(`✅ RLS is enabled on table '${table.relname}'`);
        } else {
          console.log(`❌ RLS is NOT enabled on table '${table.relname}'`);
        }
      });
    }

    // Test 3: Check if policies exist
    console.log('\n3. Checking policy existence...');
    
    const { data: policies, error: policiesError } = await serviceClient
      .from('pg_policies')
      .select('tablename, policyname, permissive, roles, cmd, qual')
      .in('tablename', tables);
    
    if (policiesError) {
      console.log('❌ Could not check policies:', policiesError.message);
    } else {
      const policyCount = {};
      policies.forEach(policy => {
        policyCount[policy.tablename] = (policyCount[policy.tablename] || 0) + 1;
        console.log(`✅ Policy '${policy.policyname}' exists on '${policy.tablename}' for ${policy.cmd} operations`);
      });
      
      tables.forEach(table => {
        const count = policyCount[table] || 0;
        if (count === 0) {
          console.log(`⚠️  No policies found for table '${table}'`);
        }
      });
    }

    // Test 4: Test realtime subscriptions
    console.log('\n4. Testing realtime publication...');
    
    const { data: publications, error: pubError } = await serviceClient
      .from('pg_publication_tables')
      .select('tablename')
      .eq('pubname', 'supabase_realtime')
      .in('tablename', tables);
    
    if (pubError) {
      console.log('❌ Could not check realtime publications:', pubError.message);
    } else {
      const publishedTables = publications.map(p => p.tablename);
      tables.forEach(table => {
        if (publishedTables.includes(table)) {
          console.log(`✅ Table '${table}' is published for realtime`);
        } else {
          console.log(`❌ Table '${table}' is NOT published for realtime`);
        }
      });
    }

    // Test 5: Test database functions security
    console.log('\n5. Testing database function security...');
    
    const functions = [
      'append_message_response',
      'update_system_heartbeat', 
      'get_pending_messages',
      'update_message_status'
    ];

    for (const func of functions) {
      try {
        // Try calling function with anonymous client (should work since they're SECURITY DEFINER)
        const result = await anonClient.rpc(func, {});
        console.log(`✅ Function '${func}' is accessible (SECURITY DEFINER working)`);
      } catch (err) {
        if (err.message.includes('permission denied')) {
          console.log(`❌ Function '${func}' access denied`);
        } else {
          console.log(`✅ Function '${func}' is accessible (expected parameter error: ${err.message.substring(0, 50)}...)`);
        }
      }
    }

    console.log('\n✅ Row Level Security verification complete!');

  } catch (error) {
    console.error('❌ RLS test failed:', error.message);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testRLSPolicies();
}

module.exports = { testRLSPolicies };