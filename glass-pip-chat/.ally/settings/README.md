# MCP Configuration

This directory contains the Model Context Protocol (MCP) server configuration.

## Platform-Specific Path Handling

The `mcp.json` configuration file supports cross-platform filesystem paths. The filesystem server path is automatically adjusted based on your operating system:

### Filesystem Path Placeholder

Use `~` as the filesystem path in your configuration:

```json
{
  "mcpServers": {
    "filesystem": {
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "~"]
    }
  }
}
```

### Automatic Path Resolution

The application automatically replaces the path based on your platform:

- **Windows**: `~` → `%USERPROFILE%` (e.g., `C:\Users\YourName`)
- **Linux**: `~` → `$HOME` (e.g., `/home/username`)
- **macOS**: `~` → `$HOME` (e.g., `/Users/username`)

### Custom Paths

You can also specify custom paths:

- **Absolute paths**: `/path/to/directory` or `C:\path\to\directory`
- **Home-relative**: `~` (recommended for cross-platform compatibility)

The path adjustment happens automatically when the configuration is loaded, so the same config file works on both Windows and Linux without modification.

## Configuration Files

The application looks for MCP configuration in the following order:

1. User-level config: `~/.ally/settings/mcp.json`
2. Workspace config: `.ally/settings/mcp.json` (current directory)

The first found configuration is used.
