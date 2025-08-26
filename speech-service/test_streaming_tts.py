#!/usr/bin/env python3
"""
Test script for streaming TTS functionality
"""

import asyncio
import json
import websockets
import time

async def test_streaming_tts():
    """Test the streaming TTS functionality"""
    uri = "ws://localhost:8765"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to speech service")
            
            # Test text with multiple sentences
            test_text = "Hello there! This is a test of streaming text-to-speech. Each sentence should be processed separately. The system should generate audio for each complete sentence as it arrives. This allows for much more responsive speech output."
            
            # Send streaming TTS request
            request = {
                "command": "synthesize_speech",
                "payload": {
                    "text": test_text,
                    "streaming": True
                },
                "timestamp": time.time()
            }
            
            print(f"📤 Sending streaming TTS request: {test_text[:50]}...")
            await websocket.send(json.dumps(request))
            
            # Listen for responses
            chunk_count = 0
            start_time = time.time()
            
            while True:
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=30.0)
                    data = json.loads(response)
                    
                    command = data.get('command')
                    payload = data.get('payload', {})
                    
                    if command == 'tts_stream_start':
                        print(f"🎬 TTS streaming started - {payload.get('total_sentences', 0)} sentences")
                        
                    elif command == 'tts_stream_chunk':
                        chunk_count += 1
                        chunk_text = payload.get('text', '')
                        chunk_index = payload.get('chunk_index', 0)
                        total_chunks = payload.get('total_chunks', 0)
                        audio_size = len(payload.get('audio_data', ''))
                        
                        print(f"🎵 Chunk {chunk_index + 1}/{total_chunks}: '{chunk_text[:30]}...' ({audio_size} bytes)")
                        
                    elif command == 'tts_stream_complete':
                        elapsed = time.time() - start_time
                        print(f"✅ TTS streaming completed in {elapsed:.2f}s - {chunk_count} chunks")
                        break
                        
                    elif command == 'tts_stream_error':
                        print(f"❌ TTS streaming error: {payload}")
                        break
                        
                    elif command == 'speech_error':
                        print(f"❌ Speech error: {payload}")
                        break
                        
                except asyncio.TimeoutError:
                    print("⏰ Timeout waiting for response")
                    break
                    
    except Exception as e:
        print(f"❌ Connection error: {e}")

if __name__ == "__main__":
    print("🧪 Testing streaming TTS...")
    asyncio.run(test_streaming_tts())