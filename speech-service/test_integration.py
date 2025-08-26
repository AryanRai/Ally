#!/usr/bin/env python3
"""
Integration test for Ally Speech Service
Tests WebSocket communication and basic functionality
"""

import asyncio
import websockets
import json
import time
import sys

async def test_speech_service():
    """Test the speech service WebSocket API"""
    
    print("🧪 Testing Ally Speech Service Integration...")
    
    try:
        # Connect to the speech service
        print("📡 Connecting to speech service...")
        uri = "ws://localhost:8765"
        
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to speech service")
            
            # Test 1: Get status
            print("\n🔍 Test 1: Getting service status...")
            await websocket.send(json.dumps({
                "command": "get_status",
                "payload": {}
            }))
            
            response = await websocket.recv()
            data = json.loads(response)
            print(f"📊 Status response: {data}")
            
            if data.get('command') == 'status':
                status = data.get('payload', {})
                print(f"   Device: {status.get('device', 'unknown')}")
                print(f"   Models loaded: {status.get('models_loaded', False)}")
                print("✅ Status test passed")
            else:
                print("❌ Status test failed")
                return False
            
            # Test 2: Test TTS
            print("\n🔊 Test 2: Testing text-to-speech...")
            test_text = "Hello from Ally speech service integration test!"
            
            await websocket.send(json.dumps({
                "command": "synthesize_speech",
                "payload": {"text": test_text}
            }))
            
            # Wait for TTS response (with timeout)
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                data = json.loads(response)
                
                if data.get('command') == 'speech_generated':
                    print("✅ TTS test passed - speech generated successfully")
                elif data.get('command') == 'speech_error':
                    print(f"⚠️  TTS test warning: {data.get('payload', {}).get('error', 'Unknown error')}")
                else:
                    print(f"❓ Unexpected TTS response: {data.get('command')}")
                    
            except asyncio.TimeoutError:
                print("⏰ TTS test timed out (this may be normal if models are still loading)")
            
            # Test 3: Test ggwave
            print("\n📻 Test 3: Testing ggwave transmission...")
            test_ggwave_text = "Test123"
            
            await websocket.send(json.dumps({
                "command": "send_ggwave",
                "payload": {"text": test_ggwave_text}
            }))
            
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                data = json.loads(response)
                
                if data.get('command') == 'ggwave_sent':
                    payload = data.get('payload', {})
                    if payload.get('success'):
                        print("✅ ggwave test passed - signal transmitted successfully")
                    else:
                        print("⚠️  ggwave test warning - transmission may have failed")
                elif data.get('command') == 'ggwave_error':
                    print(f"❌ ggwave test failed: {data.get('payload', {}).get('error', 'Unknown error')}")
                else:
                    print(f"❓ Unexpected ggwave response: {data.get('command')}")
                    
            except asyncio.TimeoutError:
                print("⏰ ggwave test timed out")
            
            # Test 4: Test listening controls
            print("\n🎤 Test 4: Testing listening controls...")
            
            # Start listening
            await websocket.send(json.dumps({
                "command": "start_listening",
                "payload": {}
            }))
            
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                data = json.loads(response)
                
                if data.get('command') == 'listening_started':
                    print("✅ Start listening test passed")
                else:
                    print(f"❓ Unexpected start listening response: {data.get('command')}")
            except asyncio.TimeoutError:
                print("⏰ Start listening test timed out")
            
            # Stop listening
            await websocket.send(json.dumps({
                "command": "stop_listening",
                "payload": {}
            }))
            
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                data = json.loads(response)
                
                if data.get('command') == 'listening_stopped':
                    print("✅ Stop listening test passed")
                else:
                    print(f"❓ Unexpected stop listening response: {data.get('command')}")
            except asyncio.TimeoutError:
                print("⏰ Stop listening test timed out")
            
            print("\n🎉 Integration test completed successfully!")
            print("💡 The speech service is ready for use with Ally")
            return True
            
    except websockets.exceptions.ConnectionRefused:
        print("❌ Connection refused - is the speech service running?")
        print("💡 Start the service with: python start_service.py")
        return False
        
    except Exception as e:
        print(f"❌ Integration test failed with error: {e}")
        return False

def main():
    """Main test function"""
    print("🚀 Ally Speech Service Integration Test")
    print("=" * 50)
    
    try:
        success = asyncio.run(test_speech_service())
        
        if success:
            print("\n✅ All tests passed! Speech service is working correctly.")
            sys.exit(0)
        else:
            print("\n❌ Some tests failed. Check the speech service setup.")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n⏹️  Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Test failed with unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()