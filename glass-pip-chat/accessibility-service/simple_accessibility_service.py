"""
Simple Accessibility Service (Fallback)

A simplified version that works without full Windows API dependencies.
Provides basic functionality for testing and development.

Usage:
python simple_accessibility_service.py
"""

import asyncio
import json
import logging
import time
import threading
from typing import Dict, List, Optional, Any
import websockets
import websockets.server

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SimpleAccessibilityService:
    def __init__(self):
        self.clients = set()
        self.monitoring = False
        self.last_context = {}
        self.mock_data_counter = 0
        
    async def register_client(self, websocket, path):
        """Register a new WebSocket client"""
        self.clients.add(websocket)
        logger.info(f"Client connected: {websocket.remote_address}")
        
        try:
            await websocket.wait_closed()
        finally:
            self.clients.remove(websocket)
            logger.info(f"Client disconnected: {websocket.remote_address}")

    async def broadcast_context(self, context: Dict[str, Any]):
        """Broadcast context update to all connected clients"""
        if not self.clients:
            return
            
        message = json.dumps({
            "type": "context_update",
            "data": context,
            "timestamp": time.time()
        })
        
        # Send to all connected clients
        disconnected = set()
        for client in self.clients:
            try:
                await client.send(message)
            except websockets.exceptions.ConnectionClosed:
                disconnected.add(client)
            except Exception as e:
                logger.error(f"Error sending to client: {e}")
                disconnected.add(client)
        
        # Remove disconnected clients
        self.clients -= disconnected

    def get_mock_context(self) -> Dict[str, Any]:
        """Generate mock accessibility context for testing"""
        self.mock_data_counter += 1
        
        # Simulate different types of context
        contexts = [
            {
                "selectedText": "This is some selected text from a document",
                "hoveredElement": {
                    "name": "Submit Button",
                    "text": "Submit",
                    "role": "button",
                    "bounds": {"x": 100, "y": 200, "width": 80, "height": 30},
                    "isVisible": True,
                    "isEnabled": True
                },
                "activeWindow": {
                    "title": "Document Editor - MyDocument.docx",
                    "application": "winword.exe",
                    "processName": "winword.exe",
                    "isActive": True
                }
            },
            {
                "selectedText": "function calculateTotal(items) { return items.reduce((sum, item) => sum + item.price, 0); }",
                "focusedElement": {
                    "name": "Code Editor",
                    "text": "function calculateTotal",
                    "role": "edit",
                    "application": "Code.exe",
                    "window": "Visual Studio Code"
                },
                "activeWindow": {
                    "title": "main.js - MyProject - Visual Studio Code",
                    "application": "Code.exe",
                    "processName": "Code.exe",
                    "isActive": True
                }
            },
            {
                "hoveredElement": {
                    "name": "Search Box",
                    "text": "Search the web",
                    "role": "textbox",
                    "bounds": {"x": 300, "y": 100, "width": 400, "height": 35},
                    "description": "Enter your search query",
                    "isVisible": True,
                    "isEnabled": True
                },
                "activeWindow": {
                    "title": "Google - Mozilla Firefox",
                    "application": "firefox.exe",
                    "processName": "firefox.exe",
                    "url": "https://www.google.com",
                    "isActive": True
                }
            },
            {
                "selectedText": "The quick brown fox jumps over the lazy dog",
                "activeWindow": {
                    "title": "Notepad",
                    "application": "notepad.exe",
                    "processName": "notepad.exe",
                    "isActive": True
                }
            }
        ]
        
        # Cycle through different contexts
        context_index = (self.mock_data_counter // 10) % len(contexts)
        base_context = contexts[context_index].copy()
        
        # Add common fields
        base_context.update({
            "cursorPosition": {"x": 500 + (self.mock_data_counter % 100), "y": 300 + (self.mock_data_counter % 50)},
            "timestamp": time.time()
        })
        
        return base_context

    async def monitor_context(self):
        """Main monitoring loop with mock data"""
        logger.info("Starting simple accessibility context monitoring...")
        
        while self.monitoring:
            try:
                # Generate mock context
                context = self.get_mock_context()
                
                # Only broadcast if context has changed significantly
                if self.has_context_changed(context):
                    await self.broadcast_context(context)
                    self.last_context = context
                    logger.info(f"Broadcasted context update: {context.get('selectedText', 'No text')[:50]}...")
                
                # Wait before next check
                await asyncio.sleep(2)  # Slower for demo purposes
                
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(1)

    def has_context_changed(self, new_context: Dict[str, Any]) -> bool:
        """Check if context has changed meaningfully"""
        if not self.last_context:
            return True
            
        # Check for changes in key fields
        key_fields = ["selectedText", "hoveredElement", "focusedElement", "activeWindow"]
        
        for field in key_fields:
            if new_context.get(field) != self.last_context.get(field):
                return True
                
        return False

    async def start_server(self, host="localhost", port=8766):
        """Start the WebSocket server"""
        logger.info(f"Starting simple accessibility service on {host}:{port}")
        logger.info("This is a MOCK service for testing - it generates fake accessibility data")
        
        # Start monitoring in background
        self.monitoring = True
        monitor_task = asyncio.create_task(self.monitor_context())
        
        try:
            # Start WebSocket server
            async with websockets.serve(self.register_client, host, port):
                logger.info("Simple accessibility service is running...")
                logger.info("Connect your Electron app to see mock accessibility data")
                await monitor_task
        except KeyboardInterrupt:
            logger.info("Shutting down simple accessibility service...")
        finally:
            self.monitoring = False
            if not monitor_task.done():
                monitor_task.cancel()

def main():
    """Main entry point"""
    print("🚀 Starting Simple Accessibility Service")
    print("📝 This service provides MOCK data for testing purposes")
    print("🔧 For real Windows API integration, use windows_accessibility_service.py")
    print()
    
    service = SimpleAccessibilityService()
    
    try:
        asyncio.run(service.start_server())
    except KeyboardInterrupt:
        logger.info("Service stopped by user")
    except Exception as e:
        logger.error(f"Service error: {e}")

if __name__ == "__main__":
    main()