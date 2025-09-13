/**
 * Remote Processing Indicator Component
 * 
 * Shows real-time status of remote message processing
 * Displays progress, tool executions, and streaming responses
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { ProcessingUpdate, RemoteSyncStatus } from '../services/remoteChatSyncService';

interface RemoteProcessingIndicatorProps {
  processingUpdates: ProcessingUpdate[];
  syncStatus: RemoteSyncStatus | null;
  className?: string;
  compact?: boolean;
}

interface ProcessingItemProps {
  update: ProcessingUpdate;
  compact?: boolean;
}

const ProcessingItem: React.FC<ProcessingItemProps> = ({ update, compact = false }) => {
  const getStatusIcon = (status: ProcessingUpdate['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'processing': return '🤔';
      case 'streaming': return '📝';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '⚪';
    }
  };

  const getStatusColor = (status: ProcessingUpdate['status']) => {
    switch (status) {
      case 'pending': return 'text-yellow-500';
      case 'processing': return 'text-blue-500';
      case 'streaming': return 'text-green-500';
      case 'completed': return 'text-green-600';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusText = (status: ProcessingUpdate['status']) => {
    switch (status) {
      case 'pending': return 'Queued for processing';
      case 'processing': return 'Processing on local system';
      case 'streaming': return 'Streaming response';
      case 'completed': return 'Processing complete';
      case 'error': return 'Processing failed';
      default: return 'Unknown status';
    }
  };

  const getBgColor = (status: ProcessingUpdate['status']) => {
    switch (status) {
      case 'pending': return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'processing': return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      case 'streaming': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'completed': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'error': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      default: return 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800';
    }
  };

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className={cn(
          'flex items-center gap-2 px-2 py-1 rounded-md border text-xs',
          getBgColor(update.status)
        )}
      >
        <span className="animate-pulse">{getStatusIcon(update.status)}</span>
        <span className={cn('font-medium', getStatusColor(update.status))}>
          {getStatusText(update.status)}
        </span>
        {update.progress !== undefined && update.progress > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-8 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-current rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${update.progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className="text-xs text-gray-500">{Math.round(update.progress)}%</span>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        'p-3 rounded-lg border',
        getBgColor(update.status)
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg animate-pulse">{getStatusIcon(update.status)}</span>
          <div>
            <div className={cn('font-medium text-sm', getStatusColor(update.status))}>
              {getStatusText(update.status)}
            </div>
            <div className="text-xs text-gray-500">
              Message ID: {update.messageId.substring(0, 8)}...
            </div>
          </div>
        </div>
        
        {update.progress !== undefined && update.progress > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className={cn('h-full rounded-full', getStatusColor(update.status).replace('text-', 'bg-'))}
                initial={{ width: 0 }}
                animate={{ width: `${update.progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className="text-xs text-gray-500 font-mono">
              {Math.round(update.progress)}%
            </span>
          </div>
        )}
      </div>

      {/* Current response preview */}
      {update.currentResponse && update.status === 'streaming' && (
        <div className="mt-2 p-2 bg-white/50 dark:bg-black/20 rounded border">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
            Current Response ({update.currentResponse.length} chars):
          </div>
          <div className="text-sm text-gray-800 dark:text-gray-200 font-mono max-h-20 overflow-y-auto">
            {update.currentResponse.substring(0, 200)}
            {update.currentResponse.length > 200 && '...'}
          </div>
        </div>
      )}

      {/* Tool executions */}
      {update.toolExecutions && update.toolExecutions.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
            Tool Executions:
          </div>
          <div className="space-y-1">
            {update.toolExecutions.map((tool, index) => (
              <div key={index} className="flex items-center gap-2 text-xs">
                <span>
                  {tool.status === 'started' && '🔧'}
                  {tool.status === 'running' && '⚙️'}
                  {tool.status === 'completed' && '✅'}
                  {tool.status === 'failed' && '❌'}
                </span>
                <span className="font-mono">{tool.toolName}</span>
                {tool.executionTime && (
                  <span className="text-gray-500">({tool.executionTime}ms)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 mt-2">
        {new Date(update.timestamp).toLocaleTimeString()}
      </div>
    </motion.div>
  );
};

const SyncStatusIndicator: React.FC<{ status: RemoteSyncStatus }> = ({ status }) => {
  const getStatusIcon = (type: RemoteSyncStatus['type']) => {
    switch (type) {
      case 'connected': return '🟢';
      case 'disconnected': return '⚪';
      case 'syncing': return '🔄';
      case 'error': return '🔴';
      default: return '⚪';
    }
  };

  const getStatusColor = (type: RemoteSyncStatus['type']) => {
    switch (type) {
      case 'connected': return 'text-green-600';
      case 'disconnected': return 'text-gray-500';
      case 'syncing': return 'text-blue-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-2 text-sm"
    >
      <span className={status.type === 'syncing' ? 'animate-spin' : ''}>
        {getStatusIcon(status.type)}
      </span>
      <span className={cn('font-medium', getStatusColor(status.type))}>
        {status.message}
      </span>
      <span className="text-xs text-gray-500">
        {new Date(status.timestamp).toLocaleTimeString()}
      </span>
    </motion.div>
  );
};

export const RemoteProcessingIndicator: React.FC<RemoteProcessingIndicatorProps> = ({
  processingUpdates,
  syncStatus,
  className,
  compact = false
}) => {
  const hasActiveProcessing = processingUpdates.some(update => 
    update.status === 'pending' || update.status === 'processing' || update.status === 'streaming'
  );

  if (!syncStatus && processingUpdates.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Sync Status */}
      {syncStatus && (
        <SyncStatusIndicator status={syncStatus} />
      )}

      {/* Processing Updates */}
      <AnimatePresence mode="popLayout">
        {processingUpdates.map((update) => (
          <ProcessingItem
            key={update.messageId}
            update={update}
            compact={compact}
          />
        ))}
      </AnimatePresence>

      {/* Summary when compact and multiple items */}
      {compact && processingUpdates.length > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-gray-500 text-center"
        >
          {processingUpdates.length} messages being processed
          {hasActiveProcessing && ' • Real-time sync active'}
        </motion.div>
      )}
    </div>
  );
};

export default RemoteProcessingIndicator;