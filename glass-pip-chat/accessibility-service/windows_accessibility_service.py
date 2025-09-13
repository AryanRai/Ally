"""
Windows Accessibility Service

This service provides advanced accessibility monitoring using Windows APIs:
- UI Automation for element inspection
- Global text selection monitoring
- Screen reader integration
- Cursor position tracking
- Window information extraction

Requirements:
- pywin32
- comtypes
- psutil
- websockets (for communication with Electron app)

Usage:
python windows_accessibility_service.py
"""

import asyncio
import json
import logging
import time
import threading
from typing import Dict, List, Optional, Any
import websockets
import websockets.server

# Windows API imports
HAS_WINDOWS_APIS = False
import_errors = []

try:
    import win32api
    import win32con
    import win32gui
    import win32process
    import win32clipboard
    print("✅ pywin32 modules imported successfully")
except ImportError as e:
    import_errors.append(f"pywin32: {e}")

try:
    from comtypes import client
    print("✅ comtypes imported successfully")
except ImportError as e:
    import_errors.append(f"comtypes: {e}")

try:
    import psutil
    print("✅ psutil imported successfully")
except ImportError as e:
    import_errors.append(f"psutil: {e}")

# Try to initialize UI Automation
UIAutomationClient = None
try:
    from comtypes.gen import UIAutomationClient
    print("✅ UIAutomationClient imported successfully")
    HAS_WINDOWS_APIS = True
except ImportError as e:
    import_errors.append(f"UIAutomationClient: {e}")
    print("⚠️ UIAutomationClient not available, trying to generate...")
    
    # Try to generate the UI Automation client
    try:
        from comtypes.client import GetModule
        GetModule("UIAutomationCore.dll")
        from comtypes.gen import UIAutomationClient
        print("✅ UIAutomationClient generated and imported successfully")
        HAS_WINDOWS_APIS = True
    except Exception as e2:
        import_errors.append(f"UIAutomationClient generation: {e2}")

if import_errors:
    print("⚠️ Some import issues encountered:")
    for error in import_errors:
        print(f"  - {error}")
    
    if not HAS_WINDOWS_APIS:
        print("\n🔧 Troubleshooting steps:")
        print("1. Try running: python -m pip install --force-reinstall pywin32")
        print("2. Run: python Scripts/pywin32_postinstall.py -install")
        print("3. If using conda: conda install pywin32")
        print("4. Restart your terminal/IDE after installation")
else:
    print("✅ All Windows APIs imported successfully")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WindowsAccessibilityService:
    def __init__(self):
        self.clients = set()
        self.monitoring = False
        self.ui_automation = None
        self.last_context = {}
        
        if HAS_WINDOWS_APIS:
            try:
                # Initialize UI Automation
                self.ui_automation = client.CreateObject(
                    "{ff48dba4-60ef-4201-aa87-54103eef594e}",
                    interface=UIAutomationClient.IUIAutomation
                )
                logger.info("UI Automation initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize UI Automation: {e}")
                self.ui_automation = None

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

    def get_selected_text(self) -> Optional[str]:
        """Get currently selected text from any application"""
        if not HAS_WINDOWS_APIS:
            return None
            
        try:
            # Try to get text from focused element
            if self.ui_automation:
                focused_element = self.ui_automation.GetFocusedElement()
                if focused_element:
                    try:
                        # Try to get selection pattern
                        selection_pattern = focused_element.GetCurrentPattern(
                            UIAutomationClient.UIA_TextPatternId
                        )
                        if selection_pattern:
                            selections = selection_pattern.GetSelection()
                            if selections and len(selections) > 0:
                                return selections[0].GetText(-1)
                    except:
                        pass
            
            # Fallback: try clipboard (may contain recently selected text)
            try:
                win32clipboard.OpenClipboard()
                if win32clipboard.IsClipboardFormatAvailable(win32con.CF_TEXT):
                    data = win32clipboard.GetClipboardData(win32con.CF_TEXT)
                    win32clipboard.CloseClipboard()
                    if isinstance(data, bytes):
                        return data.decode('utf-8', errors='ignore')
                    return str(data)
            except:
                try:
                    win32clipboard.CloseClipboard()
                except:
                    pass
                    
        except Exception as e:
            logger.debug(f"Error getting selected text: {e}")
            
        return None

    def get_element_at_cursor(self) -> Optional[Dict[str, Any]]:
        """Get UI element at current cursor position"""
        if not HAS_WINDOWS_APIS or not self.ui_automation:
            return None
            
        try:
            # Get cursor position
            cursor_pos = win32gui.GetCursorPos()
            
            # Get element at point
            element = self.ui_automation.ElementFromPoint(
                UIAutomationClient.tagPOINT(cursor_pos[0], cursor_pos[1])
            )
            
            if element:
                # Get element properties
                name = element.CurrentName or ""
                automation_id = element.CurrentAutomationId or ""
                class_name = element.CurrentClassName or ""
                control_type = element.CurrentControlType
                
                # Get bounding rectangle
                rect = element.CurrentBoundingRectangle
                bounds = {
                    "x": rect.left,
                    "y": rect.top,
                    "width": rect.right - rect.left,
                    "height": rect.bottom - rect.top
                }
                
                # Try to get text content
                text = ""
                try:
                    value_pattern = element.GetCurrentPattern(
                        UIAutomationClient.UIA_ValuePatternId
                    )
                    if value_pattern:
                        text = value_pattern.CurrentValue or ""
                except:
                    text = name
                
                return {
                    "name": name,
                    "text": text,
                    "role": self.get_control_type_name(control_type),
                    "bounds": bounds,
                    "className": class_name,
                    "automationId": automation_id,
                    "isVisible": not element.CurrentIsOffscreen,
                    "isEnabled": element.CurrentIsEnabled
                }
                
        except Exception as e:
            logger.debug(f"Error getting element at cursor: {e}")
            
        return None

    def get_focused_element(self) -> Optional[Dict[str, Any]]:
        """Get currently focused UI element"""
        if not HAS_WINDOWS_APIS or not self.ui_automation:
            return None
            
        try:
            element = self.ui_automation.GetFocusedElement()
            if element:
                name = element.CurrentName or ""
                class_name = element.CurrentClassName or ""
                control_type = element.CurrentControlType
                
                # Try to get text content
                text = ""
                try:
                    value_pattern = element.GetCurrentPattern(
                        UIAutomationClient.UIA_ValuePatternId
                    )
                    if value_pattern:
                        text = value_pattern.CurrentValue or ""
                except:
                    text = name
                
                return {
                    "name": name,
                    "text": text,
                    "role": self.get_control_type_name(control_type),
                    "className": class_name,
                    "application": self.get_window_info()["application"],
                    "window": self.get_window_info()["title"]
                }
                
        except Exception as e:
            logger.debug(f"Error getting focused element: {e}")
            
        return None

    def get_window_info(self) -> Dict[str, Any]:
        """Get information about the active window"""
        if not HAS_WINDOWS_APIS:
            return {"title": "", "application": "", "processName": ""}
            
        try:
            # Get foreground window
            hwnd = win32gui.GetForegroundWindow()
            if hwnd:
                # Get window title
                title = win32gui.GetWindowText(hwnd)
                
                # Get process information
                _, process_id = win32process.GetWindowThreadProcessId(hwnd)
                
                try:
                    process = psutil.Process(process_id)
                    process_name = process.name()
                    
                    # Get window class
                    class_name = win32gui.GetClassName(hwnd)
                    
                    # Get window bounds
                    rect = win32gui.GetWindowRect(hwnd)
                    bounds = {
                        "x": rect[0],
                        "y": rect[1],
                        "width": rect[2] - rect[0],
                        "height": rect[3] - rect[1]
                    }
                    
                    return {
                        "title": title,
                        "application": process_name,
                        "processName": process_name,
                        "processId": process_id,
                        "className": class_name,
                        "bounds": bounds,
                        "isActive": True
                    }
                    
                except psutil.NoSuchProcess:
                    pass
                    
        except Exception as e:
            logger.debug(f"Error getting window info: {e}")
            
        return {"title": "", "application": "", "processName": ""}

    def get_cursor_position(self) -> Dict[str, int]:
        """Get current cursor position"""
        if not HAS_WINDOWS_APIS:
            return {"x": 0, "y": 0}
            
        try:
            x, y = win32gui.GetCursorPos()
            return {"x": x, "y": y}
        except Exception as e:
            logger.debug(f"Error getting cursor position: {e}")
            return {"x": 0, "y": 0}

    def get_control_type_name(self, control_type: int) -> str:
        """Convert UI Automation control type to readable name"""
        control_types = {
            50000: "button",
            50001: "calendar",
            50002: "checkbox",
            50003: "combobox",
            50004: "edit",
            50005: "hyperlink",
            50006: "image",
            50007: "listitem",
            50008: "list",
            50009: "menu",
            50010: "menubar",
            50011: "menuitem",
            50012: "progressbar",
            50013: "radiobutton",
            50014: "scrollbar",
            50015: "slider",
            50016: "spinner",
            50017: "statusbar",
            50018: "tab",
            50019: "tabitem",
            50020: "text",
            50021: "toolbar",
            50022: "tooltip",
            50023: "tree",
            50024: "treeitem",
            50025: "custom",
            50026: "group",
            50027: "thumb",
            50028: "datagrid",
            50029: "dataitem",
            50030: "document",
            50031: "splitbutton",
            50032: "window",
            50033: "pane",
            50034: "header",
            50035: "headeritem",
            50036: "table",
            50037: "titlebar",
            50038: "separator"
        }
        return control_types.get(control_type, "unknown")

    async def monitor_context(self):
        """Main monitoring loop"""
        logger.info("Starting accessibility context monitoring...")
        
        while self.monitoring:
            try:
                # Gather current context
                context = {
                    "selectedText": self.get_selected_text(),
                    "hoveredElement": self.get_element_at_cursor(),
                    "focusedElement": self.get_focused_element(),
                    "activeWindow": self.get_window_info(),
                    "cursorPosition": self.get_cursor_position(),
                    "timestamp": time.time()
                }
                
                # Only broadcast if context has changed significantly
                if self.has_context_changed(context):
                    await self.broadcast_context(context)
                    self.last_context = context
                
                # Wait before next check
                await asyncio.sleep(0.5)
                
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
        logger.info(f"Starting accessibility service on {host}:{port}")
        
        # Start monitoring in background
        self.monitoring = True
        monitor_task = asyncio.create_task(self.monitor_context())
        
        try:
            # Start WebSocket server
            async with websockets.serve(self.register_client, host, port):
                logger.info("Accessibility service is running...")
                await monitor_task
        except KeyboardInterrupt:
            logger.info("Shutting down accessibility service...")
        finally:
            self.monitoring = False
            if not monitor_task.done():
                monitor_task.cancel()

def main():
    """Main entry point"""
    if not HAS_WINDOWS_APIS:
        logger.error("Windows APIs not available. Please install required packages:")
        logger.error("pip install pywin32 comtypes psutil websockets")
        return
    
    service = WindowsAccessibilityService()
    
    try:
        asyncio.run(service.start_server())
    except KeyboardInterrupt:
        logger.info("Service stopped by user")
    except Exception as e:
        logger.error(f"Service error: {e}")

if __name__ == "__main__":
    main()