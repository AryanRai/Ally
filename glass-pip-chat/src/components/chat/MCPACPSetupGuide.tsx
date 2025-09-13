import React, { useState } from 'react';
import { CheckCircle, Circle, ExternalLink, Copy } from 'lucide-react';
import { cn } from '../../lib/utils';

interface MCPACPSetupGuideProps {
  className?: string;
  theme?: 'light' | 'dark';
  platform?: string;
}

export const MCPACPSetupGuide: React.FC<MCPACPSetupGuideProps> = ({ 
  className = '', 
  theme = 'dark', 
  platform = 'web' 
}) => {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const toggleStep = (stepIndex: number) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(stepIndex)) {
      newCompleted.delete(stepIndex);
    } else {
      newCompleted.add(stepIndex);
    }
    setCompletedSteps(newCompleted);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const steps = [
    {
      title: 'Install UV Package Manager',
      description: 'UV is required to run MCP servers',
      content: (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Install UV (Python package manager) to run MCP servers:
          </p>
          <div className="bg-gray-100 p-2 rounded text-sm font-mono flex items-center justify-between">
            <span>pip install uv</span>
            <button
              onClick={() => copyToClipboard('pip install uv', 'UV install command')}
              className="ml-2 p-1 hover:bg-gray-200 rounded"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Or visit <a href="https://docs.astral.sh/uv/getting-started/installation/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center">
              UV Installation Guide <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </p>
        </div>
      )
    },
    {
      title: 'Configure MCP Servers',
      description: 'Set up your MCP server configuration',
      content: (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Create or edit <code className="bg-gray-100 px-1 rounded">.ally/settings/mcp.json</code>:
          </p>
          <div className="bg-gray-100 p-2 rounded text-xs font-mono overflow-x-auto">
            <pre>{`{
  "mcpServers": {
    "filesystem": {
      "command": "uvx",
      "args": ["mcp-server-filesystem", "--path", "."],
      "disabled": false,
      "autoApprove": ["read_file", "list_directory"]
    }
  }
}`}</pre>
          </div>
          <button
            onClick={() => copyToClipboard(`{
  "mcpServers": {
    "filesystem": {
      "command": "uvx",
      "args": ["mcp-server-filesystem", "--path", "."],
      "disabled": false,
      "autoApprove": ["read_file", "list_directory"]
    }
  }
}`, 'MCP config')}
            className="text-xs text-blue-500 hover:underline flex items-center"
          >
            <Copy className="w-3 h-3 mr-1" />
            Copy Configuration
          </button>
        </div>
      )
    },
    {
      title: 'Configure ACP Agents (Optional)',
      description: 'Set up specialized AI agents',
      content: (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Create <code className="bg-gray-100 px-1 rounded">.ally/settings/acp.json</code> for custom agents:
          </p>
          <div className="bg-gray-100 p-2 rounded text-xs font-mono overflow-x-auto">
            <pre>{`{
  "agents": {
    "research-assistant": {
      "id": "research-assistant",
      "name": "Research Assistant",
      "description": "Specialized research agent",
      "endpoint": "http://localhost:8001/api/agents/research",
      "capabilities": ["research", "analysis"],
      "autoConnect": false
    }
  }
}`}</pre>
          </div>
          <p className="text-xs text-gray-500">
            Note: ACP agents require custom server implementations
          </p>
        </div>
      )
    },
    {
      title: 'Test MCP Server',
      description: 'Verify your MCP server is working',
      content: (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Test the filesystem MCP server manually:
          </p>
          <div className="bg-gray-100 p-2 rounded text-sm font-mono flex items-center justify-between">
            <span>uvx mcp-server-filesystem --path .</span>
            <button
              onClick={() => copyToClipboard('uvx mcp-server-filesystem --path .', 'MCP test command')}
              className="ml-2 p-1 hover:bg-gray-200 rounded"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs text-gray-500">
            This should start the server and show available tools
          </p>
        </div>
      )
    },
    {
      title: 'Restart Application',
      description: 'Reload to apply configuration changes',
      content: (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Restart glass-pip-chat to load your MCP/ACP configuration.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Reload Application
          </button>
        </div>
      )
    }
  ];

  return (
    <div className={cn(
      "rounded-lg shadow-sm border p-4",
      platform === 'win32'
        ? "bg-black/20 border-white/10"
        : theme === 'dark' 
          ? "bg-gray-800/50 border-gray-700/50" 
          : "bg-white border-gray-200",
      className
    )}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          MCP/ACP Setup Guide
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Follow these steps to enable Model Context Protocol and Agent Communication Protocol integration
        </p>
      </div>

      {copiedText && (
        <div className="mb-4 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
          ✓ Copied {copiedText} to clipboard
        </div>
      )}

      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={index} className="border rounded-lg p-3">
            <div 
              className="flex items-start cursor-pointer"
              onClick={() => toggleStep(index)}
            >
              <div className="flex-shrink-0 mt-1">
                {completedSteps.has(index) ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div className="ml-3 flex-1">
                <h4 className="font-medium text-gray-900">
                  {step.title}
                </h4>
                <p className="text-sm text-gray-600 mt-1">
                  {step.description}
                </p>
              </div>
            </div>
            
            <div className="ml-8 mt-3">
              {step.content}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded">
        <h4 className="font-medium text-blue-900 mb-2">Popular MCP Servers</h4>
        <div className="text-sm text-blue-800 space-y-1">
          <div>• <strong>Filesystem:</strong> File operations (read, write, list)</div>
          <div>• <strong>Brave Search:</strong> Web search capabilities</div>
          <div>• <strong>GitHub:</strong> Repository operations</div>
          <div>• <strong>PostgreSQL:</strong> Database queries</div>
        </div>
        <p className="text-xs text-blue-600 mt-2">
          Visit the <a href="https://github.com/modelcontextprotocol/servers" target="_blank" rel="noopener noreferrer" className="underline">
            MCP Servers Repository
          </a> for more options
        </p>
      </div>
    </div>
  );
};