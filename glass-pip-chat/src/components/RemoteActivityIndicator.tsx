/**
 * Remote Activity Indicator Component
 * 
 * Shows when remote messages are being processed and provides status updates
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Activity, Clock, Globe } from 'lucide-react';
import { useRemoteConnection } from '../hooks/useRemoteConnection';

interface RemoteActivityIndicatorProps {
  className?: string;
}

export const RemoteActivityIndicator: React.FC<RemoteActivityIndicatorProps> = ({ 
  className = '' 
}) => {
  const {
    mode,
    isConnected,
    isAuthenticated,
    serviceStatus,
    connectionError
  } = useRemoteConnection();

  // Don't show anything in local mode
  if (mode === 'local') return null;

  const isActive = isConnected && serviceStatus?.pollerStatus.isPolling;
  const hasActiveStreams = serviceStatus?.processorStatus.activeStreams.length > 0;

  return (
    <AnimatePresence>
      {mode === 'remote' && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg
            bg-gray-800/50 backdrop-blur-sm border border-gray-600/30
            ${className}
          `}
        >
          {/* Connection Status Icon */}
          <div className="flex items-center gap-1">
            {isConnected ? (
              <Wifi className="w-3 h-3 text-green-400" />
            ) : (
              <WifiOff className="w-3 h-3 text-red-400" />
            )}
            <Globe className="w-3 h-3 text-blue-400" />
          </div>

          {/* Status Text */}
          <div className="flex flex-col">
            <span className="text-xs font-medium text-gray-200">
              {!isAuthenticated ? 'Not Authenticated' :
               !isConnected ? 'Disconnected' :
               hasActiveStreams ? 'Processing Remote' :
               isActive ? 'Remote Ready' : 'Connecting...'}
            </span>
            
            {/* Additional status info */}
            {serviceStatus && isConnected && (
              <span className="text-xs text-gray-400">
                System: {serviceStatus.pollerStatus.systemId.split('-').pop()}
              </span>
            )}
          </div>

          {/* Activity Indicator */}
          {hasActiveStreams && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Activity className="w-3 h-3 text-yellow-400" />
            </motion.div>
          )}

          {/* Error Indicator */}
          {connectionError && (
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          )}

          {/* Uptime */}
          {serviceStatus?.startTime && isConnected && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              <span>
                {Math.floor((Date.now() - serviceStatus.startTime.getTime()) / 60000)}m
              </span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};