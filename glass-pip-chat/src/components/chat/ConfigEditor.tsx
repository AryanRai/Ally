import React, { useState, useEffect } from 'react';
import { Save, X, Edit3, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ConfigEditorProps {
  title: string;
  configType: 'mcp' | 'acp';
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: any) => Promise<void>;
  theme?: 'light' | 'dark';
  platform?: string;
}

export const ConfigEditor: React.FC<ConfigEditorProps> = ({
  title,
  configType,
  isOpen,
  onClose,
  onSave,
  theme = 'dark',
  platform = 'web'
}) => {
  const [configText, setConfigText] = useState('');
  const [originalConfig, setOriginalConfig] = useState('');
  const [isValid, setIsValid] = useState(true);
  const [validationError, setValidationError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Load configuration when editor opens
  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen, configType]);

  const loadConfig = async () => {
    try {
      let config = null;
      if (typeof window !== 'undefined' && window.pip) {
        if (configType === 'mcp') {
          config = await window.pip.mcp.readConfig();
        } else {
          config = await window.pip.acp.readConfig();
        }
      }

      const defaultConfig = configType === 'mcp' 
        ? getDefaultMCPConfig() 
        : getDefaultACPConfig();

      const configToEdit = config || defaultConfig;
      const formattedConfig = JSON.stringify(configToEdit, null, 2);
      
      setConfigText(formattedConfig);
      setOriginalConfig(formattedConfig);
      setIsValid(true);
      setValidationError('');
      setSaveStatus('idle');
    } catch (error) {
      console.error('Failed to load config:', error);
      setValidationError('Failed to load configuration');
    }
  };

  const getDefaultMCPConfig = () => ({
    mcpServers: {
      filesystem: {
        command: "uvx",
        args: ["mcp-server-filesystem", "--path", "."],
        env: {
          FASTMCP_LOG_LEVEL: "ERROR"
        },
        disabled: false,
        autoApprove: ["read_file", "list_directory"]
      }
    }
  });

  const getDefaultACPConfig = () => ({
    agents: {
      "demo-assistant": {
        id: "demo-assistant",
        name: "Demo Assistant",
        description: "Demo ACP agent for testing",
        endpoint: "http://localhost:8001/api/agents/demo",
        capabilities: ["demo", "testing"],
        autoConnect: false,
        timeout: 30000
      }
    },
    defaultTimeout: 30000,
    maxConcurrentQueries: 3,
    enableHeartbeat: true,
    heartbeatInterval: 60000
  });

  const validateConfig = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      
      if (configType === 'mcp') {
        if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
          throw new Error('Configuration must have "mcpServers" object');
        }
      } else {
        if (!parsed.agents || typeof parsed.agents !== 'object') {
          throw new Error('Configuration must have "agents" object');
        }
      }
      
      setIsValid(true);
      setValidationError('');
      return true;
    } catch (error) {
      setIsValid(false);
      setValidationError(error instanceof Error ? error.message : 'Invalid JSON');
      return false;
    }
  };

  const handleTextChange = (text: string) => {
    setConfigText(text);
    validateConfig(text);
    setSaveStatus('idle');
  };

  const handleSave = async () => {
    if (!isValid) return;

    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const config = JSON.parse(configText);
      await onSave(config);
      setOriginalConfig(configText);
      setSaveStatus('success');
      
      // Auto-close after successful save
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Failed to save config:', error);
      setSaveStatus('error');
      setValidationError(error instanceof Error ? error.message : 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setConfigText(originalConfig);
    setIsValid(true);
    setValidationError('');
    setSaveStatus('idle');
    onClose();
  };

  const hasChanges = configText !== originalConfig;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={cn(
        "w-full max-w-4xl max-h-[90vh] rounded-lg shadow-xl flex flex-col",
        platform === 'win32'
          ? "bg-black/90 border border-white/20"
          : theme === 'dark'
            ? "bg-gray-900 border border-gray-700"
            : "bg-white border border-gray-200"
      )}>
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between p-4 border-b",
          platform === 'win32'
            ? "border-white/20"
            : theme === 'dark'
              ? "border-gray-700"
              : "border-gray-200"
        )}>
          <div className="flex items-center space-x-3">
            <FileText className={cn(
              "w-5 h-5",
              platform === 'win32'
                ? "text-white/80"
                : theme === 'dark'
                  ? "text-gray-300"
                  : "text-gray-600"
            )} />
            <h2 className={cn(
              "text-lg font-semibold",
              platform === 'win32'
                ? "text-white/90"
                : theme === 'dark'
                  ? "text-white"
                  : "text-gray-900"
            )}>
              Edit {title} Configuration
            </h2>
          </div>
          
          <div className="flex items-center space-x-2">
            {saveStatus === 'success' && (
              <div className="flex items-center space-x-1 text-green-400">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">Saved!</span>
              </div>
            )}
            
            <button
              onClick={handleCancel}
              className={cn(
                "p-2 rounded-md transition-colors",
                platform === 'win32'
                  ? "hover:bg-white/10 text-white/70"
                  : theme === 'dark'
                    ? "hover:bg-gray-800 text-gray-400"
                    : "hover:bg-gray-100 text-gray-600"
              )}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Validation Status */}
          {validationError && (
            <div className={cn(
              "mx-4 mt-4 p-3 rounded-md border flex items-start space-x-2",
              saveStatus === 'error'
                ? platform === 'win32'
                  ? "bg-red-500/10 border-red-500/20 text-red-300"
                  : theme === 'dark'
                    ? "bg-red-900/20 border-red-800/30 text-red-300"
                    : "bg-red-50 border-red-200 text-red-800"
                : platform === 'win32'
                  ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-300"
                  : theme === 'dark'
                    ? "bg-yellow-900/20 border-yellow-800/30 text-yellow-300"
                    : "bg-yellow-50 border-yellow-200 text-yellow-800"
            )}>
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="text-sm">{validationError}</div>
            </div>
          )}

          {/* Editor */}
          <div className="flex-1 p-4">
            <textarea
              value={configText}
              onChange={(e) => handleTextChange(e.target.value)}
              className={cn(
                "w-full h-full resize-none rounded-md border font-mono text-sm p-3 focus:outline-none focus:ring-2 focus:ring-blue-500",
                platform === 'win32'
                  ? "bg-black/30 border-white/20 text-white/90 placeholder-white/50"
                  : theme === 'dark'
                    ? "bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-400"
                    : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
              )}
              placeholder="Enter JSON configuration..."
              spellCheck={false}
            />
          </div>
        </div>

        {/* Footer */}
        <div className={cn(
          "flex items-center justify-between p-4 border-t",
          platform === 'win32'
            ? "border-white/20"
            : theme === 'dark'
              ? "border-gray-700"
              : "border-gray-200"
        )}>
          <div className="flex items-center space-x-4">
            <div className={cn(
              "text-sm",
              platform === 'win32'
                ? "text-white/60"
                : theme === 'dark'
                  ? "text-gray-400"
                  : "text-gray-600"
            )}>
              File: <code className="font-mono">.ally/settings/{configType}.json</code>
            </div>
            
            {hasChanges && (
              <div className={cn(
                "text-sm",
                platform === 'win32'
                  ? "text-yellow-300"
                  : theme === 'dark'
                    ? "text-yellow-400"
                    : "text-yellow-600"
              )}>
                • Unsaved changes
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleCancel}
              className={cn(
                "px-4 py-2 text-sm rounded-md transition-colors",
                platform === 'win32'
                  ? "border border-white/20 text-white/70 hover:bg-white/10"
                  : theme === 'dark'
                    ? "border border-gray-600 text-gray-300 hover:bg-gray-800"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              Cancel
            </button>
            
            <button
              onClick={handleSave}
              disabled={!isValid || !hasChanges || isSaving}
              className={cn(
                "px-4 py-2 text-sm rounded-md transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed",
                platform === 'win32'
                  ? "bg-blue-600/80 text-white hover:bg-blue-600 disabled:hover:bg-blue-600/80"
                  : theme === 'dark'
                    ? "bg-blue-600 text-white hover:bg-blue-500 disabled:hover:bg-blue-600"
                    : "bg-blue-500 text-white hover:bg-blue-600 disabled:hover:bg-blue-500"
              )}
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};