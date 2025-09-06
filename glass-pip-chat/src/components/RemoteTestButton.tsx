/**
 * Remote Test Button Component
 * 
 * A simple test button to verify remote integration is working
 * This is for development/testing purposes
 */

import React, { useState } from 'react';
import { Play, Square, Wifi } from 'lucide-react';
import { useRemoteConnection } from '../hooks/useRemoteConnection';
import { remoteServiceManager } from '../services/remoteServiceManager';

interface RemoteTestButtonProps {
  className?: string;
}

export const RemoteTestButton: React.FC<RemoteTestButtonProps> = ({ className = '' }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  
  const { mode, isAuthenticated, isConnected } = useRemoteConnection();

  const runTest = async () => {
    if (mode !== 'remote' || !isAuthenticated) {
      setTestResult('❌ Must be in remote mode and authenticated');
      return;
    }

    setIsRunning(true);
    setTestResult('🔄 Running remote service test...');

    try {
      // Test service manager
      const status = remoteServiceManager.getStatus();
      console.log('Service status:', status);

      // Test health check
      const health = await remoteServiceManager.healthCheck();
      console.log('Health check:', health);

      if (health.healthy) {
        setTestResult('✅ Remote service is healthy and running');
      } else {
        setTestResult(`⚠️ Service issues: ${health.issues.join(', ')}`);
      }
    } catch (error) {
      console.error('Test failed:', error);
      setTestResult(`❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Only show in remote mode
  if (mode !== 'remote') return null;

  return (
    <div className={`space-y-2 ${className}`}>
      <button
        onClick={runTest}
        disabled={isRunning || !isAuthenticated}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
          transition-colors duration-200
          ${isAuthenticated 
            ? 'bg-blue-600/20 border border-blue-600/30 text-blue-400 hover:bg-blue-600/30' 
            : 'bg-gray-600/20 border border-gray-600/30 text-gray-500 cursor-not-allowed'
          }
        `}
      >
        {isRunning ? (
          <Square className="w-3 h-3 animate-pulse" />
        ) : (
          <Play className="w-3 h-3" />
        )}
        Test Remote Service
      </button>

      {testResult && (
        <div className="p-2 bg-gray-800/50 rounded-lg">
          <p className="text-xs text-gray-300">{testResult}</p>
        </div>
      )}

      {/* Status indicators */}
      <div className="flex items-center gap-2 text-xs">
        <div className={`flex items-center gap-1 ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
          <Wifi className="w-3 h-3" />
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>
    </div>
  );
};