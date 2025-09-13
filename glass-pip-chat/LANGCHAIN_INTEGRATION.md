# LangChain Integration for Glass PiP Chat

This document describes the LangChain integration that enhances the tool calling capabilities of the Glass PiP Chat application.

## Overview

The LangChain integration provides:

- **Multi-step reasoning**: Automatic tool chaining and complex task breakdown
- **Enhanced tool calling**: Better tool selection and parameter extraction
- **MCP tool integration**: Seamless integration with Model Context Protocol tools
- **Conversation memory**: Persistent context across chat sessions
- **Streaming with feedback**: Real-time tool execution updates

## Installation

### Option 1: Automatic Installation (Windows)
```bash
# Run the installation script
cd Ally/glass-pip-chat
install-langchain.bat
# or
install-langchain.ps1
```

### Option 2: Manual Installation
```bash
cd Ally/glass-pip-chat
npm install @langchain/core @langchain/ollama @langchain/community langchain --legacy-peer-deps
```

### Verify Installation
1. **Verify Ollama is Running**:
   ```bash
   ollama serve
   ```

2. **Test MCP Tools** (if using):
   Make sure your MCP servers are configured and running.

3. **Restart the Application**:
   The LangChain features will be available after restart.

## Usage

### Basic Usage

The LangChain integration can be accessed in two ways:

1. **Toggle Mode**: Use the toggle button in the interface to switch between basic and enhanced modes
2. **Direct Integration**: Use the `LangChainChatInterface` component directly

### Components

#### LangChainService
Core service that handles:
- LLM integration with Ollama
- Tool management and execution
- Agent creation and workflow management
- Memory management

#### LangChainChatInterface
React component providing:
- Enhanced chat interface
- Tool execution visualization
- Settings and configuration
- Export/import functionality

#### EnhancedChatInterface
Unified interface that can switch between:
- Basic chat mode
- LangChain enhanced mode
- Unified platform mode

### Configuration

```typescript
const config = {
  model: 'llama3.2:3b',           // Ollama model to use
  temperature: 0.7,               // Response creativity
  maxTokens: 4096,                // Maximum response length
  timeout: 60000,                 // Request timeout
  enableStreaming: true,          // Real-time responses
  maxIterations: 10,              // Max tool calling steps
  enableMemory: true,             // Conversation memory
  memoryKey: 'chat_history'       // Memory storage key
};
```

## Features

### Multi-Step Tool Calling

The LangChain integration automatically:
1. Analyzes user requests
2. Selects appropriate tools
3. Executes tools in sequence
4. Combines results for final response

Example:
```
User: "Read the README file and summarize it, then create a backup"

Agent:
1. Uses filesystem_read_file to read README.md
2. Analyzes content and creates summary
3. Uses filesystem_copy_file to create backup
4. Provides comprehensive response
```

### Available Tools

#### MCP Tools
- All configured MCP server tools
- Filesystem operations (read, write, list, etc.)
- Memory operations (create, search, update)

#### Built-in Tools
- `get_current_time`: Current date/time
- `calculate`: Mathematical expressions
- `search_memory`: Search conversation history

#### Custom Tools
Easy to add custom tools:

```typescript
new DynamicTool({
  name: 'custom_tool',
  description: 'Description of what the tool does',
  func: async (input: string) => {
    // Tool implementation
    return result;
  }
});
```

### Memory Management

The integration includes:
- **Conversation Memory**: Remembers context across messages
- **Tool History**: Tracks tool usage patterns
- **Context Awareness**: Uses previous results in new requests

### Streaming and Feedback

Real-time updates show:
- Tool selection reasoning
- Tool execution progress
- Intermediate results
- Final response assembly

## API Reference

### LangChainService

```typescript
// Initialize service
const service = new LangChainService(config);

// Send chat message
const response = await service.chat(
  message,
  { sessionId, userId },
  callbacks
);

// Manage tools
await service.reloadTools();
const tools = service.getAvailableTools();
const testResults = await service.testTools();

// Memory management
await service.clearMemory();
```

### Hooks

```typescript
// Main chat hook
const {
  state,
  sendMessage,
  clearChat,
  clearMemory,
  stopGeneration,
  reloadTools,
  updateConfig,
  testTools,
  exportChat,
  importChat
} = useLangChainChat(options);
```

## Troubleshooting

### Common Issues

1. **Ollama Connection Failed**
   - Ensure Ollama is running: `ollama serve`
   - Check model availability: `ollama list`
   - Verify port 11434 is accessible

2. **Tools Not Loading**
   - Check MCP server status
   - Verify tool configurations
   - Use `testTools()` to diagnose issues

3. **Memory Issues**
   - Clear memory if corrupted: `clearMemory()`
   - Check localStorage for persistence issues
   - Verify memory configuration

4. **Performance Issues**
   - Reduce `maxIterations` for faster responses
   - Use smaller models for better performance
   - Disable memory if not needed

### Debug Mode

Enable debug logging:
```typescript
const service = new LangChainService({
  ...config,
  verbose: true
});
```

## Examples

### Basic Chat
```typescript
const response = await service.chat("Hello, how are you?");
```

### Tool-Assisted Task
```typescript
const response = await service.chat(
  "Read the package.json file and tell me what dependencies are installed",
  { sessionId: 'session-1' }
);
```

### Multi-Step Workflow
```typescript
const response = await service.chat(
  "Analyze all TypeScript files in the src directory, create a summary report, and save it to analysis.md",
  { sessionId: 'session-1' }
);
```

## Contributing

To extend the LangChain integration:

1. Add new tools in `loadCustomTools()`
2. Extend the service configuration
3. Add new UI components for specific features
4. Update documentation

## License

Same as the main project license.