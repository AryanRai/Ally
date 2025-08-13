import React, { useState, useEffect } from 'react';
import { Settings, Wifi, WifiOff, Server, Key } from 'lucide-react';

interface RemoteSettingsProps {
  connected: boolean;
  status: string;
  token: string | null;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onUpdateServerUrl: (url: string) => void;
  className?: string;
}

export const RemoteSettings: React.FC<RemoteSettingsProps> = ({
  connected,
  status,
  token,
  error,
  onConnect,
  onDisconnect,
  onUpdateServerUrl,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState('http://YOUR_DROPLET_IP:3001');
  const [showToken, setShowToken] = useState(false);

  // Load saved server URL from localStorage
  useEffect(() => {
    const savedUrl = localStorage.getItem('ally-remote-server-url');
    if (savedUrl) {
      setServerUrl(savedUrl);
      onUpdateServerUrl(savedUrl);
    }
  }, [onUpdateServerUrl]);

  const handleSaveUrl = () => {
    localStorage.setItem('ally-remote-server-url', serverUrl);
    onUpdateServerUrl(serverUrl);
  };

  const handleConnect = () => {
    handleSaveUrl();
    onConnect();
  };

  const getStatusColor = () => {
    if (connected) return 'text-green-400';
    if (error) return 'text-red-400';
    return 'text-yellow-400';
  };

  const getStatusIcon = () => {
    if (connected) return <Wifi className="w-4 h-4" />;
    return <WifiOff className="w-4 h-4" />;
  };

  return (
    <div className={`relative ${className}`}>
      {/* Status indicator button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg
          bg-gray-800/50 backdrop-blur-sm border border-gray-600/30
          hover:bg-gray-700/50 transition-all duration-200
          ${getStatusColor()}
        `}
        title={`Remote Status: ${status}`}
      >
        {getStatusIcon()}
        <Settings className="w-4 h-4" />
        <span className="text-xs font-mono">{connected ? 'REMOTE' : 'LOCAL'}</span>
      </button>

      {/* Settings panel */}
      {isOpen && (
        <div className="
          absolute top-full right-0 mt-2 w-80 p-4
          bg-gray-900/95 backdrop-blur-lg border border-gray-600/30
          rounded-xl shadow-2xl z-50
        ">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 pb-2 border-b border-gray-600/30">
              <Server className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-gray-100">Remote Control</h3>
            </div>

            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Status:</span>
              <div className={`flex items-center gap-2 ${getStatusColor()}`}>
                {getStatusIcon()}
                <span className="text-xs font-mono">{status}</span>
              </div>
            </div>

            {/* Error display */}
            {error && (
              <div className="p-2 bg-red-900/30 border border-red-600/30 rounded-lg">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Server URL input */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400">Server URL:</label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://your-droplet-ip:3001"
                className="
                  w-full px-3 py-2 text-xs font-mono
                  bg-gray-800/50 border border-gray-600/30 rounded-lg
                  text-gray-100 placeholder-gray-500
                  focus:outline-none focus:border-blue-400/50
                "
              />
            </div>

            {/* Token display */}
            {token && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">Token:</label>
                  <button
                    onClick={() => setShowToken(!showToken)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {showToken ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Key className="w-3 h-3 text-gray-400" />
                  <code className="text-xs font-mono text-gray-300 bg-gray-800/50 px-2 py-1 rounded">
                    {showToken ? token : '••••••••••••••••'}
                  </code>
                </div>
              </div>
            )}

            {/* Connection controls */}
            <div className="flex gap-2 pt-2">
              {connected ? (
                <button
                  onClick={onDisconnect}
                  className="
                    flex-1 px-3 py-2 text-xs font-medium
                    bg-red-600/20 border border-red-600/30 rounded-lg
                    text-red-400 hover:bg-red-600/30
                    transition-colors duration-200
                  "
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  className="
                    flex-1 px-3 py-2 text-xs font-medium
                    bg-blue-600/20 border border-blue-600/30 rounded-lg
                    text-blue-400 hover:bg-blue-600/30
                    transition-colors duration-200
                  "
                >
                  Connect
                </button>
              )}
              <button
                onClick={handleSaveUrl}
                className="
                  px-3 py-2 text-xs font-medium
                  bg-gray-600/20 border border-gray-600/30 rounded-lg
                  text-gray-400 hover:bg-gray-600/30
                  transition-colors duration-200
                "
              >
                Save
              </button>
            </div>

            {/* Instructions */}
            <div className="pt-2 border-t border-gray-600/30">
              <p className="text-xs text-gray-500 leading-relaxed">
                Connect to your Digital Ocean server to enable remote control via web dashboard.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};