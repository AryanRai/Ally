#!/usr/bin/env python3
"""
Simple test script to verify TTS functionality
"""

import asyncio
import websockets
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_tts():
    """Test TTS functionality"""
    uri = "ws://localhost:8765"
    
    try:
        async with websockets.connect(uri) as websocket:
            logger.info("Connected to speech service")
            
            # Test TTS
            message = {
                "command": "synthesize_speech",
                "payload": {
                    "text": "Hello, this is a test of the TTS system."
                },
                "timestamp": 1234567890
            }
            
            await websocket.send(json.dumps(message))
            logger.info("Sent TTS request")
            
            # Wait for response
            response = await websocket.recv()
            data = json.loads(response)
            
            logger.info(f"Received response: {data['command']}")
            
            if data['command'] == 'speech_generated':
                logger.info("✅ TTS test successful!")
                logger.info(f"Audio data length: {len(data['payload']['audio_data'])} bytes")
            elif data['command'] == 'speech_error':
                logger.error(f"❌ TTS test failed: {data['payload']['error']}")
            else:
                logger.warning(f"Unexpected response: {data}")
                
    except Exception as e:
        logger.error(f"Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_tts())