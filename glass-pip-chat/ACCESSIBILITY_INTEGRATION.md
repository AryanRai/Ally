# Advanced Accessibility Integration

This document describes the comprehensive accessibility system that provides advanced context monitoring for the Glass PiP Chat application.

## Overview

The accessibility system captures rich context from your Windows environment, including:

- **Text Selection**: Detects selected text from any application
- **Element Hovering**: Identifies UI elements you hover over with detailed information
- **Focus Tracking**: Monitors focused elements and their properties
- **Window Context**: Tracks active applications and windows
- **Screen Reading**: Extracts visible content and element structure
- **Cursor Position**: Real-time cursor location tracking

## Architecture

### Components

1. **AccessibilityService** (`src/services/accessibilityService.ts`)
   - Core service that orchestrates context monitoring
   - Provides unified interface for all accessibility features
   - Manages context history and change detection

2. **WindowsAccessibilityAPI** (`src/native/windowsAccessibility.ts`)
   - Native Windows API integration layer
   - Interfaces with UI Automation, screen readers, and system APIs
   - Provides mock implementation for development

3. **useAccessibilityContext** (`src/hooks/useAccessibilityContext.ts`)
   - React hook for consuming accessibility context
   - Provides real-time updates and utility functions
   - Manages service lifecycle and error handling

4. **AccessibilityContextMonitor** (`src/components/AccessibilityContextMonitor.tsx`)
   - UI component for displaying accessibility context
   - Shows selected text, hovered elements, focused elements
   - Provides settings and service control

5. **Windows Service** (`accessibility-service/windows_accessibility_service.py`)
   - Native Python service using Windows APIs
   - Provides real Windows UI Automation integration
   - Communicates via WebSocket with Electron app

## Features

### Text Selection Monitoring
- Captures text selected in any Windows application
- Works with browsers, text editors, PDFs, etc.
- Provides selection history and context

### Element Inspection
- Identifies UI elements under cursor
- Extracts element properties (role, name, description, bounds)
- Works with native Windows controls and web elements

### Focus Tracking
- Monitors currently focused UI elements
- Tracks input fields, buttons, and interactive elements
- Provides element hierarchy and context

### Window Context
- Identifies active applications and windows
- Extracts window titles, process information
- Detects browser URLs and document titles

### Screen Content Analysis
- Extracts visible text from screen regions
- Identifies UI element structure
- Provides content summaries and context

## Setup Instructions

### 1. Install Python Dependencies

```bash
cd accessibility-service
pip install -r requirements.txt
```

### 2. Start the Windows Service

```bash
# Option 1: Use the batch file
start_service.bat

# Option 2: Run directly
python windows_accessibility_service.py
```

### 3. Configure Electron Integration

The service automatically connects to the Electron app via WebSocket on port 8766.

### 4. Enable in Settings

1. Open the Glass PiP Chat settings
2. Navigate to the Accessibility section
3. Enable desired monitoring features
4. Configure context inclusion preferences

## Usage

### Basic Context Monitoring

The accessibility system runs automatically and provides context through:

- **Visual Indicators**: Green dots show when new context is available
- **Context Panel**: Expandable panel showing current accessibility state
- **Chat Integration**: Context can be automatically included in messages

### Advanced Features

#### Context History
```typescript
const { getRecentSelections } = useAccessibilityContext();
const recentText = getRecentSelections(60000); // Last minute
```

#### Custom Context Processing
```typescript
const { context } = useAccessibilityContext();
if (context?.selectedText) {
  // Process selected text
  console.log('User selected:', context.selectedText);
}
```

#### Element Inspection
```typescript
const { hoveredElement } = useAccessibilityContext();
if (hoveredElement) {
  console.log('Hovering over:', hoveredElement.role, hoveredElement.text);
}
```

## Windows API Integration

### UI Automation
- Uses `IUIAutomation` interface for element inspection
- Provides detailed element properties and hierarchy
- Supports pattern-based interaction (Text, Value, Selection)

### Global Hooks
- `SetWinEventHook` for system-wide accessibility events
- `GetGUIThreadInfo` for focused element tracking
- `RegisterHotKey` for global keyboard shortcuts

### Screen Reader Integration
- Compatible with NVDA, JAWS, and Windows Narrator
- Can intercept screen reader output
- Provides alternative text-to-speech integration

## Privacy and Security

### Data Handling
- All context data is processed locally
- No data is sent to external servers
- Context history has configurable retention limits

### Permissions
- Requires Windows accessibility permissions
- May need to run as administrator for some features
- Respects application security boundaries

### User Control
- All monitoring can be disabled
- Granular control over what context is captured
- Clear indicators when monitoring is active

## Troubleshooting

### Common Issues

1. **Service Won't Start**
   - Ensure Python 3.8+ is installed
   - Check Windows permissions
   - Verify no firewall blocking WebSocket connection

2. **No Context Detected**
   - Check if accessibility service is running
   - Verify WebSocket connection (port 8766)
   - Enable Windows accessibility features

3. **Performance Issues**
   - Reduce polling frequency in settings
   - Disable full screen capture
   - Limit context history size

### Debug Mode

Enable debug logging:
```typescript
const accessibilityService = getAccessibilityService({
  enableTextSelection: true,
  enableHoverDetection: true,
  pollingInterval: 1000 // Slower polling
});
```

## API Reference

### AccessibilityContext Interface
```typescript
interface AccessibilityContext {
  selectedText?: string;
  hoveredElement?: UIElement;
  focusedElement?: UIElement;
  activeWindow?: WindowInfo;
  screenContent?: ScreenContent;
  cursorPosition?: { x: number; y: number };
  timestamp: number;
}
```

### Service Methods
```typescript
// Start monitoring
await accessibilityService.start();

// Stop monitoring
accessibilityService.stop();

// Get current context
const context = accessibilityService.getCurrentContext();

// Listen for changes
const unsubscribe = accessibilityService.onContextChange((context) => {
  console.log('Context updated:', context);
});
```

## Future Enhancements

### Planned Features
- OCR integration for image text extraction
- Voice command integration
- Custom element recognition patterns
- Cross-application workflow tracking
- AI-powered context understanding

### Extensibility
- Plugin system for custom context providers
- Configurable element selectors
- Custom accessibility patterns
- Integration with external tools

## Contributing

To contribute to the accessibility system:

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Update documentation
5. Submit a pull request

### Development Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run accessibility service
cd accessibility-service
python windows_accessibility_service.py
```

## License

This accessibility system is part of the Glass PiP Chat project and follows the same licensing terms.