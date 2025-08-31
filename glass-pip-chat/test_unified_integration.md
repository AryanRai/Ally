# Testing Unified Tool Integration

## How to Test the Integration

### 1. Start the Services

**Windows:**
```bash
# Run from project root
start_unified_integration.bat
```

**Linux/Mac:**
```bash
# Run from project root
./start_unified_integration.sh
```

**Manual Start:**
```bash
# Terminal 1: Start Stream Handler
cd Comms
python sh/stream_handlerv4.0.py

# Terminal 2: Start Glass Chat
cd Ally/glass-pip-chat
npm run dev
```

### 2. Access the Unified Integration

1. **Open Glass Chat PiP** - Navigate to http://localhost:5173
2. **Expand the Interface** - Make sure the chat is in expanded mode (not collapsed)
3. **Look for Integration Buttons** - In the header, you should see:
   - ⚡ **Unified Integration** button (purple when active)
   - 📊 **Tool Analytics** button (green when active)

### 3. Test the Integration

#### Option A: Use the Unified Integration Modal
1. Click the ⚡ **Unified Integration** button in the header
2. This opens a full-screen unified chat interface
3. Try these test messages:
   - `calculate 2+2`
   - `what time is it?`
   - `weather in New York`
   - `system info`

#### Option B: Use the Analytics Dashboard
1. Click the 📊 **Tool Analytics** button in the header
2. View real-time performance metrics
3. Monitor tool execution statistics

### 4. What to Expect

#### Connection Status
- 🟢 **Green dot** on integration button = Connected to Stream Handler
- 🔴 **Red dot** on integration button = Disconnected

#### Tool Execution Flow
1. **User Input** → Type a message that requires tools
2. **LLM Processing** → Ollama processes and identifies tool needs
3. **Tool Calls** → Tools are called via WebSocket to Stream Handler
4. **Real-time Updates** → See progress indicators and status updates
5. **Results** → Tool results integrated into conversation

#### Available Demo Tools
- **calculator** - Evaluates mathematical expressions
- **current_time** - Returns current date/time with timezone
- **weather** - Mock weather data for any location
- **system_info** - Browser and system information

### 5. Troubleshooting

#### Stream Handler Not Connecting
- Check that Stream Handler is running on port 3000
- Look for "Connected to Stream Handler v4.0" message in browser console
- Verify WebSocket connection at ws://localhost:3000

#### Tools Not Executing
- Check browser console for error messages
- Verify Ollama is running and accessible
- Check that demo tools are registered (look for "Demo tools registered" in console)

#### UI Not Showing Integration Buttons
- Make sure you're in expanded mode (not collapsed)
- Check that the unified integration hook is initialized
- Look for any React errors in browser console

### 6. Debug Information

#### Browser Console Messages
Look for these key messages:
```
✅ Initializing unified tool integration service...
✅ Connected to stream handler
✅ Demo tools registered for unified integration
✅ Tool execution started: calculator (exec_12345)
✅ Tool execution completed: exec_12345
```

#### Network Tab
- WebSocket connection to `ws://localhost:3000`
- Messages with types: `ally_intent`, `tool_call`, `tool_result`

#### Stream Handler Console
Look for these messages:
```
[RECEIVED] Message type: ally_intent
[TOOL] Processing tool message: tool_call
[TOOL] Successfully processed tool_call message
```

### 7. Advanced Testing

#### Custom Tool Registration
Add this to browser console:
```javascript
// Access the unified integration service
const service = window.unifiedIntegrationService;
if (service) {
  service.registerTool('custom_tool', async (params) => {
    return { message: 'Custom tool executed!', params };
  });
}
```

#### Manual Tool Execution
Test direct tool calls:
```javascript
// Send a tool call message directly
const message = {
  type: 'tool_call',
  tool_name: 'calculator',
  parameters: { expression: '5*5' },
  execution_id: 'test_' + Date.now(),
  source: 'manual_test'
};
// This would be sent via WebSocket
```

### 8. Expected Results

#### Successful Integration Test
1. ✅ Stream Handler starts and shows "Listening on http://localhost:3000"
2. ✅ Glass Chat connects and shows integration buttons
3. ✅ Typing "calculate 2+2" shows tool execution progress
4. ✅ Result "4" appears in chat with execution details
5. ✅ Analytics dashboard shows execution statistics

#### Performance Expectations
- **Connection Time**: < 1 second to Stream Handler
- **Tool Execution**: < 2 seconds for simple tools
- **UI Updates**: Real-time progress indicators
- **Memory Usage**: Stable, no memory leaks

### 9. Integration Architecture Verification

The test verifies these integration points:
- ✅ **UI Layer** → Tool execution components display correctly
- ✅ **Framework Layer** → Tools are registered and executed
- ✅ **Comms Layer** → WebSocket messages flow correctly
- ✅ **Protocol Layer** → Chyappy v3.0 messages are handled
- ✅ **End-to-End** → User input → Tool execution → Result display

This completes the verification of Task 13 integration requirements.