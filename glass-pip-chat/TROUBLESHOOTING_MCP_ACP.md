# MCP/ACP Integration Troubleshooting Guide

## Current Status

The MCP/ACP integration is currently in **development/demo mode**. The services are designed to work but have some limitations in the current browser environment.

## Common Issues and Solutions

### 1. "Module 'events' has been externalized" Error

**Issue**: Browser compatibility error when trying to use Node.js EventEmitter.

**Status**: ✅ **FIXED** - Replaced with browser-compatible EventEmitter implementation.

### 2. MCP/ACP Dashboard Shows "Not Initialized"

**Possible Causes**:
- Configuration files not found
- Electron API not available
- Services failed to initialize

**Solutions**:

1. **Check Configuration Files**:
   ```bash
   # Create MCP config
   mkdir -p .ally/settings
   echo '{"mcpServers": {"filesystem": {"command": "uvx", "args": ["mcp-server-filesystem", "--path", "."], "disabled": false}}}' > .ally/settings/mcp.json
   
   # Create ACP config  
   echo '{"agents": {}}' > .ally/settings/acp.json
   ```

2. **Check Browser Console**:
   - Open Developer Tools (F12)
   - Look for MCP/ACP initialization logs
   - Check for any error messages

3. **Test Integration Button**:
   - Go to Settings → MCP/ACP Integration
   - Click "Test Integration" button
   - Check console for detailed logs

### 3. No Tools Available

**Current Behavior**: The system shows demo tools when MCP servers are configured.

**Expected Tools**:
- `filesystem_demo_tool` - Demo filesystem operations
- `acp:agent-name` - Demo ACP agent queries

**To Add Real Tools**:
1. Install UV package manager: `pip install uv`
2. Test MCP server manually: `uvx mcp-server-filesystem --path .`
3. Configure in `.kiro/settings/mcp.json`
4. Restart application

### 4. Electron API Not Available

**Issue**: `window.pip` is undefined in browser.

**Solutions**:
- Ensure you're running the Electron app, not just the web version
- Check that preload script is loaded correctly
- Restart the application

## Debug Steps

### 1. Check Service Initialization

Open browser console and run:
```javascript
// Test MCP service
import('./src/services/mcpIntegrationService.js').then(module => {
  const service = module.getMCPIntegrationService();
  service.initialize().then(() => {
    console.log('MCP initialized:', service.getServerStatus());
  }).catch(console.error);
});

// Test ACP service  
import('./src/services/acpIntegrationService.js').then(module => {
  const service = module.getACPIntegrationService();
  service.initialize().then(() => {
    console.log('ACP initialized:', service.getAllAgents());
  }).catch(console.error);
});
```

### 2. Check Configuration Loading

```javascript
// Check if electron API is available
console.log('Electron API:', window.pip);
console.log('MCP API:', window.pip?.mcp);
console.log('ACP API:', window.pip?.acp);

// Test config loading
if (window.pip?.mcp) {
  window.pip.mcp.readConfig().then(config => {
    console.log('MCP Config:', config);
  });
}
```

### 3. Manual Service Test

In Settings → MCP/ACP Integration:
1. Click "Test Integration" button
2. Check console for detailed logs
3. Look for initialization success/failure messages

## Current Limitations

### MCP Integration
- ✅ Configuration loading
- ✅ Service initialization  
- ✅ Demo tool registration
- ⚠️ Real MCP server communication (requires electron backend)
- ⚠️ Tool parameter extraction
- ⚠️ Tool execution results

### ACP Integration
- ✅ Configuration loading
- ✅ Service initialization
- ✅ Agent registration
- ⚠️ Real HTTP communication with agents
- ⚠️ Agent query processing
- ⚠️ Response handling

## Development Roadmap

### Phase 1: Core Infrastructure ✅
- [x] Browser-compatible EventEmitter
- [x] Service architecture
- [x] Configuration management
- [x] UI components

### Phase 2: Electron Integration 🔄
- [x] Electron IPC handlers
- [x] Configuration file reading
- [ ] MCP server process management
- [ ] Real-time communication

### Phase 3: Tool Execution 📋
- [ ] MCP tool calling
- [ ] ACP agent queries
- [ ] Parameter validation
- [ ] Result processing

### Phase 4: Advanced Features 📋
- [ ] Tool chaining
- [ ] Context persistence
- [ ] Performance monitoring
- [ ] Error recovery

## Getting Help

### Check Logs
1. Open Developer Tools (F12)
2. Go to Console tab
3. Look for messages starting with:
   - `MCP Integration Service:`
   - `ACP Integration Service:`
   - `Unified Tool Integration:`

### Common Log Messages

**Success Messages**:
```
MCP Integration Service: Starting initialization...
MCP Integration Service: Config loaded: {...}
MCP Integration Service initialized
```

**Error Messages**:
```
Failed to read MCP config: [error details]
No MCP servers configured
MCP server [name] is not responding
```

### Report Issues

If you encounter issues:

1. **Collect Information**:
   - Browser console logs
   - Configuration files content
   - Steps to reproduce

2. **Check Configuration**:
   - Verify `.ally/settings/mcp.json` exists and is valid JSON
   - Verify `.ally/settings/acp.json` exists and is valid JSON
   - Check file permissions

3. **Test Components**:
   - Use "Test Integration" button
   - Check individual service initialization
   - Verify electron API availability

## Quick Fixes

### Reset Configuration
```bash
# Backup existing config
cp .ally/settings/mcp.json .ally/settings/mcp.json.backup 2>/dev/null || true
cp .ally/settings/acp.json .ally/settings/acp.json.backup 2>/dev/null || true

# Create minimal working config
mkdir -p .ally/settings
echo '{"mcpServers": {}}' > .ally/settings/mcp.json
echo '{"agents": {}}' > .ally/settings/acp.json
```

### Force Reload
```javascript
// In browser console
window.location.reload();
```

### Clear Service Cache
```javascript
// In browser console
import('./src/services/mcpIntegrationService.js').then(module => {
  module.resetMCPIntegrationService();
});
import('./src/services/acpIntegrationService.js').then(module => {
  module.resetACPIntegrationService();
});
```

## Expected Behavior

### Working State
- Settings → MCP/ACP Integration shows dashboard
- "Unified" tab shows available tools
- Debug info shows services enabled
- Console shows successful initialization

### Demo Mode
- Shows demo tools even without real MCP servers
- Allows testing of UI components
- Provides setup guidance

### Error State  
- Shows helpful error messages
- Provides troubleshooting steps
- Includes setup guide for new users