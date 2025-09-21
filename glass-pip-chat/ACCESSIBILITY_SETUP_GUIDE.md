# Accessibility Setup Guide

## Quick Start (Recommended)

### 1. Start the Mock Service (For Testing)
```bash
cd accessibility-service
python simple_accessibility_service.py
```

This provides fake accessibility data to test the integration without Windows API dependencies.

### 2. Start Your Electron App
The app will automatically connect to the accessibility service and show context updates in the accessibility panel.

### 3. Test the Integration
- Open the accessibility context monitor in the app
- You should see mock data flowing in real-time
- Try the "Include context in messages" feature

## Full Windows API Setup (Advanced)

### 1. Fix pywin32 Installation
```bash
cd accessibility-service
fix_pywin32.bat
```

### 2. Start the Full Service
```bash
start_service.bat
```
Choose option 1 for the full Windows API service.

### 3. Verify Real Data
The service will now capture:
- Real selected text from any Windows application
- Actual UI elements you hover over
- True focused elements and window information
- Live cursor position tracking

## Features Available

### 🔍 **Context Monitoring**
- **Selected Text**: Captures text selected in any Windows app
- **Hovered Elements**: Identifies UI elements under your cursor
- **Focused Elements**: Tracks currently focused inputs/controls
- **Active Windows**: Shows current application and window titles
- **Cursor Position**: Real-time mouse position tracking

### 🤖 **Chat Integration**
- **Auto Context**: Automatically includes relevant context in messages
- **Smart Filtering**: Only includes meaningful context changes
- **Context History**: Maintains recent selections and interactions
- **Manual Control**: Toggle context inclusion per message

### ⚙️ **Settings & Control**
- **Service Control**: Start/stop monitoring from the app
- **Context Preferences**: Choose what context to capture
- **Privacy Controls**: All processing is local and user-controlled
- **Visual Indicators**: Clear feedback when context is available

## Troubleshooting

### Service Won't Start
1. Try the simple service first: `python simple_accessibility_service.py`
2. Run the fix script: `fix_pywin32.bat`
3. Check the troubleshooting guide: `TROUBLESHOOTING.md`

### No Context Detected
1. Verify service is running: `python test_service.py`
2. Check WebSocket connection (port 8766)
3. Try the mock service to test integration

### Performance Issues
1. Reduce polling frequency in service settings
2. Disable full screen capture
3. Use simple service for basic functionality

## Architecture Overview

```
┌─────────────────┐    WebSocket    ┌──────────────────┐
│   Electron App  │ ←──────────────→ │ Python Service   │
│                 │    Port 8766     │                  │
│ • UI Display    │                  │ • Windows APIs   │
│ • Settings      │                  │ • UI Automation  │
│ • Chat Context  │                  │ • Context Logic  │
└─────────────────┘                  └──────────────────┘
         ↑                                     ↑
         │                                     │
    ┌─────────────┐                   ┌──────────────┐
    │   React     │                   │   Windows    │
    │ Components  │                   │     APIs     │
    └─────────────┘                   └──────────────┘
```

## File Structure

```
accessibility-service/
├── windows_accessibility_service.py  # Full Windows API service
├── simple_accessibility_service.py   # Mock service for testing
├── requirements.txt                   # Python dependencies
├── start_service.bat                  # Service launcher
├── fix_pywin32.bat                   # pywin32 fix script
├── test_service.py                   # Connection test
└── TROUBLESHOOTING.md                # Detailed troubleshooting

src/
├── services/
│   └── accessibilityService.ts       # Core accessibility service
├── hooks/
│   └── useAccessibilityContext.ts    # React hook for context
├── components/
│   └── AccessibilityContextMonitor.tsx # UI component
└── native/
    └── windowsAccessibility.ts       # Windows API interface
```

## Next Steps

1. **Start with Mock Service**: Get familiar with the interface using fake data
2. **Test Real Integration**: Set up the full Windows API service for real data
3. **Customize Settings**: Configure what context to capture and when
4. **Integrate with Chat**: Use context in your AI conversations
5. **Explore Advanced Features**: Try screen content analysis and element inspection

## Support

- Check `TROUBLESHOOTING.md` for common issues
- Run `test_service.py` to verify connections
- Use `simple_accessibility_service.py` for basic testing
- All processing is local - no data leaves your machine

The accessibility system provides unprecedented context awareness for your AI assistant, making it truly aware of what you're doing across your entire Windows environment!