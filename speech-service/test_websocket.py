#!/usr/bin/env python3
"""
Simple WebSocket test for the speech service
Tests basic connectivity without requiring full speech models
"""

import asyncio
import websockets
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_websocket_connection():
    """Test basic WebSocket connection"""
    uri = "ws://localhost:8765"
    
    try:
        logger.info(f"Connecting to {uri}...")
        async with websockets.connect(uri) as websocket:
            logger.info("✅ Connected successfully!")
            
            # Test 1: Send get_status command
            logger.info("📡 Sending status request...")
            await websocket.send(json.dumps({
                "command": "get_status",
                "payload": {}
            }))
            
            # Wait for response
            response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            data = json.loads(response)
            logger.info(f"📊 Received response: {data}")
            
            # Test 2: Send invalid command
            logger.info("🧪 Testing error handling...")
            await websocket.send(json.dumps({
                "command": "invalid_command",
                "payload": {}
            }))
            
            # Wait for response (might be error or no response)
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                data = json.loads(response)
                logger.info(f"🔍 Error response: {data}")
            except asyncio.TimeoutError:
                logger.info("⏰ No response to invalid command (expected)")
            
            logger.info("✅ WebSocket test completed successfully!")
            
    except (ConnectionRefusedError, OSError) as e:
        logger.error(f"❌ Connection refused - is the speech service running? Error: {e}")
        logger.info("💡 Start the service with: python start_service.py")
        return False
    except Exception as e:
        logger.error(f"❌ Test failed: {e}")
        return False
    
    return True

async def main():
    """Main test function"""
    logger.info("🧪 Testing WebSocket connection to speech service...")
    success = await test_websocket_connection()
    
    if success:
        logger.info("🎉 WebSocket test passed!")
    else:
        logger.error("💥 WebSocket test failed!")
    
    return success

if __name__ == "__main__":
    try:
        result = asyncio.run(main())
        exit(0 if result else 1)
    except KeyboardInterrupt:
        logger.info("⏹️  Test interrupted")
        exit(1)