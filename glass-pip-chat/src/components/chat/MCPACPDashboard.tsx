import React, { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, ChevronDown, ChevronUp, Settings, Wrench } from 'lucide-react';
import { useMCPACPIntegration } from '../../hooks/useMCPACPIntegration';
import { ConfigEditor } from './ConfigEditor';
import { cn } from '../../lib/utils';

interface MCPACPDashboardProps {
  className?: string;
  theme?: 'light' | 'dark';
  platform?: string;
  onToolCountChange?: (count: number) => void;
}

interface NewServerForm {
  name: string;
  command: string;
  args: string;
}

export const MCPACPDashboard: React.FC<MCPACPDashboardProps> = ({ 
  className = '', 
  theme = 'dark', 
  platform = 'web',
  onToolCountChange
}) => {
  const {
    mcpServers,
    mcpTools,
    isInitializing,
    lastError,
    refreshMCPServers,
    restartMCPServer,
    getUnifiedToolList
  } = useMCPACPIntegration();

  const [showAddServer, setShowAddServer] = useState(false);
  const [newServer, setNewServer] = useState<NewServerForm>({ name: '', command: 'uvx', args: '' });
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [configEditor, setConfigEditor] = useState<{
    isOpen: boolean;
    type: 'mcp' | 'acp';
    title: string;
  }>({
    isOpen: false,
    type: 'mcp',
    title: ''
  });

  // Notify parent of tool count changes
  useEffect(() => {
    const tools = getUnifiedToolList();
    onToolCountChange?.(tools.length);
  }, [mcpTools, onToolCountChange, getUnifiedToolList]);

  const handleAddServer = async () => {
    if (!newServer.name || !newServer.command) return;

    try {
      // Read current config
      let config = await window.pip?.mcp?.readConfig() || { mcpServers: {} };
      
      // Add new server
      config.mcpServers[newServer.name] = {
        command: newServer.command,
        args: newServer.args.split(' ').filter(a => a.trim()),
        env: { FASTMCP_LOG_LEVEL: "ERROR" },
        disabled: false,
        autoApprove: []
      };

      // Save config
      await window.pip?.mcp?.writeConfig(config);
      
      // Reset form and refresh
      setNewServer({ name: '', command: 'uvx', args: '' });
      setShowAddServer(false);
      
      // Reload to apply changes
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('Failed to add server:', error);
    }
  };

  const handleRemoveServer = async (serverName: string) => {
    if (!confirm(`Remove MCP server "${serverName}"?`)) return;

    try {
      let config = await window.pip?.mcp?.readConfig() || { mcpServers: {} };
      delete config.mcpServers[serverName];
      await window.pip?.mcp?.writeConfig(config);
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('Failed to remove server:', error);
    }
  };

  const toggleServerExpanded = (serverName: string) => {
    setExpandedServers(prev => {
      const next = new Set(prev);
      if (next.has(serverName)) {
        next.delete(serverName);
      } else {
        next.add(serverName);
      }
      return next;
    });
  };

  const handleEditConfig = () => {
    setConfigEditor({
      isOpen: true,
      type: 'mcp',
      title: 'MCP'
    });
  };

  const handleSaveConfig = async (config: any) => {
    try {
      if (window.pip?.mcp) {
        await window.pip.mcp.writeConfig(config);
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  };

  const unifiedTools = getUnifiedToolList();
  const connectedServers = mcpServers.filter(s => s.connected).length;

  if (isInitializing) {
    return (
      <div className={cn("p-4", className)}>
        <div className="flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
          <span className={cn(
            "text-sm",
            platform === 'win32' ? "text-white/70" : theme === 'dark' ? "text-gray-400" : "text-gray-600"
          )}>
            Loading MCP tools...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs",
            connectedServers > 0
              ? "bg-green-500/20 text-green-400"
              : "bg-gray-500/20 text-gray-400"
          )}>
            <div className={cn(
              "w-2 h-2 rounded-full",
              connectedServers > 0 ? "bg-green-400 animate-pulse" : "bg-gray-400"
            )} />
            {connectedServers} server{connectedServers !== 1 ? 's' : ''} connected
          </div>
          <div className={cn(
            "text-xs",
            platform === 'win32' ? "text-white/60" : theme === 'dark' ? "text-gray-400" : "text-gray-500"
          )}>
            {unifiedTools.length} tool{unifiedTools.length !== 1 ? 's' : ''} available
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={refreshMCPServers}
            className={cn(
              "p-1.5 rounded transition-colors",
              platform === 'win32'
                ? "hover:bg-white/10 text-white/70"
                : theme === 'dark'
                  ? "hover:bg-gray-700 text-gray-400"
                  : "hover:bg-gray-200 text-gray-600"
            )}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleEditConfig}
            className={cn(
              "p-1.5 rounded transition-colors",
              platform === 'win32'
                ? "hover:bg-white/10 text-white/70"
                : theme === 'dark'
                  ? "hover:bg-gray-700 text-gray-400"
                  : "hover:bg-gray-200 text-gray-600"
            )}
            title="Edit Config"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error Display */}
      {lastError && (
        <div className={cn(
          "p-3 rounded-lg text-sm",
          platform === 'win32'
            ? "bg-red-500/10 border border-red-500/20 text-red-300"
            : theme === 'dark'
              ? "bg-red-900/20 border border-red-800/30 text-red-300"
              : "bg-red-50 border border-red-200 text-red-700"
        )}>
          {lastError}
        </div>
      )}

      {/* MCP Servers List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className={cn(
            "text-sm font-medium",
            platform === 'win32' ? "text-white/80" : theme === 'dark' ? "text-white/80" : "text-gray-700"
          )}>
            MCP Servers
          </h4>
          <button
            onClick={() => setShowAddServer(!showAddServer)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors",
              platform === 'win32'
                ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                : theme === 'dark'
                  ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                  : "bg-blue-100 text-blue-600 hover:bg-blue-200"
            )}
          >
            <Plus className="w-3 h-3" />
            Add Server
          </button>
        </div>

        {/* Add Server Form */}
        {showAddServer && (
          <div className={cn(
            "p-3 rounded-lg border space-y-3",
            platform === 'win32'
              ? "bg-white/5 border-white/10"
              : theme === 'dark'
                ? "bg-gray-800/50 border-gray-700"
                : "bg-gray-50 border-gray-200"
          )}>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={cn(
                  "text-xs block mb-1",
                  platform === 'win32' ? "text-white/60" : theme === 'dark' ? "text-gray-400" : "text-gray-600"
                )}>Server Name</label>
                <input
                  type="text"
                  value={newServer.name}
                  onChange={(e) => setNewServer(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="my-server"
                  className={cn(
                    "w-full px-2 py-1.5 text-xs rounded border",
                    platform === 'win32'
                      ? "bg-black/30 border-white/20 text-white placeholder-white/40"
                      : theme === 'dark'
                        ? "bg-gray-900 border-gray-600 text-white placeholder-gray-500"
                        : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"
                  )}
                />
              </div>
              <div>
                <label className={cn(
                  "text-xs block mb-1",
                  platform === 'win32' ? "text-white/60" : theme === 'dark' ? "text-gray-400" : "text-gray-600"
                )}>Command</label>
                <input
                  type="text"
                  value={newServer.command}
                  onChange={(e) => setNewServer(prev => ({ ...prev, command: e.target.value }))}
                  placeholder="uvx"
                  className={cn(
                    "w-full px-2 py-1.5 text-xs rounded border",
                    platform === 'win32'
                      ? "bg-black/30 border-white/20 text-white placeholder-white/40"
                      : theme === 'dark'
                        ? "bg-gray-900 border-gray-600 text-white placeholder-gray-500"
                        : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"
                  )}
                />
              </div>
              <div>
                <label className={cn(
                  "text-xs block mb-1",
                  platform === 'win32' ? "text-white/60" : theme === 'dark' ? "text-gray-400" : "text-gray-600"
                )}>Arguments</label>
                <input
                  type="text"
                  value={newServer.args}
                  onChange={(e) => setNewServer(prev => ({ ...prev, args: e.target.value }))}
                  placeholder="mcp-server-name --option"
                  className={cn(
                    "w-full px-2 py-1.5 text-xs rounded border",
                    platform === 'win32'
                      ? "bg-black/30 border-white/20 text-white placeholder-white/40"
                      : theme === 'dark'
                        ? "bg-gray-900 border-gray-600 text-white placeholder-gray-500"
                        : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"
                  )}
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-xs",
                platform === 'win32' ? "text-white/50" : theme === 'dark' ? "text-gray-500" : "text-gray-500"
              )}>
                Example: uvx mcp-server-filesystem --path .
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddServer(false)}
                  className={cn(
                    "px-3 py-1 text-xs rounded transition-colors",
                    platform === 'win32'
                      ? "text-white/60 hover:bg-white/10"
                      : theme === 'dark'
                        ? "text-gray-400 hover:bg-gray-700"
                        : "text-gray-600 hover:bg-gray-200"
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddServer}
                  disabled={!newServer.name || !newServer.command}
                  className={cn(
                    "px-3 py-1 text-xs rounded transition-colors disabled:opacity-50",
                    platform === 'win32'
                      ? "bg-blue-500/80 text-white hover:bg-blue-500"
                      : theme === 'dark'
                        ? "bg-blue-600 text-white hover:bg-blue-500"
                        : "bg-blue-500 text-white hover:bg-blue-600"
                  )}
                >
                  Add Server
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Server Cards */}
        {mcpServers.length === 0 ? (
          <div className={cn(
            "text-center py-6 text-sm",
            platform === 'win32' ? "text-white/50" : theme === 'dark' ? "text-gray-500" : "text-gray-500"
          )}>
            No MCP servers configured. Click "Add Server" to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {mcpServers.map((server) => (
              <div
                key={server.name}
                className={cn(
                  "rounded-lg border overflow-hidden",
                  platform === 'win32'
                    ? "border-white/10 bg-white/5"
                    : theme === 'dark'
                      ? "border-gray-700 bg-gray-800/30"
                      : "border-gray-200 bg-white"
                )}
              >
                {/* Server Header */}
                <div 
                  className={cn(
                    "flex items-center justify-between p-3 cursor-pointer",
                    platform === 'win32'
                      ? "hover:bg-white/5"
                      : theme === 'dark'
                        ? "hover:bg-gray-800/50"
                        : "hover:bg-gray-50"
                  )}
                  onClick={() => toggleServerExpanded(server.name)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      server.connected ? "bg-green-400" : "bg-red-400"
                    )} />
                    <div>
                      <div className={cn(
                        "text-sm font-medium",
                        platform === 'win32' ? "text-white/90" : theme === 'dark' ? "text-white" : "text-gray-900"
                      )}>
                        {server.name}
                      </div>
                      <div className={cn(
                        "text-xs",
                        platform === 'win32' ? "text-white/50" : theme === 'dark' ? "text-gray-500" : "text-gray-500"
                      )}>
                        {server.toolCount} tool{server.toolCount !== 1 ? 's' : ''} • {server.connected ? 'Connected' : 'Disconnected'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        restartMCPServer(server.name);
                      }}
                      className={cn(
                        "p-1.5 rounded transition-colors",
                        platform === 'win32'
                          ? "hover:bg-white/10 text-white/60"
                          : theme === 'dark'
                            ? "hover:bg-gray-700 text-gray-400"
                            : "hover:bg-gray-200 text-gray-500"
                      )}
                      title="Restart"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveServer(server.name);
                      }}
                      className={cn(
                        "p-1.5 rounded transition-colors",
                        platform === 'win32'
                          ? "hover:bg-red-500/20 text-red-400"
                          : theme === 'dark'
                            ? "hover:bg-red-900/30 text-red-400"
                            : "hover:bg-red-100 text-red-500"
                      )}
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {expandedServers.has(server.name) ? (
                      <ChevronUp className={cn(
                        "w-4 h-4",
                        platform === 'win32' ? "text-white/40" : theme === 'dark' ? "text-gray-500" : "text-gray-400"
                      )} />
                    ) : (
                      <ChevronDown className={cn(
                        "w-4 h-4",
                        platform === 'win32' ? "text-white/40" : theme === 'dark' ? "text-gray-500" : "text-gray-400"
                      )} />
                    )}
                  </div>
                </div>

                {/* Server Tools (Expanded) */}
                {expandedServers.has(server.name) && (
                  <div className={cn(
                    "border-t px-3 py-2",
                    platform === 'win32'
                      ? "border-white/10 bg-black/20"
                      : theme === 'dark'
                        ? "border-gray-700 bg-gray-900/30"
                        : "border-gray-100 bg-gray-50"
                  )}>
                    {mcpTools.filter(t => t.serverName === server.name).length === 0 ? (
                      <p className={cn(
                        "text-xs py-2",
                        platform === 'win32' ? "text-white/40" : theme === 'dark' ? "text-gray-500" : "text-gray-500"
                      )}>
                        No tools available from this server
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {mcpTools.filter(t => t.serverName === server.name).map((tool) => (
                          <div
                            key={`${server.name}-${tool.name}`}
                            className={cn(
                              "flex items-start gap-2 py-1.5",
                              platform === 'win32' ? "text-white/70" : theme === 'dark' ? "text-gray-300" : "text-gray-700"
                            )}
                          >
                            <Wrench className={cn(
                              "w-3.5 h-3.5 mt-0.5 flex-shrink-0",
                              platform === 'win32' ? "text-blue-400" : theme === 'dark' ? "text-blue-400" : "text-blue-500"
                            )} />
                            <div>
                              <div className="text-xs font-medium">{tool.name}</div>
                              <div className={cn(
                                "text-xs",
                                platform === 'win32' ? "text-white/50" : theme === 'dark' ? "text-gray-500" : "text-gray-500"
                              )}>
                                {tool.description}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Reference */}
      <div className={cn(
        "p-3 rounded-lg text-xs",
        platform === 'win32'
          ? "bg-blue-500/10 border border-blue-500/20"
          : theme === 'dark'
            ? "bg-blue-900/20 border border-blue-800/30"
            : "bg-blue-50 border border-blue-200"
      )}>
        <div className={cn(
          "font-medium mb-1",
          platform === 'win32' ? "text-blue-300" : theme === 'dark' ? "text-blue-400" : "text-blue-700"
        )}>
          Popular MCP Servers
        </div>
        <div className={cn(
          "space-y-1",
          platform === 'win32' ? "text-white/60" : theme === 'dark' ? "text-gray-400" : "text-gray-600"
        )}>
          <div>• <code>mcp-server-filesystem</code> - File system access</div>
          <div>• <code>mcp-server-fetch</code> - HTTP requests</div>
          <div>• <code>mcp-server-sqlite</code> - SQLite database</div>
          <div>• <code>mcp-server-github</code> - GitHub integration</div>
        </div>
      </div>

      {/* Configuration Editor */}
      <ConfigEditor
        title={configEditor.title}
        configType={configEditor.type}
        isOpen={configEditor.isOpen}
        onClose={() => setConfigEditor(prev => ({ ...prev, isOpen: false }))}
        onSave={handleSaveConfig}
        theme={theme}
        platform={platform}
      />
    </div>
  );
};
