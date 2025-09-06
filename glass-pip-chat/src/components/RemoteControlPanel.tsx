/**
 * Remote Control Panel Component
 * 
 * Provides UI controls for managing the remote message polling service
 * Shows connection status, metrics, and allows starting/stopping the service
 */

import React, { useState, useEffect } from 'react';
import { remoteServiceManager, RemoteServiceStatus } from '../services/remoteServiceManager';

interface RemoteControlPanelProps {
  className?: string;
}

export const RemoteControlPanel: React.FC<RemoteControlPanelProps> = ({ className = '' }) => {
  const [status, setStatus] = useState<RemoteServiceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthCheck, setHealthCheck] = useState<{ healthy: boolean; issues: string[] } | null>(null);

  // Update status every 5 seconds
  useEffect(() => {
    const updateStatus = () => {
      try {
        const currentStatus = remoteServiceManager.getStatus();
        setStatus(currentStatus);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get status');
      }
    };

    updateStatus();
    const interval = setInterval(updateStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await remoteServiceManager.start();
      setStatus(remoteServiceManager.getStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start service');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await remoteServiceManager.stop();
      setStatus(remoteServiceManager.getStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop service');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestart = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await remoteServiceManager.restart();
      setStatus(remoteServiceManager.getStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart service');
    } finally {
      setIsLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    setIsLoading(true);
    
    try {
      const health = await remoteServiceManager.healthCheck();
      setHealthCheck(health);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setIsLoading(false);
    }
  };

  const formatUptime = (uptime: number): string => {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getStatusColor = (isRunning: boolean, isPolling: boolean): string => {
    if (isRunning && isPolling) return 'text-green-400';
    if (isRunning && !isPolling) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getStatusText = (isRunning: boolean, isPolling: boolean): string => {
    if (isRunning && isPolling) return 'Online';
    if (isRunning && !isPolling) return 'Starting';
    return 'Offline';
  };

  return (
    <div className={`bg-black/20 backdrop-blur-md rounded-lg border border-white/10 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Remote Control</h3>
        <div className="flex items-center space-x-2">
          {status && (
            <div className={`flex items-center space-x-2 ${getStatusColor(status.isRunning, status.pollerStatus.isPolling)}`}>
              <div className="w-2 h-2 rounded-full bg-current animate-pulse"></div>
              <span className="text-sm font-medium">
                {getStatusText(status.isRunning, status.pollerStatus.isPolling)}
              </span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {status && (
        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">System ID:</span>
              <p className="text-white font-mono text-xs">{status.pollerStatus.systemId}</p>
            </div>
            <div>
              <span className="text-gray-400">Uptime:</span>
              <p className="text-white">
                {status.startTime ? formatUptime(Date.now() - status.startTime.getTime()) : 'N/A'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Ollama:</span>
              <p className={status.processorStatus.ollamaConnected ? 'text-green-400' : 'text-red-400'}>
                {status.processorStatus.ollamaConnected ? 'Connected' : 'Disconnected'}
              </p>
            </div>
            <div>
              <span className="text-gray-400">Tools:</span>
              <p className={status.processorStatus.toolCallingEnabled ? 'text-green-400' : 'text-yellow-400'}>
                {status.processorStatus.toolCallingEnabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>

          {status.pollerStatus.retryCount > 0 && (
            <div className="p-2 bg-yellow-500/20 border border-yellow-500/30 rounded">
              <p className="text-yellow-300 text-sm">
                Retry attempts: {status.pollerStatus.retryCount}
              </p>
            </div>
          )}

          {status.lastError && (
            <div className="p-2 bg-red-500/20 border border-red-500/30 rounded">
              <p className="text-red-300 text-sm">Last error: {status.lastError}</p>
            </div>
          )}
        </div>
      )}

      <div className="flex space-x-2 mb-4">
        {!status?.isRunning ? (
          <button
            onClick={handleStart}
            disabled={isLoading}
            className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isLoading ? 'Starting...' : 'Start Service'}
          </button>
        ) : (
          <>
            <button
              onClick={handleStop}
              disabled={isLoading}
              className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isLoading ? 'Stopping...' : 'Stop'}
            </button>
            <button
              onClick={handleRestart}
              disabled={isLoading}
              className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isLoading ? 'Restarting...' : 'Restart'}
            </button>
          </>
        )}
      </div>

      <div className="flex space-x-2">
        <button
          onClick={handleHealthCheck}
          disabled={isLoading}
          className="flex-1 px-3 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-600/50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? 'Checking...' : 'Health Check'}
        </button>
      </div>

      {healthCheck && (
        <div className="mt-4 p-3 bg-black/30 rounded-lg">
          <div className="flex items-center space-x-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${healthCheck.healthy ? 'bg-green-400' : 'bg-red-400'}`}></div>
            <span className={`text-sm font-medium ${healthCheck.healthy ? 'text-green-400' : 'text-red-400'}`}>
              {healthCheck.healthy ? 'Healthy' : 'Issues Detected'}
            </span>
          </div>
          {healthCheck.issues.length > 0 && (
            <ul className="text-sm text-gray-300 space-y-1">
              {healthCheck.issues.map((issue, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <span className="text-red-400 mt-0.5">•</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};