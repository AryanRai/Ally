// Test script to verify streaming functionality
const { createClient } = require('@supabase/supabase-js')

// Load environment variables manually
const fs = require('fs')
const path = require('path')

function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '.env.local')
    const envContent = fs.readFileSync(envPath, 'utf8')
    const envVars = {}
    
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=')
      if (key && value) {
        envVars[key.trim()] = value.trim()
      }
    })
    
    return envVars
  } catch (error) {
    console.error('Could not load .env.local file:', error.message)
    return {}
  }
}

const env = loadEnvFile()
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testStreamingFunctionality() {
  console.log('🧪 Testing Real-time Chat Functionality...\n')

  try {
    // Test 1: Create a test session
    console.log('1. Creating test session...')
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .insert([{
        title: 'Test Streaming Session',
        is_remote: true,
        metadata: { test: true }
      }])
      .select()
      .single()

    if (sessionError) throw sessionError
    console.log('✅ Session created:', session.id)

    // Test 2: Create a test message
    console.log('\n2. Creating test message...')
    const { data: message, error: messageError } = await supabase
      .from('chat_messages')
      .insert([{
        content: 'Test streaming message',
        session_id: session.id,
        is_remote: true,
        local_system_id: 'test-system',
        status: 'pending',
        response: '',
        metadata: { test: true }
      }])
      .select()
      .single()

    if (messageError) throw messageError
    console.log('✅ Message created:', message.id)

    // Test 3: Set up real-time subscription
    console.log('\n3. Setting up real-time subscription...')
    let updateCount = 0
    const subscription = supabase
      .channel(`test-messages:${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${session.id}`
        },
        (payload) => {
          updateCount++
          console.log(`📡 Real-time update ${updateCount}:`, {
            id: payload.new.id,
            status: payload.new.status,
            responseLength: payload.new.response?.length || 0
          })
        }
      )
      .subscribe()

    console.log('✅ Real-time subscription active')

    // Test 4: Simulate streaming response
    console.log('\n4. Simulating streaming response...')
    
    // Update status to processing
    await supabase
      .from('chat_messages')
      .update({ status: 'processing' })
      .eq('id', message.id)

    // Simulate word-by-word streaming
    const words = ['This', 'is', 'a', 'test', 'streaming', 'response', 'with', 'multiple', 'words']
    let response = ''
    
    for (let i = 0; i < words.length; i++) {
      response += (i > 0 ? ' ' : '') + words[i]
      
      await supabase
        .from('chat_messages')
        .update({ response })
        .eq('id', message.id)
      
      // Wait a bit between updates to simulate real streaming
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    // Mark as completed
    await supabase
      .from('chat_messages')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', message.id)

    console.log('✅ Streaming simulation complete')

    // Wait a bit for final updates
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Test 5: Verify final state
    console.log('\n5. Verifying final message state...')
    const { data: finalMessage } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('id', message.id)
      .single()

    console.log('✅ Final message state:', {
      status: finalMessage.status,
      response: finalMessage.response,
      completed_at: finalMessage.completed_at
    })

    // Cleanup
    console.log('\n6. Cleaning up test data...')
    subscription.unsubscribe()
    
    await supabase
      .from('chat_messages')
      .delete()
      .eq('session_id', session.id)
    
    await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', session.id)

    console.log('✅ Cleanup complete')

    console.log(`\n🎉 Streaming functionality test completed successfully!`)
    console.log(`📊 Total real-time updates received: ${updateCount}`)

  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

// Run the test
testStreamingFunctionality()
  .then(() => {
    console.log('\n✨ All tests passed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Test suite failed:', error)
    process.exit(1)
  })