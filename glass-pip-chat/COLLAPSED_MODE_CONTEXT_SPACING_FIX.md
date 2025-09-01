# Collapsed Mode Context Spacing Fix

## Problem
In minimized (collapsed) mode, when context gets attached (e.g., when copying something), there was unnecessary whitespace below that made the application window unnecessarily large. This happened even without sending a message - just having context present would add ~80px of extra height.

## Root Cause
The issue was in the dynamic height calculation for collapsed mode:

```typescript
// Old problematic logic
if (contextMonitoring.hasNewContext && (contextMonitoring.contextData.clipboard || contextMonitoring.contextData.selectedText)) {
  collapsedHeight += collapsedDims.contextHeight; // Always added 80px
}
```

The logic was always adding 80px of height whenever context was present, regardless of whether the context panel was actually expanded or collapsed. In the UI, the context starts in a collapsed state (just showing a header), but the sizing logic assumed it was always fully expanded.

## Solution

### 1. Precise Height Calculation
Updated the height calculation to be more accurate:
- **Context header only**: 36px (when context is present but collapsed)
- **Context expanded**: +60px additional (when user expands the context panel)
- **Total when expanded**: 96px (36 + 60)

### 2. State Management
- Added `isContextExpanded` state to the main component
- Passed this state to `CollapsedHeader` component
- Removed duplicate internal state from `CollapsedHeader`

### 3. Dynamic Resizing
- Updated the `useEffect` dependency array to include `isContextExpanded`
- Window now resizes automatically when context is expanded/collapsed
- Smooth transitions between collapsed and expanded context states

## Code Changes

### Main Component (`GlassChatPiP.tsx`)
```typescript
// Added state for context expansion
const [isContextExpanded, setIsContextExpanded] = useState(false);

// Updated height calculation
if (contextMonitoring.hasNewContext && (contextMonitoring.contextData.clipboard || contextMonitoring.contextData.selectedText)) {
  collapsedHeight += 36; // Just enough for the collapsed context header
  if (isContextExpanded) {
    collapsedHeight += 60; // Additional space for expanded context content
  }
}

// Updated dependency array
}, [..., isContextExpanded]);

// Passed props to CollapsedHeader
<CollapsedHeader
  // ... other props
  isContextExpanded={isContextExpanded}
  onContextExpandedChange={setIsContextExpanded}
/>
```

### CollapsedHeader Component
```typescript
// Added props
interface CollapsedHeaderProps {
  // ... other props
  isContextExpanded?: boolean;
  onContextExpandedChange?: (expanded: boolean) => void;
}

// Removed internal state, used props instead
const contextExpanded = isContextExpanded ?? false;

// Updated click handler
onClick={() => onContextExpandedChange?.(!contextExpanded)}
```

## Benefits

### 1. Accurate Sizing
- **Collapsed context**: Only adds 36px (minimal space for header)
- **Expanded context**: Adds 96px total (header + content)
- **No context**: No extra space added

### 2. Dynamic Behavior
- Window automatically resizes when context is expanded/collapsed
- Smooth transitions with proper animations
- No unnecessary whitespace

### 3. Better UX
- Context starts collapsed by default (minimal footprint)
- User can expand to see full context when needed
- Visual feedback with chevron rotation

## Testing
To test the fix:
1. Minimize the chat window (collapsed mode)
2. Copy some text to trigger context attachment
3. Verify the window size is minimal (just shows context header)
4. Click the context header to expand
5. Verify the window grows to show full context
6. Click again to collapse
7. Verify the window shrinks back to minimal size

## Before vs After

### Before
- Context present: Always +80px height
- No differentiation between collapsed/expanded states
- Unnecessary whitespace even when context not visible

### After  
- Context collapsed: +36px height (just header)
- Context expanded: +96px height (header + content)
- Precise sizing based on actual UI state
- Dynamic resizing with smooth transitions

This fix eliminates the unnecessary whitespace issue while maintaining full context functionality and improving the overall user experience in collapsed mode.