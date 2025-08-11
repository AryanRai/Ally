# UI Configuration Features

## Overview
The Glass PiP Chat now includes comprehensive UI customization options, allowing users to adjust font sizes, message spacing, and padding to their preferences.

## New Configuration Options

### 1. Font Size Settings
Choose from 5 different font sizes for optimal readability:
- **XS (Extra Small)**: Compact text for maximum information density
- **SM (Small)**: Default size, good balance of readability and space
- **Base (Medium)**: Standard web font size
- **LG (Large)**: Larger text for better readability
- **XL (Extra Large)**: Maximum size for accessibility

### 2. Message Spacing
Control the vertical space between messages:
- **Compact**: Minimal spacing for dense conversations
- **Normal**: Default spacing for comfortable reading
- **Comfortable**: Extra spacing for relaxed viewing

### 3. Message Padding
Adjust the internal padding within message bubbles:
- **Tight**: Minimal padding for compact messages
- **Normal**: Standard padding for balanced appearance
- **Spacious**: Extra padding for a more luxurious feel

## Technical Implementation

### Settings Management
- **SettingsManager**: Singleton class for centralized settings management
- **Persistent Storage**: All settings automatically saved to localStorage
- **Real-time Updates**: Changes apply immediately without restart
- **Default Values**: Sensible defaults with fallback support

### Component Integration
- **EditableMessage**: Dynamically applies font size and padding classes
- **Message Container**: Uses configurable spacing between messages
- **Settings Modal**: Intuitive controls for all customization options

### CSS Classes
The system uses Tailwind CSS classes for consistent styling:

#### Font Sizes
- `text-xs`: Extra small (12px)
- `text-sm`: Small (14px) - Default
- `text-base`: Base (16px)
- `text-lg`: Large (18px)
- `text-xl`: Extra large (20px)

#### Message Spacing
- `space-y-2`: Compact (8px between messages)
- `space-y-3`: Normal (12px between messages) - Default
- `space-y-4`: Comfortable (16px between messages)

#### Message Padding
- `p-2`: Tight (8px padding)
- `p-4`: Normal (16px padding) - Default
- `p-6`: Spacious (24px padding)

## User Interface

### Settings Modal
The settings are accessible through the settings modal with three new sections:

#### Font Size Control
- 5 buttons (XS, SM, BASE, LG, XL)
- Current selection highlighted in blue
- Instant preview of changes

#### Message Spacing Control
- 3 buttons (Compact, Normal, Comfortable)
- Visual feedback for current selection
- Affects spacing between all messages

#### Message Padding Control
- 3 buttons (Tight, Normal, Spacious)
- Changes internal message bubble padding
- Applies to both text and code blocks

### Visual Feedback
- **Active Selection**: Current settings highlighted with blue accent
- **Hover Effects**: Interactive feedback on all controls
- **Instant Updates**: Changes apply immediately for real-time preview

## Usage Examples

### Accessibility Setup
For users who need larger text:
1. Open Settings → Interface
2. Set Font Size to "LG" or "XL"
3. Set Message Padding to "Spacious"
4. Set Message Spacing to "Comfortable"

### Compact Setup
For users who want maximum information density:
1. Open Settings → Interface
2. Set Font Size to "XS"
3. Set Message Padding to "Tight"
4. Set Message Spacing to "Compact"

### Default Balanced Setup
For most users:
1. Font Size: "SM" (Small)
2. Message Padding: "Normal"
3. Message Spacing: "Normal"

## Storage Format
Settings are stored in localStorage under the key `glass_pip_settings`:

```json
{
  "ui": {
    "fontSize": "sm",
    "messageSpacing": "normal",
    "messagePadding": "normal"
  },
  "theme": "dark",
  "contextToggleEnabled": true
}
```

## Benefits

### For Users
- **Personalization**: Customize the interface to personal preferences
- **Accessibility**: Larger fonts and spacing for better readability
- **Efficiency**: Compact settings for power users
- **Comfort**: Spacious settings for relaxed reading

### For Different Use Cases
- **Presentations**: Large fonts for screen sharing
- **Mobile**: Compact settings for small screens
- **Accessibility**: High contrast with large text
- **Professional**: Clean, balanced appearance

## Integration with Existing Features

### Message Editing
- Textarea inherits font size settings
- Code blocks respect padding settings
- Edit interface maintains consistent styling

### Chat Management
- Sidebar remains unaffected for consistency
- Message previews use standard sizing
- Settings persist across chat switches

### Theme Support
- All settings work with both light and dark themes
- Consistent contrast ratios maintained
- Platform-specific styling preserved

## Future Enhancements
Potential additions for future versions:
- Line height customization
- Custom color schemes
- Message width controls
- Animation speed settings
- Export/import settings profiles

This implementation provides a comprehensive customization system while maintaining the clean, professional appearance of the Glass PiP Chat interface.