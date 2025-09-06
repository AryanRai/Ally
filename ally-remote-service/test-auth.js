const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log('Testing authentication and RLS...')
console.log('Supabase URL:', supabaseUrl)
console.log('Anon Key:', supabaseAnonKey ? 'Present' : 'Missing')

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testAuth() {
  try {
    // Test 1: Check if we can connect to Supabase
    console.log('\n1. Testing Supabase connection...')
    const { data, error } = await supabase.from('chat_sessions').select('count').limit(1)
    if (error) {
      console.log('❌ Connection failed:', error.message)
      return
    }
    console.log('✅ Connected to Supabase')

    // Test 2: Try to sign in with existing user
    console.log('\n2. Testing user signin...')
    const testEmail = `buzzaryanrai@gmail.com`
    const testPassword = 'Aryanrai@2000'
    
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    })

    if (signInError) {
      console.log('❌ Signin failed:', signInError.message)
      return
    }
    console.log('✅ User signed in:', signInData.user?.email)

    // Test 3: Check current user
    console.log('\n3. Checking current user...')
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) {
      console.log('❌ Failed to get user:', userError.message)
      return
    }
    console.log('✅ Current user:', user?.email, 'ID:', user?.id)

    // Test 4: Try to create a session with explicit user_id
    console.log('\n4. Testing session creation...')
    const { data: sessionData, error: sessionError } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: user.id,
        title: 'Test Session',
        is_remote: true,
        metadata: { test: true }
      })
      .select()
      .single()

    if (sessionError) {
      console.log('❌ Session creation failed:', sessionError.message)
      console.log('Error details:', sessionError)
    } else {
      console.log('✅ Session created:', sessionData.id)
    }

    // Test 5: Clean up - delete the test session
    if (sessionData) {
      console.log('\n5. Cleaning up...')
      await supabase.from('chat_sessions').delete().eq('id', sessionData.id)
      console.log('✅ Test session deleted')
    }

    // Test 6: Sign out
    console.log('\n6. Signing out...')
    await supabase.auth.signOut()
    console.log('✅ Signed out')

  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

testAuth()