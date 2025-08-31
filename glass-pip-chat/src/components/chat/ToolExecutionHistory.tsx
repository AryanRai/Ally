/**
 * Tool Execution History Component
 * Requirements: 9.2, 9.3
 * 
 * Displays tool execution history in conversation interface
 * Shows historical tool usage patterns and results
 * Provides filtering and search capabilities for tool history
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  History, 
  Search, 
  Filter, 
  CheckCircle, 
  XCircle, 
  Clock,
  Wrench,
  ChevronDown,
  ChevronUp,
  Calendar,
  BarChart3,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';

export interface ToolExecutionHistoryItem {
  id: string;
  name: string;
  parameters: Record<string, any>;
  result: any;
  error?: string;
  executionTime: number;
  timestamp: number;
  status: 'success' | 'error';
  conversationId?: string;
  userId?: string;
}

interface ToolExecutionHistoryProps {
  history: ToolExecutionHistoryItem[];
  platform: string;
  theme: 'light' | 'dark';
  maxItems?: number;
  showSearch?: boolean;
  showFilter?: boolean;
  showStats?: boolean;
  compact?: boolean;
  onItemClick?: (item: ToolExecutionHistoryItem) => void;
}

type FilterType = 'all' | 'success' | 'error' | 'recent' | 'slow';
type SortType = 'timestamp' | 'name' | 'executionTime' | 'status';

export function ToolExecutionHistory({
  history,
  platform,
  theme,
  maxItems = 50,
  showSearch = true,
  showFilter = true,
  showStats = true,
  compact = false,
  onItemClick
}: ToolExecutionHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortType, setSortType] = useState<SortType>('timestamp');
  const [sortAscending, setSortAscending] = useState(false);
  const [showDetails, setShowDetails] = useState(!compact);

  // Filter and sort history
  const filteredHistory = useMemo(() => {
    let filtered = [...history];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(query) ||
        JSON.stringify(item.parameters).toLowerCase().includes(query) ||
        (item.error && item.error.toLowerCase().includes(query))
      );
    }

    // Apply type filter
    switch (filterType) {
      case 'success':
        filtered = filtered.filter(item => item.status === 'success');
        break;
      case 'error':
        filtered = filtered.filter(item => item.status === 'error');
        break;
      case 'recent':
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        filtered = filtered.filter(item => item.timestamp > oneHourAgo);
        break;
      case 'slow':
        filtered = filtered.filter(item => item.executionTime > 5000); // > 5 seconds
        break;
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortType) {
        case 'timestamp':
          comparison = a.timestamp - b.timestamp;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'executionTime':
          comparison = a.executionTime - b.executionTime;
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
      }
      
      return sortAscending ? comparison : -comparison;
    });

    return filtered.slice(0, maxItems);
  }, [history, searchQuery, filterType, sortType, sortAscending, maxItems]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = history.length;
    const successful = history.filter(item => item.status === 'success').length;
    const failed = history.filter(item => item.status === 'error').length;
    const avgExecutionTime = total > 0 
      ? history.reduce((sum, item) => sum + item.executionTime, 0) / total
      : 0;
    
    const toolUsage = history.reduce((acc, item) => {
      acc[item.name] = (acc[item.name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const mostUsedTool = Object.entries(toolUsage)
      .sort(([,a], [,b]) => b - a)[0];

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      avgExecutionTime,
      mostUsedTool: mostUsedTool ? { name: mostUsedTool[0], count: mostUsedTool[1] } : null
    };
  }, [history]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  const formatExecutionTime = (time: number) => {
    if (time < 1000) return `${time}ms`;
    return `${(time / 1000).toFixed(1)}s`;
  };

  const getStatusIcon = (status: string) => {
    return status === 'success' 
      ? <CheckCircle className="w-3 h-3 text-green-400" />
      : <XCircle className="w-3 h-3 text-red-400" />;
  };

  if (history.length === 0) {
    return (
      <div className={cn(
        "text-center py-8",
        ThemeUtils.getTextClass(platform, theme, 'secondary')
      )}>
        <Wrench className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No tool execution history yet</p>
      </div>
    );
  }

  return (
    <div className={cn(
      "border rounded-lg overflow-hidden",
      ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
      ThemeUtils.getBorderClass(platform, theme)
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-400" />
          <span className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
            Tool Execution History
          </span>
          <span className={cn(
            "px-2 py-0.5 bg-blue-500/20 rounded-full text-xs text-blue-300"
          )}>
            {filteredHistory.length}
          </span>
        </div>
        
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={cn(
            "p-1 rounded hover:bg-white/10 transition-colors",
            ThemeUtils.getTextClass(platform, theme, 'secondary')
          )}
        >
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {/* Statistics */}
            {showStats && (
              <div className="p-3 border-b border-white/10">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="text-center">
                    <div className={cn("text-lg font-bold", ThemeUtils.getTextClass(platform, theme))}>
                      {stats.total}
                    </div>
                    <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                      Total
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className={cn("text-lg font-bold text-green-400")}>
                      {stats.successRate.toFixed(0)}%
                    </div>
                    <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                      Success Rate
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className={cn("text-lg font-bold", ThemeUtils.getTextClass(platform, theme))}>
                      {formatExecutionTime(stats.avgExecutionTime)}
                    </div>
                    <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                      Avg Time
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className={cn("text-lg font-bold text-blue-400")}>
                      {stats.mostUsedTool?.name.substring(0, 8) || 'N/A'}
                    </div>
                    <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                      Most Used
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Search and Filter */}
            {(showSearch || showFilter) && (
              <div className="p-3 border-b border-white/10 space-y-2">
                {showSearch && (
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search tools, parameters, or errors..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={cn(
                        "w-full pl-10 pr-4 py-2 text-sm rounded-lg border",
                        ThemeUtils.getInputClass(platform, theme)
                      )}
                    />
                  </div>
                )}
                
                {showFilter && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="w-4 h-4 text-gray-400" />
                    {(['all', 'success', 'error', 'recent', 'slow'] as FilterType[]).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setFilterType(filter)}
                        className={cn(
                          "px-2 py-1 text-xs rounded-full transition-colors",
                          filterType === filter
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            : cn(
                                "border",
                                ThemeUtils.getBackgroundClass(platform, theme, 'hover'),
                                ThemeUtils.getBorderClass(platform, theme),
                                ThemeUtils.getTextClass(platform, theme, 'secondary')
                              )
                        )}
                      >
                        {filter.charAt(0).toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* History List */}
            <div className="max-h-96 overflow-y-auto">
              {filteredHistory.length === 0 ? (
                <div className={cn(
                  "text-center py-8",
                  ThemeUtils.getTextClass(platform, theme, 'secondary')
                )}>
                  <Search className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No matching tool executions found</p>
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {filteredHistory.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={cn(
                        "p-3 hover:bg-white/5 transition-colors cursor-pointer",
                        onItemClick && "hover:bg-white/10"
                      )}
                      onClick={() => onItemClick?.(item)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(item.status)}
                          <span className={cn("font-medium text-sm", ThemeUtils.getTextClass(platform, theme))}>
                            {item.name}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <Clock className="w-3 h-3" />
                          <span>{formatExecutionTime(item.executionTime)}</span>
                          <span>•</span>
                          <span>{formatTimestamp(item.timestamp)}</span>
                        </div>
                      </div>
                      
                      {item.error && (
                        <div className="flex items-start gap-2 mb-2 p-2 bg-red-500/10 rounded border border-red-500/20">
                          <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                          <span className="text-xs text-red-300">
                            {item.error.length > 100 ? `${item.error.substring(0, 100)}...` : item.error}
                          </span>
                        </div>
                      )}
                      
                      <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                        Parameters: {Object.keys(item.parameters).length > 0 
                          ? Object.entries(item.parameters)
                              .slice(0, 2)
                              .map(([key, value]) => `${key}: ${String(value).substring(0, 20)}`)
                              .join(', ')
                          : 'None'
                        }
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}