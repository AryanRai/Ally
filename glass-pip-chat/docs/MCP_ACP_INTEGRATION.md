# MCP/ACP Integration Guide

This document explains how to set up and use Model Context Protocol (MCP) and Agent Communication Protocol (ACP) integration in glass-pip-chat.

## Overview

The glass-pip-chat application now supports:
- **MCP (Model Context Protocol)**: Connect to external MCP servers to access tools like file systems, databases, APIs, etc.
- **ACP (Agent Communication Protocol)**: Connect to specialized AI agents for specific tasks like research, code analysis, etc.

## Configuration

### MCP Configuration

MCP servers are configured in `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "uvx",
      "args": ["mcp-server-filesystem", "--path", "."],
      "env": {
        "FASTMCP_LOG_LEVEL": "ERROR"
      },
      "disabled": false,
      "autoApprove": ["read_file", "list_directory"]
    },
    "brave-search": {
      "command": "uvx", 
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "YOUR_API_KEY_HERE"
      },
      "disabled": true,
      "autoApprove": ["brave_web_search"]
    }
  }
}
```

### ACP Configuration

ACP agents are configured in `.kiro/settings/acp.json`:

```json
{
  "agents": {
    "research-assistant": {
      "id": "research-assistant",
      "name": "Research Assistant", 
      "description": "Specialized agent for research tasks",
      "endpoint": "http://localhost:8001/api/agents/research",
      "capabilities": ["research", "analysis", "summarization"],
      "autoConnect": true,
      "timeout": 30000
    }
  }
}
```

## Available MCP Servers

### Official MCP Servers

1. **Filesystem Server**
   ```bash
   uvx mcp-server-filesystem --path /your/path
   ```
   - Tools: `read_file`, `write_file`, `list_directory`, `create_directory`

2. **Brave Search Server**
   ```bash
   uvx -y @modelcontextprotocol/server-brave-search
   ```
   - Tools: `brave_web_search`
   - Requires: `BRAVE_API_KEY` environment variable

3. **GitHub Server**
   ```bash
   uvx mcp-server-github
   ```
   - Tools: `search_repositories`, `get_file_contents`, `create_issue`
   - Requires: `GITHUB_PERSONAL_ACCESS_TOKEN` environment variable

4. **PostgreSQL Server**
   ```bash
   uvx mcp-server-postgres
   ```
   - Tools: `read_query`, `write_query`, `list_tables`
   - Requires: `POSTGRES_CONNECTION_STRING` environment variable

### Custom MCP Servers

You can create custom MCP servers using the MCP SDK:

```python
# example_server.py
from mcp.server import Server
from mcp.types import Tool, TextContent

server = Server("example-server")

@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="hello_world",
            description="Says hello to the world",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Name to greet"}
                }
            }
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict):
    if name == "hello_world":
        return [TextContent(type="text", text=f"Hello, {arguments.get('name', 'World')}!")]

if __name__ == "__main__":
    import asyncio
    asyncio.run(server.run())
```

## ACP Agent Development

### Agent Interface

ACP agents should implement a REST API with the following endpoints:

```typescript
// POST /api/agents/{agentId}
interface AgentRequest {
  type: 'query' | 'ping';
  id: string;
  query?: string;
  context?: Record<string, any>;
  sessionId?: string;
  timestamp: string;
}

interface AgentResponse {
  status: 'ok' | 'error';
  response?: string;
  confidence?: number;
  metadata?: Record<string, any>;
  toolCalls?: Array<{
    name: string;
    parameters: Record<string, any>;
  }>;
  error?: string;
}
```

### Example Agent Implementation

```python
# research_agent.py
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

@app.route('/api/agents/research', methods=['POST'])
def handle_request():
    data = request.json
    
    if data.get('type') == 'ping':
        return jsonify({'status': 'ok'})
    
    if data.get('type') == 'query':
        query = data.get('query', '')
        
        # Perform research logic here
        response = perform_research(query)
        
        return jsonify({
            'status': 'ok',
            'response': response,
            'confidence': 0.9,
            'metadata': {
                'sources': ['example.com'],
                'processing_time': 1.2
            }
        })
    
    return jsonify({'status': 'error', 'error': 'Unknown request type'})

def perform_research(query):
    # Implement your research logic
    return f"Research results for: {query}"

if __name__ == '__main__':
    app.run(port=8001)
```

## Usage in Chat

### Using MCP Tools

The AI can automatically detect when to use MCP tools:

```
User: "Can you read the README.md file?"
AI: "I'll read the README.md file for you."
[MCP filesystem tool executes: read_file with path="README.md"]
AI: "Here's the content of README.md: ..."
```

### Using ACP Agents

The AI can query ACP agents for specialized tasks:

```
User: "Research the latest developments in quantum computing"
AI: "I'll use the research assistant to find information about quantum computing."
[ACP research-assistant agent executes with query="latest developments in quantum computing"]
AI: "Based on the research, here are the latest developments: ..."
```

## Tool Detection

The system automatically detects tool usage through:

1. **Intent Recognition**: Phrases like "read file", "search for", "analyze code"
2. **Direct Tool Mentions**: "use filesystem tool", "query research agent"
3. **Context Analysis**: Understanding when external tools would be helpful

## Monitoring and Debugging

### MCP/ACP Dashboard

Access the MCP/ACP dashboard through Settings → MCP/ACP Integration to:
- View connected servers and agents
- Monitor tool execution
- Test individual tools
- Restart failed connections

### Logs

Check the browser console for detailed logs:
- MCP server connection status
- Tool execution results
- ACP agent responses
- Error messages and debugging info

## Security Considerations

1. **Auto-Approve Lists**: Configure which tools can run without user confirmation
2. **Timeouts**: Set appropriate timeouts for tool execution
3. **Sandboxing**: MCP servers run in separate processes
4. **Authentication**: ACP agents should implement proper authentication
5. **Input Validation**: All tool parameters are validated before execution

## Troubleshooting

### Common Issues

1. **MCP Server Won't Start**
   - Check if `uvx` is installed: `pip install uv`
   - Verify server path and arguments
   - Check environment variables

2. **ACP Agent Not Responding**
   - Verify agent endpoint is accessible
   - Check agent logs for errors
   - Ensure proper request format

3. **Tools Not Detected**
   - Check tool descriptions in configuration
   - Verify AI model supports tool calling
   - Review detection patterns in logs

### Debug Commands

```bash
# Test MCP server manually
uvx mcp-server-filesystem --path . --debug

# Test ACP agent endpoint
curl -X POST http://localhost:8001/api/agents/research \
  -H "Content-Type: application/json" \
  -d '{"type":"ping","id":"test","timestamp":"2024-01-01T00:00:00Z"}'
```

## Examples

### File Operations with MCP

```
User: "Create a new file called test.txt with 'Hello World'"
AI: "I'll create the file for you."
[MCP filesystem: write_file(path="test.txt", content="Hello World")]
AI: "File created successfully!"
```

### Research with ACP

```
User: "What are the best practices for React performance?"
AI: "Let me research React performance best practices."
[ACP research-assistant: query="React performance best practices"]
AI: "Here are the key React performance best practices: ..."
```

### Code Analysis with ACP

```
User: "Review this JavaScript function for bugs"
AI: "I'll analyze the code for potential issues."
[ACP code-assistant: query="analyze JavaScript function" + code context]
AI: "I found several potential issues in your code: ..."
```

## Future Enhancements

- **Tool Chaining**: Automatic sequencing of multiple tools
- **Context Persistence**: Maintaining context across tool calls
- **Custom Protocols**: Support for additional communication protocols
- **Visual Tool Builder**: GUI for creating custom tools
- **Performance Monitoring**: Detailed metrics and analytics