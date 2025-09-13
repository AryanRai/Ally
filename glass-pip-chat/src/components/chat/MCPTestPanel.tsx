import React, { useState, useEffect } from 'react';
import { Play, Square, RefreshCw, Terminal } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getMCPClient } from '../../services/mcpClient';

interface MCPTestPanelProps {
  className?: string;
  theme?: 'light' | 'dark';
  platform?: string;
}

export const MCPTestPanel: React.FC<MCPTestPanelProps> = ({
  className = '',
  theme = 'dark',
  platform = 'web'
}) => {
  const [mcpClient] = useState(() => getMCPClient());
  const [servers, setServers] = useState<any[]>([]);
  const [tools, setTools] = useState<any[]>([]);
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    // Listen for MCP events
    const handleServerStarted = (data: any) => {
      addTestResult(`✅ Server started: ${data.name} with ${data.tools?.length || 0} tools`);
      refreshStatus();
    };

    const handleServerError = (data: any) => {
      addTestResult(`❌ Server error: ${data.name} - ${data.error}`);
    };

    const handleToolsUpdated = (data: any) => {
      addTestResult(`🔧 Tools updated for ${data.serverName}: ${data.tools?.length || 0} tools`);
      refreshStatus();
    };

    mcpClient.on('serverStarted', handleServerStarted);
    mcpClient.on('serverError', handleServerError);
    mcpClient.on('toolsUpdated', handleToolsUpdated);

    // Initial status refresh
    refreshStatus();

    return () => {
      mcpClient.removeAllListeners();
    };
  }, [mcpClient]);

  const addTestResult = (message: string) => {
    setTestResults(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const refreshStatus = () => {
    const serverStatus = mcpClient.getServerStatus();
    const allTools = mcpClient.getAllTools();
    setServers(serverStatus);
    setTools(allTools);
  };

  const startFilesystemServer = async () => {
    if (isRunning) return;
    
    setIsRunning(true);
    addTestResult('🚀 Starting filesystem MCP server...');
    
    try {
      await mcpClient.startServer('filesystem-test', {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
        env: { FASTMCP_LOG_LEVEL: 'ERROR' }
      });
    } catch (error) {
      addTestResult(`❌ Failed to start server: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  const testFilesystemTool = async () => {
    if (tools.length === 0) {
      addTestResult('❌ No tools available. Start a server first.');
      return;
    }

    addTestResult('🧪 Testing filesystem tools...');
    
    try {
      // Test list_directory tool
      const listTool = tools.find(t => t.name === 'list_directory');
      if (listTool) {
        const result = await mcpClient.executeTool('filesystem-test', 'list_directory', { path: '.' });
        addTestResult(`📁 Directory listing result: ${JSON.stringify(result).substring(0, 100)}...`);
      }

      // Test read_file tool if available
      const readTool = tools.find(t => t.name === 'read_file');
      if (readTool) {
        const result = await mcpClient.executeTool('filesystem-test', 'read_file', { path: 'package.json' });
        addTestResult(`📄 File read result: ${JSON.stringify(result).substring(0, 100)}...`);
      }
    } catch (error) {
      addTestResult(`❌ Tool test failed: ${error}`);
    }
  };

  const stopAllServers = async () => {
    addTestResult('🛑 Stopping all MCP servers...');
    try {
      await mcpClient.stopAllServers();
      refreshStatus();
      addTestResult('✅ All servers stopped');
    } catch (error) {
      addTestResult(`❌ Failed to stop servers: ${error}`);
    }
  };

  return (
    <div className={cn(
      "rounded-lg border p-4",
      platform === 'win32'
        ? "bg-black/20 border-white/10"
        : theme === 'dark' 
          ? "bg-gray-800/50 border-gray-700/50" 
          : "bg-white border-gray-200",
      className
    )}>
      <div className="mb-4">
        <h3 className={cn(
          "text-lg font-semibold flex items-center gap-2",
          platform === 'win32'
            ? "text-white/90"
            : theme === 'dark' 
              ? "text-white/90" 
              : "text-gray-900"
        )}>
          <Terminal className="w-5 h-5" />
          MCP Integration Test Panel
        </h3>
        <p className={cn(
          "text-sm mt-1",
          platform === 'win32'
            ? "text-white/70"
            : theme === 'dark' 
              ? "text-gray-300" 
              : "text-gray-600"
        )}>
          Test real MCP server integration with npx
        </p>
      </div>

      {/* Control Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={startFilesystemServer}
          disabled={isRunning}
          className={cn(
            "px-3 py-2 text-sm rounded-md transition-colors flex items-center gap-2 disabled:opacity-50",
            platform === 'win32'
              ? "bg-green-600/80 text-white hover:bg-green-600"
              : theme === 'dark'
                ? "bg-green-600 text-white hover:bg-green-500"
                : "bg-green-500 text-white hover:bg-green-600"
          )}
        >
          <Play className="w-4 h-4" />
          {isRunning ? 'Starting...' : 'Start Filesystem Server'}
        </button>

        <button
          onClick={testFilesystemTool}
          disabled={tools.length === 0}
          className={cn(
            "px-3 py-2 text-sm rounded-md transition-colors flex items-center gap-2 disabled:opacity-50",
            platform === 'win32'
              ? "bg-blue-600/80 text-white hover:bg-blue-600"
              : theme === 'dark'
                ? "bg-blue-600 text-white hover:bg-blue-500"
                : "bg-blue-500 text-white hover:bg-blue-600"
          )}
        >
          <Terminal className="w-4 h-4" />
          Test Tools
        </button>

        <button
          onClick={refreshStatus}
          className={cn(
            "px-3 py-2 text-sm rounded-md transition-colors flex items-center gap-2",
            platform === 'win32'
              ? "bg-gray-600/80 text-white hover:bg-gray-600"
              : theme === 'dark'
                ? "bg-gray-700 text-white hover:bg-gray-600"
                : "bg-gray-500 text-white hover:bg-gray-600"
          )}
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>

        <button
          onClick={stopAllServers}
          className={cn(
            "px-3 py-2 text-sm rounded-md transition-colors flex items-center gap-2",
            platform === 'win32'
              ? "bg-red-600/80 text-white hover:bg-red-600"
              : theme === 'dark'
                ? "bg-red-600 text-white hover:bg-red-500"
                : "bg-red-500 text-white hover:bg-red-600"
          )}
        >
          <Square className="w-4 h-4" />
          Stop All
        </button>
      </div>

      {/* Status Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Servers */}
        <div>
          <h4 className={cn(
            "font-medium mb-2",
            platform === 'win32'
              ? "text-white/90"
              : theme === 'dark' 
                ? "text-white/90" 
                : "text-gray-900"
          )}>
            Servers ({servers.length})
          </h4>
          <div className={cn(
            "text-sm p-2 rounded border max-h-32 overflow-y-auto",
            platform === 'win32'
              ? "bg-black/30 border-white/20 text-white/80"
              : theme === 'dark'
                ? "bg-gray-900/50 border-gray-600 text-gray-300"
                : "bg-gray-50 border-gray-300 text-gray-700"
          )}>
            {servers.length === 0 ? (
              <div className="text-center py-2 opacity-60">No servers running</div>
            ) : (
              servers.map((server, i) => (
                <div key={i} className="mb-1">
                  <span className={server.connected ? 'text-green-400' : 'text-red-400'}>●</span>
                  {' '}{server.name} ({server.toolCount} tools)
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tools */}
        <div>
          <h4 className={cn(
            "font-medium mb-2",
            platform === 'win32'
              ? "text-white/90"
              : theme === 'dark' 
                ? "text-white/90" 
                : "text-gray-900"
          )}>
            Available Tools ({tools.length})
          </h4>
          <div className={cn(
            "text-sm p-2 rounded border max-h-32 overflow-y-auto",
            platform === 'win32'
              ? "bg-black/30 border-white/20 text-white/80"
              : theme === 'dark'
                ? "bg-gray-900/50 border-gray-600 text-gray-300"
                : "bg-gray-50 border-gray-300 text-gray-700"
          )}>
            {tools.length === 0 ? (
              <div className="text-center py-2 opacity-60">No tools available</div>
            ) : (
              tools.map((tool, i) => (
                <div key={i} className="mb-1">
                  🔧 {tool.name} ({tool.serverName})
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Test Results Log */}
      <div>
        <h4 className={cn(
          "font-medium mb-2",
          platform === 'win32'
            ? "text-white/90"
            : theme === 'dark' 
              ? "text-white/90" 
              : "text-gray-900"
        )}>
          Test Results
        </h4>
        <div className={cn(
          "text-xs font-mono p-3 rounded border h-40 overflow-y-auto",
          platform === 'win32'
            ? "bg-black/30 border-white/20 text-white/80"
            : theme === 'dark'
              ? "bg-gray-900/50 border-gray-600 text-gray-300"
              : "bg-gray-50 border-gray-300 text-gray-700"
        )}>
          {testResults.length === 0 ? (
            <div className="text-center py-8 opacity-60">
              Click "Start Filesystem Server" to begin testing
            </div>
          ) : (
            testResults.map((result, i) => (
              <div key={i} className="mb-1">{result}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};