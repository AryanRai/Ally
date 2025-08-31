# Unified Tool Integration - Task 13

This document describes the complete integration of UI tool calling components, the tool calling framework, and the stream handler/comms system as specified in Task 13.

## Overview

Task 13 integrates three major components:

1. **UI Tool Calling Components** (Task 11) - React components for tool execution visualization
2. **Tool Calling Framework** (Task 1 & 8) - Core tool execution and LLM integration
3. **Stream Handler and Comms/Chyappy** (Task 6) - WebSocket communication and protocol handling

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Unified Integration Layer                     │
├─────────────────────────────────────────────────────────────────┤
│  UnifiedToolIntegrationService  │  useUnifiedToolIntegration    │
│  - WebSocket Management         │  - React Hook                 │
│  - Message Routing              │  - State Management           │
│  - Event Coordination           │  - Lifecycle Management       │
└─────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   UI Layer      │  │ Tool Framework  │  │ Comms Layer     │
│   (Task 11)     │  │ (Task 1 & 8)    │  │ (Task 6)        │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ • ToolExecution │  │ • ToolManager   │  │ • StreamHandler │
│   Status        │  │ • ToolRegistry  │  │   v4.0          │
│ • ToolExecution │  │ • ToolExecutor  │  │ • Tool Message  │
│   History       │  │ • ToolCalling   │  │   Handlers      │
│ • ToolStatus    │  │   Service       │  │ • Message       │
│   Indicator     │  │ • Ollama        │  │   Registry      │
│ • ToolManage    │  │   Integration   │  │ • Chyappy v3.0  │
│   ment Interface│  │                 │  │   Protocol      │
│ • ToolAnalytics │  │                 │  │ • WebSocket     │
│   Dashboard     │  │                 │  │   Integration   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Key Components

### UnifiedToolIntegrationService

The central service that coordinates all integration aspects:

```typescript
class UnifiedToolIntegrationService extends EventEmitter {
  // Core integration functionality
  async initialize(): Promise<void>
  async connect(): Promise<void>
  async processMessage(conversationId, messages, newMessage): Promise<any>
  
  // Tool management
  registerTool(toolName: string, executor: any): void
  getAvailableTools(): string[]
  
  // WebSocket communication
  private sendMessage(message: ChyappyMessage): void
  private handleWebSocketMessage(event: MessageEvent): void
  
  // Event handling
  private handleToolResult(message: ToolResultMessage): Promise<void>
  private handleAllyStatus(message: AllyStatusMessage): Promise<void>
}
```

### useUnifiedToolIntegration Hook

React hook that provides unified access to the integration:

```typescript
function useUnifiedToolIntegration(
  conversationId: string,
  ollamaService: OllamaService,
  config?: UnifiedToolIntegrationHookConfig
) {
  return {
    // State
    state: UnifiedToolIntegrationHookState,
    
    // Core functionality
    processMessage: (messages, newMessage, options) => Promise<any>,
    
    // Connection management
    connect: () => Promise<void>,
    disconnect: () => Promise<void>,
    forceReconnect: () => Promise<void>,
    
    // Tool management
    registerTool: (toolName, executor) => void,
    getAvailableTools: () => string[],
    
    // Status queries
    isReady: () => boolean,
    isToolExecutionAvailable: () => boolean,
    getConnectionStats: () => ConnectionStats,
    getToolStats: () => ToolStats
  };
}
```

## Integration Flow

### 1. User Input Processing

```
User Input → UnifiedChatInterface → useUnifiedToolIntegration → UnifiedToolIntegrationService
```

### 2. Tool-Aware Processing

```
UnifiedToolIntegrationService → ToolAwareIntegrationService → ToolCallingService → ToolManager
```

### 3. LLM Integration

```
ToolCallingService → OllamaService → LLM Tool Calls → ToolExecutor
```

### 4. WebSocket Communication

```
Tool Calls → Chyappy tool_call Messages → Stream Handler v4.0 → Tool Message Handlers
```

### 5. Result Processing

```
Tool Results → Chyappy tool_result Messages → UnifiedToolIntegrationService → UI Updates
```

## Message Protocol

### Chyappy v3.0 Extensions

The integration uses extended Chyappy v3.0 protocol with new message types:

#### tool_call Message
```json
{
  "type": "tool_call",
  "source": "ally_glass_pip_chat",
  "tool_name": "calculator",
  "parameters": { "expression": "2+2" },
  "execution_id": "exec_12345",
  "context": {
    "conversationId": "conv_abc",
    "sessionId": "session_xyz",
    "timeout": 30000
  },
  "msg-sent-timestamp": "2025-01-27T10:30:00.000Z"
}
```

#### tool_result Message
```json
{
  "type": "tool_result",
  "execution_id": "exec_12345",
  "tool_name": "calculator",
  "status": "success",
  "result": { "result": 4, "expression": "2+2" },
  "execution_info": {
    "start_time": "2025-01-27T10:30:00.000Z",
    "end_time": "2025-01-27T10:30:01.200Z",
    "duration_ms": 1200
  },
  "msg-sent-timestamp": "2025-01-27T10:30:01.200Z"
}
```

#### ally_intent Message
```json
{
  "type": "ally_intent",
  "source": "ally_glass_pip_chat",
  "intent": "calculate 2+2",
  "slots": {},
  "confidence": 1.0,
  "context": {
    "conversationId": "conv_abc",
    "timestamp": 1706356200000
  },
  "msg-sent-timestamp": "2025-01-27T10:30:00.000Z"
}
```

#### ally_status Message
```json
{
  "type": "ally_status",
  "source": "ally_glass_pip_chat",
  "status": "processing",
  "component": "unified_integration",
  "details": {
    "initialized": true,
    "availableTools": 5
  },
  "msg-sent-timestamp": "2025-01-27T10:30:00.000Z"
}
```

## UI Components Integration

### UnifiedChatInterface

Complete chat interface with integrated tool execution:

```typescript
<UnifiedChatInterface
  conversationId="demo_conversation"
  className="h-[600px]"
/>
```

Features:
- Real-time tool execution status
- Connection status monitoring
- Tool management interface
- Analytics dashboard
- Message processing with tool integration

### Tool Execution Components

All task 11 components are integrated:

- **ToolExecutionStatus** - Shows active tool executions
- **ToolExecutionHistory** - Displays execution history
- **ToolStatusIndicator** - Connection and tool status
- **ToolManagementInterface** - Tool configuration
- **ToolAnalyticsDashboard** - Performance metrics

## Configuration

### Service Configuration

```typescript
const config: UnifiedIntegrationConfig = {
  // WebSocket settings
  streamHandlerUrl: 'ws://localhost:3000',
  reconnectInterval: 5000,
  maxReconnectAttempts: 10,
  
  // Tool execution settings
  enableToolExecution: true,
  toolExecutionTimeout: 300000,
  maxConcurrentTools: 5,
  
  // Conversation settings
  enableConversationMemory: true,
  maxConversationHistory: 100,
  
  // Protocol settings
  sourceIdentifier: 'ally_glass_pip_chat',
  enableHeartbeat: true,
  heartbeatInterval: 30000
};
```

### Hook Configuration

```typescript
const unifiedIntegration = useUnifiedToolIntegration(
  conversationId,
  ollamaService,
  {
    autoConnect: true,
    autoReconnect: true,
    enableToolExecution: true,
    streamHandlerUrl: 'ws://localhost:3000'
  }
);
```

## Demo and Testing

### UnifiedIntegrationDemo

Complete demo showcasing all integration features:

```typescript
<UnifiedIntegrationDemo />
```

Includes:
- Live chat interface
- Architecture visualization
- Feature overview
- Integration testing interface

### Test Coverage

Comprehensive test suite covering:

1. **Unit Tests**
   - UnifiedToolIntegrationService
   - useUnifiedToolIntegration hook
   - Individual component integration

2. **Integration Tests**
   - End-to-end message flow
   - WebSocket communication
   - Tool execution pipeline
   - UI component interaction

3. **Performance Tests**
   - Multiple concurrent tool executions
   - Connection stability
   - Memory usage optimization

## Usage Examples

### Basic Integration

```typescript
import { useUnifiedToolIntegration } from './hooks/useUnifiedToolIntegration';
import { useOllamaIntegration } from './hooks/useOllamaIntegration';

function MyComponent() {
  const ollamaService = useOllamaIntegration();
  const unifiedIntegration = useUnifiedToolIntegration(
    'my_conversation',
    ollamaService.service
  );

  const handleMessage = async (message: string) => {
    if (!unifiedIntegration.isReady()) return;
    
    const result = await unifiedIntegration.processMessage(
      messages,
      message,
      {
        onProgress: (progress) => console.log('Progress:', progress),
        onToolExecution: (id, name) => console.log('Tool started:', name),
        onToolComplete: (id, result) => console.log('Tool completed:', result)
      }
    );
    
    return result;
  };

  return (
    <div>
      <div>Status: {unifiedIntegration.state.connectionStatus}</div>
      <div>Tools: {unifiedIntegration.state.availableTools.length}</div>
      {/* Your UI here */}
    </div>
  );
}
```

### Custom Tool Registration

```typescript
// Register custom tools
unifiedIntegration.registerTool('my_tool', async (params) => {
  // Tool implementation
  return { result: 'success' };
});

// Register system tools
unifiedIntegration.registerTool('file_read', async ({ path }) => {
  const content = await fs.readFile(path, 'utf8');
  return { content, path };
});
```

### Event Handling

```typescript
// Listen to integration events
unifiedIntegration.service?.on('connectionStatusChanged', (status) => {
  console.log('Connection status:', status);
});

unifiedIntegration.service?.on('toolExecutionCompleted', (event) => {
  console.log('Tool completed:', event.toolName, event.result);
});

unifiedIntegration.service?.on('systemStatusChanged', (status) => {
  console.log('System status:', status);
});
```

## Deployment

### Prerequisites

1. **Stream Handler v4.0** running on port 3000
2. **Ollama service** available and connected
3. **Tool calling framework** initialized
4. **WebSocket support** in the browser

### Environment Setup

```bash
# Start Stream Handler
cd Comms
python sh/stream_handlerv4.0.py

# Start Ollama (if not running)
ollama serve

# Start the React application
cd Ally/glass-pip-chat
npm run dev
```

### Production Configuration

```typescript
const productionConfig = {
  streamHandlerUrl: process.env.STREAM_HANDLER_URL || 'wss://your-domain.com/ws',
  enableToolExecution: true,
  toolExecutionTimeout: 60000, // Shorter timeout for production
  maxConcurrentTools: 3, // Limit concurrent executions
  enableHeartbeat: true,
  heartbeatInterval: 30000
};
```

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   - Check Stream Handler is running on correct port
   - Verify firewall settings
   - Check browser WebSocket support

2. **Tool Execution Timeout**
   - Increase `toolExecutionTimeout` in config
   - Check tool implementation for blocking operations
   - Verify Stream Handler tool message handlers

3. **Memory Leaks**
   - Ensure proper cleanup on component unmount
   - Check for unremoved event listeners
   - Monitor WebSocket connection cleanup

### Debug Mode

Enable debug logging:

```typescript
const debugConfig = {
  ...config,
  enableDebugLogging: true,
  verboseWebSocket: true
};
```

### Performance Monitoring

```typescript
// Monitor performance
const stats = unifiedIntegration.getConnectionStats();
console.log('Latency:', stats.latency);
console.log('Active executions:', stats.activeExecutions);

const toolStats = unifiedIntegration.getToolStats();
console.log('Available tools:', toolStats.toolCount);
console.log('System status:', toolStats.systemStatus);
```

## Future Enhancements

1. **Tool Marketplace** - Dynamic tool discovery and installation
2. **Advanced Analytics** - Machine learning insights on tool usage
3. **Multi-User Support** - Shared tool execution contexts
4. **Tool Composition** - Visual workflow builder for complex tool chains
5. **Performance Optimization** - Tool execution caching and optimization

## Contributing

When contributing to the unified integration:

1. **Follow the Architecture** - Maintain separation between UI, Framework, and Comms layers
2. **Test Integration Points** - Add tests for all integration scenarios
3. **Document Changes** - Update this README and inline documentation
4. **Performance Considerations** - Monitor impact on WebSocket and tool execution performance
5. **Backward Compatibility** - Ensure changes don't break existing integrations

## Conclusion

The Unified Tool Integration successfully combines all three major components into a cohesive system that provides:

- **Seamless User Experience** - Natural language to tool execution
- **Real-time Communication** - WebSocket-based protocol integration
- **Comprehensive Monitoring** - Full visibility into tool execution
- **Extensible Architecture** - Easy addition of new tools and capabilities
- **Production Ready** - Robust error handling and performance optimization

This integration represents the completion of Task 13 and provides a solid foundation for advanced AI-powered tool execution in the Ally ecosystem.