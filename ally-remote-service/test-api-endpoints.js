// Test script to verify API endpoints work
const http = require('http')

async function testAPIEndpoints() {
  console.log('🧪 Testing API Endpoints...\n')

  // Test 1: Test the streaming endpoint
  console.log('1. Testing streaming endpoint...')
  
  try {
    const response = await fetch('http://localhost:3001/api/stream')
    console.log('✅ Streaming endpoint response status:', response.status)
    console.log('✅ Content-Type:', response.headers.get('content-type'))
    
    if (response.status === 200) {
      console.log('✅ Streaming endpoint is accessible')
    } else {
      console.log('⚠️ Streaming endpoint returned status:', response.status)
    }
  } catch (error) {
    console.log('❌ Streaming endpoint test failed:', error.message)
    console.log('💡 Make sure the dev server is running on port 3001')
  }

  // Test 2: Test the messages endpoint
  console.log('\n2. Testing messages endpoint...')
  
  try {
    const response = await fetch('http://localhost:3001/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Test message for API endpoint',
        metadata: { test: true }
      })
    })
    
    console.log('✅ Messages endpoint response status:', response.status)
    
    if (response.status === 200) {
      const data = await response.json()
      console.log('✅ Message created with ID:', data.messageId)
      console.log('✅ Session ID:', data.sessionId)
    } else {
      const errorData = await response.json()
      console.log('⚠️ Messages endpoint error:', errorData)
    }
  } catch (error) {
    console.log('❌ Messages endpoint test failed:', error.message)
  }

  console.log('\n🎉 API endpoint tests completed!')
  console.log('\n📝 Next steps:')
  console.log('   - Start the dev server: npm run dev')
  console.log('   - Open http://localhost:3001 in your browser')
  console.log('   - Test the chat interface manually')
  console.log('   - Check browser dev tools for streaming events')
}

// Check if fetch is available (Node 18+)
if (typeof fetch === 'undefined') {
  console.log('❌ This test requires Node.js 18+ with built-in fetch support')
  console.log('💡 Your Node.js version:', process.version)
  process.exit(1)
}

// Run the test
testAPIEndpoints()
  .then(() => {
    console.log('\n✨ Test completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error)
    process.exit(1)
  })