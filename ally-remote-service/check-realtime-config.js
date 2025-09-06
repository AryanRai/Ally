// Check realtime configuration using service client
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function checkRealtimeConfig() {
  console.log('📡 Checking Realtime Configuration...\n');

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing environment variables');
    return;
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Check which tables are published for realtime
    console.log('1. Checking realtime publication...');
    
    const { data: publications, error: pubError } = await serviceClient
      .from('pg_publication_tables')
      .select('tablename, pubname')
      .eq('pubname', 'supabase_realtime');
    
    if (pubError) {
      console.log('❌ Could not check publications:', pubError.message);
    } else {
      const tables = ['chat_sessions', 'chat_messages', 'tool_executions', 'local_systems'];
      const publishedTables = publications.map(p => p.tablename);
      
      tables.forEach(table => {
        if (publishedTables.includes(table)) {
          console.log(`✅ Table '${table}' is published for realtime`);
        } else {
          console.log(`❌ Table '${table}' is NOT published for realtime`);
        }
      });
    }

    // Test realtime subscription with service client
    console.log('\n2. Testing realtime subscription with service client...');
    
    let eventReceived = false;
    
    const channel = serviceClient
      .channel('test-realtime')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'chat_messages' },
        (payload) => {
          console.log('✅ Realtime event received:', payload.eventType);
          eventReceived = true;
        }
      );
    
    const subscribeResult = await channel.subscribe();
    
    if (subscribeResult === 'SUBSCRIBED') {
      console.log('✅ Realtime subscription successful with service client');
      
      // Test by inserting a message
      console.log('\n3. Testing realtime events...');
      
      const { data: testMessage, error: insertError } = await serviceClient
        .from('chat_messages')
        .insert({
          user_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
          session_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
          content: 'Realtime test message',
          is_remote: true,
          local_system_id: 'test-system'
        })
        .select()
        .single();
      
      if (insertError) {
        console.log('❌ Could not insert test message:', insertError.message);
      } else {
        console.log('✅ Test message inserted');
        
        // Wait a moment for realtime event
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (eventReceived) {
          console.log('✅ Realtime event was received');
        } else {
          console.log('⚠️  No realtime event received (might be due to RLS)');
        }
        
        // Clean up test message
        await serviceClient
          .from('chat_messages')
          .delete()
          .eq('id', testMessage.id);
      }
      
      await channel.unsubscribe();
    } else {
      console.log('❌ Realtime subscription failed');
    }

    console.log('\n✅ Realtime configuration check complete!');

  } catch (error) {
    console.error('❌ Realtime check failed:', error.message);
  }
}

// Run the check
if (require.main === module) {
  checkRealtimeConfig();
}

module.exports = { checkRealtimeConfig };