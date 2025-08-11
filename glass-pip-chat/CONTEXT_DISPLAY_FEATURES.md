# Context Display Features

## Overview
The expandable context display feature has been restored and enhanced in the new EditableMessage component, providing a clean and intuitive way to view attached context information.

## Context Display Functionality

### Automatic Context Detection
- **Pattern Recognition**: Automatically detects `[Context: ...]` patterns in messages
- **Smart Parsing**: Separates main message content from context information
- **Flexible Format**: Supports various context formats (Clipboard, Selected text, etc.)

### Expandable Context UI
- **Collapsed by Default**: Context appears as a compact, collapsible section
- **Visual Indicator**: Shows "Context attached" with clipboard icon
- **Smooth Animation**: Expand/collapse with smooth height transitions
- **Chevron Arrow**: Rotates to indicate expanded/collapsed state

### Context Content Display
- **Scrollable Area**: Long context content is scrollable with custom scrollbars
- **Formatted Display**: Context details shown in a styled container
- **Theme Aware**: Adapts to light/dark themes and platform styling
- **Configurable**: Respects font size and spacing settings

## Technical Implementation

### Message Parsing
```typescript
const parseMessageContent = (content: string) => {
  const contextRegex = /\[Context: ([^\]]+)\]/;
  const contextMatch = content.match(contextRegex);
  
  if (contextMatch) {
    return {
      hasContext: true,
      beforeContext: content.substring(0, contextMatch.index),
      afterContext: content.substring(contextMatch.index! + contextMatch[0].length),
      contextText: contextMatch[1]
    };
  }
  
  return { hasContext: false, beforeContext: content, ... };
};
```

### UI Components
- **Context Header**: Clickable header with icon and chevron
- **Expandable Content**: AnimatePresence for smooth transitions
- **Scrollable Container**: Custom scrollbar styling for overflow content
- **Theme Integration**: Platform and theme-aware styling

### State Management
- **Local State**: Each message manages its own context expansion state
- **Persistent UI**: Expansion state maintained during message interactions
- **Independent Control**: Each message's context can be expanded/collapsed independently

## User Experience

### Visual Design
- **Subtle Styling**: Context section uses subtle borders and backgrounds
- **Clear Hierarchy**: Context is visually separated from main content
- **Consistent Theming**: Matches overall application design language
- **Responsive Layout**: Adapts to different message sizes and content

### Interaction Patterns
- **Click to Expand**: Single click on header toggles expansion
- **Visual Feedback**: Hover effects and smooth animations
- **Keyboard Accessible**: Proper focus management and keyboard navigation
- **Touch Friendly**: Large click targets for mobile/touch interfaces

### Content Handling
- **Long Context**: Scrollable area prevents UI overflow
- **Multiple Contexts**: Supports multiple context types in one message
- **Formatting**: Preserves context formatting and structure
- **Copy Support**: Context content can be copied along with message

## Integration with Existing Features

### Message Editing
- **Edit Preservation**: Context information preserved during editing
- **Fork Support**: Context included in forked conversations
- **Content Separation**: Main content and context handled separately

### Configuration Support
- **Font Size**: Context text respects global font size settings
- **Spacing**: Context container uses configurable padding
- **Theme**: Adapts to light/dark theme preferences
- **Platform**: Windows/macOS specific styling applied

### Chat Management
- **Persistence**: Context expansion state maintained across sessions
- **Search**: Context content included in message search
- **Export**: Context information included in chat exports

## Context Types Supported

### Clipboard Context
```
[Context: Clipboard: "copied text content"]
```

### Selected Text Context
```
[Context: Selected: "highlighted text"]
```

### Combined Context
```
[Context: Clipboard: "copied text", Selected: "highlighted text"]
```

### Custom Context
```
[Context: Custom: "any context information"]
```

## Benefits

### For Users
- **Clean Interface**: Context doesn't clutter the main message view
- **On-Demand Access**: View context only when needed
- **Better Readability**: Main message content remains prominent
- **Efficient Scanning**: Quickly identify messages with context

### for Conversations
- **Context Preservation**: Important context information is retained
- **Visual Clarity**: Clear separation between message and context
- **Searchable Content**: Context is part of the searchable message content
- **Export Friendly**: Context included in conversation exports

## Future Enhancements
Potential improvements for future versions:
- Context type icons (clipboard, selection, file, etc.)
- Context preview on hover
- Context filtering and search
- Context highlighting in main content
- Bulk context operations

This implementation provides a polished, user-friendly way to handle context information while maintaining the clean aesthetic of the Glass PiP Chat interface.