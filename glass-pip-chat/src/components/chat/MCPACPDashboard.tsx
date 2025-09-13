import React, { useState } from 'react';
import { Edit3 } from 'lucide-react';
import { useMCPACPIntegration } from '../../hooks/useMCPACPIntegration';
import { MCPACPSetupGuide } from './MCPACPSetupGuide';
import { ConfigEditor } from './ConfigEditor';
import { MCPTestPanel } from './MCPTestPanel';
import { cn } from '../../lib/utils';

interface MCPACPDashboardProps {
  className?: string;
  theme?: 'light' | 'dark';
  platform?: string;
}

export const MCPACPDashboard: React.FC<MCPACPDashboardProps> = ({ 
  className = '', 
  theme = 'dark', 
  platform = 'web' 
}) => {
  const {
    mcpEnabled,
    mcpServers,
    mcpTools,
    acpEnabled,
    acpAgents,
    isInitialized,
    isInitializing,
    lastError,
    refreshMCPServers,
    restartMCPServer,
    refreshACPAgents,
    reconnectACPAgent,
    getUnifiedToolList
  } = useMCPACPIntegration();

  const [activeTab, setActiveTab] = useState<'mcp' | 'acp' | 'unified'>('unified');
  const [testingTool, setTestingTool] = useState<string | null>(null);
  const [configEditor, setConfigEditor] = useState<{
    isOpen: boolean;
    type: 'mcp' | 'acp';
    title: string;
  }>({
    isOpen: false,
    type: 'mcp',
    title: ''
  });

  const handleRestartServer = async (serverName: string) => {
    try {
      await restartMCPServer(serverName);
    } catch (error) {
      console.error('Failed to restart server:', error);
    }
  };

  const handleReconnectAgent = async (agentId: string) => {
    try {
      await reconnectACPAgent(agentId);
    } catch (error) {
      console.error('Failed to reconnect agent:', error);
    }
  };

  const handleTestTool = async (toolName: string) => {
    setTestingTool(toolName);
    // Add test logic here
    setTimeout(() => setTestingTool(null), 2000);
  };

  const handleEditConfig = (type: 'mcp' | 'acp') => {
    setConfigEditor({
      isOpen: true,
      type,
      title: type === 'mcp' ? 'MCP' : 'ACP'
    });
  };

  const handleSaveConfig = async (config: any) => {
    try {
      if (typeof window !== 'undefined' && window.pip) {
        if (configEditor.type === 'mcp') {
          await window.pip.mcp.writeConfig(config);
        } else {
          await window.pip.acp.writeConfig(config);
        }
        
        // Refresh the integration after saving
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  };

  const handleCloseConfigEditor = () => {
    setConfigEditor({
      isOpen: false,
      type: 'mcp',
      title: ''
    });
  };

  if (isInitializing) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">Initializing MCP/ACP integration...</span>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="text-center text-gray-500">
          <div className="mb-4">
            <h4 className="font-medium text-gray-700 mb-2">MCP/ACP Integration</h4>
            <p className="text-sm">
              Model Context Protocol and Agent Communication Protocol integration allows your AI to use external tools and specialized agents.
            </p>
          </div>
          
          {lastError ? (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="text-red-800 text-sm">
                <strong>Error:</strong> {lastError}
              </div>
              <div className="text-red-600 text-xs mt-1">
                Check your configuration files in .kiro/settings/
              </div>
            </div>
          ) : (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="text-blue-800 text-sm">
                <strong>Getting Started:</strong>
              </div>
              <ul className="text-blue-700 text-xs mt-2 space-y-1">
                <li>• Configure MCP servers in .ally/settings/mcp.json</li>
                <li>• Configure ACP agents in .ally/settings/acp.json</li>
                <li>• Install required dependencies (uvx for MCP)</li>
                <li>• Use the "Edit Config" buttons to modify settings</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  const unifiedTools = getUnifiedToolList();

  return (
    <div className={cn(
      "rounded-lg shadow-sm border",
      platform === 'win32'
        ? "bg-black/20 border-white/10"
        : theme === 'dark' 
          ? "bg-gray-800/50 border-gray-700/50" 
          : "bg-white border-gray-200",
      className
    )}>
      {/* Header */}
      <div className={cn(
        "border-b px-4 py-3",
        platform === 'win32'
          ? "border-white/10"
          : theme === 'dark' 
            ? "border-gray-700/50" 
            : "border-gray-200"
      )}>
        <h3 className={cn(
          "text-lg font-semibold",
          platform === 'win32'
            ? "text-white/90"
            : theme === 'dark' 
              ? "text-white/90" 
              : "text-gray-900"
        )}>
          MCP/ACP Tool Integration
        </h3>
        <p className={cn(
          "text-sm mt-1",
          platform === 'win32'
            ? "text-white/70"
            : theme === 'dark' 
              ? "text-gray-300" 
              : "text-gray-600"
        )}>
          Model Context Protocol & Agent Communication Protocol tools
        </p>
      </div>

      {/* Tabs */}
      <div className={cn(
        "border-b",
        platform === 'win32'
          ? "border-white/10"
          : theme === 'dark' 
            ? "border-gray-700/50" 
            : "border-gray-200"
      )}>
        <nav className="flex space-x-8 px-4">
          {['unified', 'mcp', 'acp'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={cn(
                "py-2 px-1 border-b-2 font-medium text-sm transition-colors",
                activeTab === tab
                  ? "border-blue-500 text-blue-400"
                  : cn(
                      "border-transparent",
                      platform === 'win32'
                        ? "text-white/60 hover:text-white/80 hover:border-white/20"
                        : theme === 'dark'
                          ? "text-gray-400 hover:text-gray-300 hover:border-gray-600"
                          : "text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    )
              )}
            >
              {tab === 'unified' && `All Tools (${unifiedTools.length})`}
              {tab === 'mcp' && `MCP (${mcpTools.length})`}
              {tab === 'acp' && `ACP (${acpAgents.length})`}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="p-4">
        {lastError && (
          <div className={cn(
            "mb-4 p-3 rounded-md border",
            platform === 'win32'
              ? "bg-red-500/10 border-red-500/20 text-red-300"
              : theme === 'dark'
                ? "bg-red-900/20 border-red-800/30 text-red-300"
                : "bg-red-50 border-red-200 text-red-800"
          )}>
            <div className="text-sm">{lastError}</div>
          </div>
        )}

        {/* Unified Tools Tab */}
        {activeTab === 'unified' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className={cn(
                "font-medium",
                platform === 'win32'
                  ? "text-white/90"
                  : theme === 'dark' 
                    ? "text-white/90" 
                    : "text-gray-900"
              )}>Available Tools</h4>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.location.reload()}
                  className={cn(
                    "px-2 py-1 text-xs rounded transition-colors",
                    platform === 'win32'
                      ? "bg-white/10 text-white/80 hover:bg-white/20"
                      : theme === 'dark'
                        ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        : "bg-gray-500 text-white hover:bg-gray-600"
                  )}
                >
                  Reload
                </button>
                <div className={cn(
                  "text-sm",
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' 
                      ? "text-gray-400" 
                      : "text-gray-500"
                )}>
                  {unifiedTools.length} tools available
                </div>
              </div>
            </div>

            {/* MCP Test Panel */}
            <MCPTestPanel theme={theme} platform={platform} />

            {/* Debug Info */}
            <div className={cn(
              "text-xs p-2 rounded",
              platform === 'win32'
                ? "text-white/50 bg-white/5"
                : theme === 'dark'
                  ? "text-gray-400 bg-gray-800/30"
                  : "text-gray-500 bg-gray-50"
            )}>
              <div>MCP Enabled: {mcpEnabled ? 'Yes' : 'No'}</div>
              <div>ACP Enabled: {acpEnabled ? 'Yes' : 'No'}</div>
              <div>MCP Servers: {mcpServers.length}</div>
              <div>ACP Agents: {acpAgents.length}</div>
              <div>Electron API: {typeof window !== 'undefined' && window.pip ? 'Available' : 'Not Available'}</div>
            </div>

            {unifiedTools.length === 0 ? (
              <div className="space-y-4">
                <div className={cn(
                  "text-center py-4",
                  platform === 'win32'
                    ? "text-white/60"
                    : theme === 'dark' 
                      ? "text-gray-400" 
                      : "text-gray-500"
                )}>
                  No tools available. Get started with MCP/ACP integration:
                </div>
                <MCPACPSetupGuide theme={theme} platform={platform} />
              </div>
            ) : (
              <div className="grid gap-3">
                {unifiedTools.map((tool) => (
                  <div
                    key={tool.name}
                    className={cn(
                      "border rounded-lg p-3 transition-colors",
                      platform === 'win32'
                        ? "border-white/10 hover:bg-white/5"
                        : theme === 'dark'
                          ? "border-gray-700/50 hover:bg-gray-800/30"
                          : "border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className={cn(
                            "font-medium",
                            platform === 'win32'
                              ? "text-white/90"
                              : theme === 'dark' 
                                ? "text-white/90" 
                                : "text-gray-900"
                          )}>
                            {tool.name}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            tool.type === 'mcp' 
                              ? 'bg-blue-100 text-blue-800'
                              : tool.type === 'acp'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {tool.type.toUpperCase()}
                          </span>
                        </div>
                        <p className={cn(
                          "text-sm mt-1",
                          platform === 'win32'
                            ? "text-white/70"
                            : theme === 'dark' 
                              ? "text-gray-300" 
                              : "text-gray-600"
                        )}>
                          {tool.description}
                        </p>
                        {tool.source && (
                          <p className={cn(
                            "text-xs mt-1",
                            platform === 'win32'
                              ? "text-white/50"
                              : theme === 'dark' 
                                ? "text-gray-400" 
                                : "text-gray-500"
                          )}>
                            Source: {tool.source}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleTestTool(tool.name)}
                        disabled={testingTool === tool.name}
                        className={cn(
                          "ml-3 px-3 py-1 text-xs rounded transition-colors disabled:opacity-50",
                          platform === 'win32'
                            ? "bg-blue-600/80 text-white hover:bg-blue-600"
                            : theme === 'dark'
                              ? "bg-blue-600 text-white hover:bg-blue-500"
                              : "bg-blue-500 text-white hover:bg-blue-600"
                        )}
                      >
                        {testingTool === tool.name ? 'Testing...' : 'Test'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MCP Tab */}
        {activeTab === 'mcp' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className={cn(
                "font-medium",
                platform === 'win32'
                  ? "text-white/90"
                  : theme === 'dark' 
                    ? "text-white/90" 
                    : "text-gray-900"
              )}>MCP Servers</h4>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleEditConfig('mcp')}
                  className={cn(
                    "px-3 py-1 text-sm rounded transition-colors flex items-center space-x-1",
                    platform === 'win32'
                      ? "bg-gray-600/80 text-white hover:bg-gray-600"
                      : theme === 'dark'
                        ? "bg-gray-700 text-white hover:bg-gray-600"
                        : "bg-gray-500 text-white hover:bg-gray-600"
                  )}
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit Config</span>
                </button>
                <button
                  onClick={refreshMCPServers}
                  className={cn(
                    "px-3 py-1 text-sm rounded transition-colors",
                    platform === 'win32'
                      ? "bg-blue-600/80 text-white hover:bg-blue-600"
                      : theme === 'dark'
                        ? "bg-blue-600 text-white hover:bg-blue-500"
                        : "bg-blue-500 text-white hover:bg-blue-600"
                  )}
                >
                  Refresh
                </button>
              </div>
            </div>

            {mcpServers.length === 0 ? (
              <div className={cn(
                "text-center py-8",
                platform === 'win32'
                  ? "text-white/60"
                  : theme === 'dark' 
                    ? "text-gray-400" 
                    : "text-gray-500"
              )}>
                No MCP servers configured or running.
              </div>
            ) : (
              <div className="space-y-3">
                {mcpServers.map((server) => (
                  <div
                    key={server.name}
                    className={cn(
                      "border rounded-lg p-3",
                      platform === 'win32'
                        ? "border-white/10"
                        : theme === 'dark'
                          ? "border-gray-700/50"
                          : "border-gray-200"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={cn(
                            "font-medium",
                            platform === 'win32'
                              ? "text-white/90"
                              : theme === 'dark' 
                                ? "text-white/90" 
                                : "text-gray-900"
                          )}>
                            {server.name}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            server.connected
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {server.connected ? 'Connected' : 'Disconnected'}
                          </span>
                        </div>
                        <p className={cn(
                          "text-sm mt-1",
                          platform === 'win32'
                            ? "text-white/70"
                            : theme === 'dark' 
                              ? "text-gray-300" 
                              : "text-gray-600"
                        )}>
                          {server.toolCount} tools available
                        </p>
                        <p className={cn(
                          "text-xs",
                          platform === 'win32'
                            ? "text-white/50"
                            : theme === 'dark' 
                              ? "text-gray-400" 
                              : "text-gray-500"
                        )}>
                          Last seen: {server.lastSeen.toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRestartServer(server.name)}
                        className={cn(
                          "px-3 py-1 text-sm rounded transition-colors",
                          platform === 'win32'
                            ? "bg-yellow-600/80 text-white hover:bg-yellow-600"
                            : theme === 'dark'
                              ? "bg-yellow-600 text-white hover:bg-yellow-500"
                              : "bg-yellow-500 text-white hover:bg-yellow-600"
                        )}
                      >
                        Restart
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* MCP Tools */}
            {mcpTools.length > 0 && (
              <div className="mt-6">
                <h4 className={cn(
                  "font-medium mb-3",
                  platform === 'win32'
                    ? "text-white/90"
                    : theme === 'dark' 
                      ? "text-white/90" 
                      : "text-gray-900"
                )}>Available MCP Tools</h4>
                <div className="grid gap-2">
                  {mcpTools.map((tool) => (
                    <div
                      key={`${tool.serverName}-${tool.name}`}
                      className={cn(
                        "border rounded p-2 text-sm",
                        platform === 'win32'
                          ? "border-white/10"
                          : theme === 'dark'
                            ? "border-gray-700/50"
                            : "border-gray-200"
                      )}
                    >
                      <div className={cn(
                        "font-medium",
                        platform === 'win32'
                          ? "text-white/90"
                          : theme === 'dark' 
                            ? "text-white/90" 
                            : "text-gray-900"
                      )}>{tool.name}</div>
                      <div className={cn(
                        platform === 'win32'
                          ? "text-white/70"
                          : theme === 'dark' 
                            ? "text-gray-300" 
                            : "text-gray-600"
                      )}>{tool.description}</div>
                      <div className={cn(
                        "text-xs mt-1",
                        platform === 'win32'
                          ? "text-white/50"
                          : theme === 'dark' 
                            ? "text-gray-400" 
                            : "text-gray-500"
                      )}>
                        Server: {tool.serverName}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ACP Tab */}
        {activeTab === 'acp' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className={cn(
                "font-medium",
                platform === 'win32'
                  ? "text-white/90"
                  : theme === 'dark' 
                    ? "text-white/90" 
                    : "text-gray-900"
              )}>ACP Agents</h4>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleEditConfig('acp')}
                  className={cn(
                    "px-3 py-1 text-sm rounded transition-colors flex items-center space-x-1",
                    platform === 'win32'
                      ? "bg-gray-600/80 text-white hover:bg-gray-600"
                      : theme === 'dark'
                        ? "bg-gray-700 text-white hover:bg-gray-600"
                        : "bg-gray-500 text-white hover:bg-gray-600"
                  )}
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit Config</span>
                </button>
                <button
                  onClick={refreshACPAgents}
                  className={cn(
                    "px-3 py-1 text-sm rounded transition-colors",
                    platform === 'win32'
                      ? "bg-blue-600/80 text-white hover:bg-blue-600"
                      : theme === 'dark'
                        ? "bg-blue-600 text-white hover:bg-blue-500"
                        : "bg-blue-500 text-white hover:bg-blue-600"
                  )}
                >
                  Refresh
                </button>
              </div>
            </div>

            {acpAgents.length === 0 ? (
              <div className={cn(
                "text-center py-8",
                platform === 'win32'
                  ? "text-white/60"
                  : theme === 'dark' 
                    ? "text-gray-400" 
                    : "text-gray-500"
              )}>
                No ACP agents configured.
              </div>
            ) : (
              <div className="space-y-3">
                {acpAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className={cn(
                      "border rounded-lg p-3",
                      platform === 'win32'
                        ? "border-white/10"
                        : theme === 'dark'
                          ? "border-gray-700/50"
                          : "border-gray-200"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={cn(
                            "font-medium",
                            platform === 'win32'
                              ? "text-white/90"
                              : theme === 'dark' 
                                ? "text-white/90" 
                                : "text-gray-900"
                          )}>
                            {agent.name}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            agent.status === 'online'
                              ? 'bg-green-100 text-green-800'
                              : agent.status === 'busy'
                              ? 'bg-yellow-100 text-yellow-800'
                              : agent.status === 'error'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {agent.status}
                          </span>
                        </div>
                        <p className={cn(
                          "text-sm mt-1",
                          platform === 'win32'
                            ? "text-white/70"
                            : theme === 'dark' 
                              ? "text-gray-300" 
                              : "text-gray-600"
                        )}>
                          {agent.description}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {agent.capabilities.map((capability) => (
                            <span
                              key={capability}
                              className={cn(
                                "px-2 py-1 text-xs rounded",
                                platform === 'win32'
                                  ? "bg-blue-500/20 text-blue-300"
                                  : theme === 'dark'
                                    ? "bg-blue-900/30 text-blue-300"
                                    : "bg-blue-50 text-blue-700"
                              )}
                            >
                              {capability}
                            </span>
                          ))}
                        </div>
                      </div>
                      {agent.status !== 'online' && (
                        <button
                          onClick={() => handleReconnectAgent(agent.id)}
                          className={cn(
                            "px-3 py-1 text-sm rounded transition-colors",
                            platform === 'win32'
                              ? "bg-green-600/80 text-white hover:bg-green-600"
                              : theme === 'dark'
                                ? "bg-green-600 text-white hover:bg-green-500"
                                : "bg-green-500 text-white hover:bg-green-600"
                          )}
                        >
                          Reconnect
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Configuration Editor */}
      <ConfigEditor
        title={configEditor.title}
        configType={configEditor.type}
        isOpen={configEditor.isOpen}
        onClose={handleCloseConfigEditor}
        onSave={handleSaveConfig}
        theme={theme}
        platform={platform}
      />
    </div>
  );
};