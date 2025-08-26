#!/usr/bin/env python3
"""
Minimal Speech Service for testing WebSocket connectivity
Doesn't load heavy AI models, just tests the communication layer
"""

import asyncio
import websockets
import json
import logging
import time
from dataclasses import dataclass

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class MinimalConfig:
    websocket_host: str = "localhost"
    websocket_port: int = 8765

class MinimalSpeechService:
    """Minimal speech service for testing"""
    
    def __init__(self):
        self.config = MinimalConfig()
        self.websocket_clients = set()
        self.running = False
    
    async def start_websocket_server(self):
        """Start WebSocket server"""
        async def handle_client(websocket, path=None):
            client_addr = getattr(websocket, 'remote_address', 'unknown')
            logger.info(f"New WebSocket client connected: {client_addr}")
            self.websocket_clients.add(websocket)
            
            try:
                async for message in websocket:
                    try:
                        await self._handle_websocket_message(websocket, message)
                    except Exception as msg_error:
                        logger.error(f"Error handling message: {msg_error}")
                        await self._send_response(websocket, 'error', {
                            'error': str(msg_error)
                        })
                            
            except websockets.exceptions.ConnectionClosed:
                logger.info(f"WebSocket client disconnected: {client_addr}")
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
            finally:
                self.websocket_clients.discard(websocket)
        
        logger.info(f"Starting minimal WebSocket server on {self.config.websocket_host}:{self.config.websocket_port}")
        return await websockets.serve(
            handle_client,
            self.config.websocket_host,
            self.config.websocket_port
        )
    
    async def _handle_websocket_message(self, websocket, message):
        """Handle incoming WebSocket messages"""
        try:
            data = json.loads(message)
            command = data.get('command')
            payload = data.get('payload', {})
            
            logger.info(f"Received command: {command}")
            
            if command == 'get_status':
                await self._send_response(websocket, 'status', {
                    'listening': False,
                    'device': 'cpu',
                    'models_loaded': False,
                    'service_type': 'minimal'
                })
                
            elif command == 'start_listening':
                await self._send_response(websocket, 'listening_started', {'status': 'ok'})
                
            elif command == 'stop_listening':
                await self._send_response(websocket, 'listening_stopped', {'status': 'ok'})
                
            elif command == 'synthesize_speech':
                text = payload.get('text', '')
                logger.info(f"TTS request for: {text}")
                await self._send_response(websocket, 'speech_error', {
                    'error': 'TTS not available in minimal service'
                })
                
            elif command == 'send_ggwave':
                text = payload.get('text', '')
                logger.info(f"ggwave request for: {text}")
                await self._send_response(websocket, 'ggwave_error', {
                    'error': 'ggwave not available in minimal service'
                })
                
            else:
                logger.warning(f"Unknown command: {command}")
                await self._send_response(websocket, 'error', {
                    'error': f'Unknown command: {command}'
                })
                
        except json.JSONDecodeError:
            logger.error("Invalid JSON received")
            await self._send_response(websocket, 'error', {
                'error': 'Invalid JSON'
            })
    
    async def _send_response(self, websocket, command, payload):
        """Send response to WebSocket client"""
        try:
            response = json.dumps({
                'command': command,
                'payload': payload,
                'timestamp': time.time()
            })
            await websocket.send(response)
        except Exception as e:
            logger.error(f"Error sending response: {e}")
    
    async def start(self):
        """Start the minimal service"""
        logger.info("Starting Minimal Speech Service for testing...")
        
        self.running = True
        
        # Start WebSocket server
        server = await self.start_websocket_server()
        
        logger.info("✅ Minimal speech service started successfully!")
        logger.info("🔗 WebSocket server ready for connections")
        logger.info("⚠️  Note: This is a minimal service - AI models are not loaded")
        
        try:
            # Keep the service running
            while self.running:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            logger.info("Received shutdown signal")
        finally:
            self.running = False
            logger.info("Minimal speech service stopped")

async def main():
    """Main entry point"""
    service = MinimalSpeechService()
    await service.start()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Service interrupted by user")
    except Exception as e:
        logger.error(f"Service failed: {e}")
        exit(1)