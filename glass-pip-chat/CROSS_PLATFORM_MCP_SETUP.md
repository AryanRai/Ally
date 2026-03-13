# Cross-Platform MCP Configuration

## Overview

The MCP (Model Context Protocol) configuration has been updated to work seamlessly across Windows and Linux platforms without requiring manual path adjustments.

## Changes Made

### 1. Dynamic Path Resolution in Electron Main Process

Added a helper function `adjustMCPConfigForPlatform()` in `electron/main.ts` that:

- Detects the current operating system
- Automatically replaces filesystem paths with platform-appropriate values
- Runs when the MCP configuration is loaded

**Platform-specific paths:**
- **Windows**: Uses `%USERPROFILE%` (e.g., `C:\Users\YourName`)
- **Linux/macOS**: Uses `$HOME` (e.g., `/home/username`)

### 2. Updated MCP Configuration

Modified `.ally/settings/mcp.json` to use `~` as a universal placeholder:

```json
{
  "mcpServers": {
    "filesystem": {
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "~"]
    }
  }
}
```

The `~` placeholder is automatically replaced with the correct home directory path when the config is loaded.

### 3. Documentation

Created `.ally/settings/README.md` explaining:
- How the platform detection works
- Path resolution behavior
- Configuration file precedence

## Benefits

✅ **Single configuration file** works on both Windows and Linux  
✅ **No manual editing** required when switching platforms  
✅ **Automatic detection** of the correct home directory  
✅ **Backward compatible** with absolute paths if needed  

## Usage

Simply use `~` in your filesystem MCP server configuration, and the application will handle the rest. The same config file can be committed to version control and will work for all team members regardless of their operating system.

## Testing

To verify the configuration is working:

1. Start the application: `npm run dev`
2. Check the console for: `Adjusted filesystem path for [platform]: [path]`
3. The MCP filesystem server should initialize without errors

## Troubleshooting

If you see errors like:
```
Error accessing directory /home/user/C:\
```

This means the old hardcoded path is still cached. Solution:
1. Restart the application
2. Clear any cached configurations
3. Verify `.ally/settings/mcp.json` uses `~` as the path
