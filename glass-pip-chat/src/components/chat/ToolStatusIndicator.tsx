/**
 * Tool Status Indicator Component
 * Requirements: 9.2, 9.3
 * 
 * Displays tool execution status indicators in the header
 * Shows real-time tool activity and availability
 * Provides quick access to tool execution information
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wrench, 
  CheckCircle, 
  XCircle, 
  Loader2,
  AlertTriangle,
  Activity,
  Zap,
  Clock
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';

export interface ToolStatusInfo {
  isExecuting: boolean;
  activeToolCount: number;
  completedToolCount: number;
  failedToolCount: number;
  totalExecutionTime: number;
  lastExecutionTime?: number;
  availableToolCount: number;
}

interface ToolStatusIndicatorProps {
  status: ToolStatusInfo;
  platform: string;
  theme: 'light' | 'dark';
  compact?: boolean;
  showTooltip?: boolean;
  onClick?: () => void;
}

export function ToolStatusIndicator({
  status,
  platform,
  theme,
  compact = false,
  showTooltip = true,
  onClick
}: ToolStatusIndicatorProps) {
  const {
    isExecuting,
    activeToolCount,
    completedToolCount,
    failedToolCount,
    totalExecutionTime,
    lastExecutionTime,
    availableToolCount
  } = status;

  const getStatusColor = () => {
    if (isExecuting) return 'text-blue-400';
    if (failedToolCount > 0) return 'text-red-400';
    if (completedToolCount > 0) return 'text-green-400';
    return 'text-gray-400';
  };

  const getStatusIcon = () => {
    if (isExecuting) return <Loader2 className="w-4 h-4 animate-spin" />;
    if (failedToolCount > 0) return <XCircle className="w-4 h-4" />;
    if (completedToolCount > 0) return <CheckCircle className="w-4 h-4" />;
    return <Wrench className="w-4 h-4" />;
  };

  const getStatusText = () => {
    if (isExecuting) return `Executing ${activeToolCount} tool${activeToolCount !== 1 ? 's' : ''}`;
    if (failedToolCount > 0) return `${failedToolCount} tool${failedToolCount !== 1 ? 's' : ''} failed`;
    if (completedToolCount > 0) return `${completedToolCount} tool${completedToolCount !== 1 ? 's' : ''} completed`;
    return `${availableToolCount} tools available`;
  };

  const formatExecutionTime = (time: number) => {
    if (time < 1000) return `${time}ms`;
    return `${(time / 1000).toFixed(1)}s`;
  };

  const formatLastExecution = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const tooltipContent = showTooltip ? (
    <div className="space-y-1">
      <div className="font-medium">{getStatusText()}</div>
      <div className="text-xs space-y-0.5">
        <div>Available: {availableToolCount} tools</div>
        <div>Completed: {completedToolCount}</div>
        <div>Failed: {failedToolCount}</div>
        {totalExecutionTime > 0 && (
          <div>Total time: {formatExecutionTime(totalExecutionTime)}</div>
        )}
        <div>Last run: {formatLastExecution(lastExecutionTime)}</div>
      </div>
    </div>
  ) : null;

  if (compact) {
    return (
      <motion.button
        onClick={onClick}
        className={cn(
          "relative p-1.5 rounded-lg transition-colors",
          ThemeUtils.getBackgroundClass(platform, theme, 'hover'),
          getStatusColor()
        )}
        title={showTooltip ? getStatusText() : undefined}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {getStatusIcon()}
        
        {/* Activity indicator */}
        {isExecuting && (
          <motion.div
            className="absolute -top-1 -right-1 w-2 h-2 bg-blue-400 rounded-full"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
        
        {/* Error indicator */}
        {!isExecuting && failedToolCount > 0 && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-400 rounded-full" />
        )}
        
        {/* Success indicator */}
        {!isExecuting && failedToolCount === 0 && completedToolCount > 0 && (
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full" />
        )}
      </motion.button>
    );
  }

  return (
    <motion.div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
        ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
        ThemeUtils.getBorderClass(platform, theme),
        onClick && ThemeUtils.getBackgroundClass(platform, theme, 'hover')
      )}
      onClick={onClick}
      whileHover={onClick ? { scale: 1.02 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
    >
      <div className={cn("flex items-center gap-2", getStatusColor())}>
        {getStatusIcon()}
        <span className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
          {getStatusText()}
        </span>
      </div>
      
      {/* Execution metrics */}
      <div className="flex items-center gap-3 text-xs">
        {totalExecutionTime > 0 && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span className={ThemeUtils.getTextClass(platform, theme, 'secondary')}>
              {formatExecutionTime(totalExecutionTime)}
            </span>
          </div>
        )}
        
        {availableToolCount > 0 && (
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            <span className={ThemeUtils.getTextClass(platform, theme, 'secondary')}>
              {availableToolCount}
            </span>
          </div>
        )}
      </div>
      
      {/* Activity pulse */}
      <AnimatePresence>
        {isExecuting && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            className="flex items-center gap-1"
          >
            <Activity className="w-3 h-3 text-blue-400" />
            <motion.div
              className="w-1 h-1 bg-blue-400 rounded-full"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}