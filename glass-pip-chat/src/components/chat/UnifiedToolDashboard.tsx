/**
 * Unified Tool Dashboard Component
 * 
 * Combines tool management, status monitoring, and analytics into one interface
 * Uses the clean spanner icon styling from Tool Management Interface
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, 
  BarChart3, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Clock,
  Zap,
  Activity,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Power,
  PowerOff,
  Eye,
  EyeOff,
  Search,
  Filter,
  Download,
  Upload,
  Trash2,
  Edit3,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  Info,
  Wrench,
  Loader2,
  Target,
  Calendar
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';
import { ToolCallTest } from '../UnifiedChatInterface';
import { StreamingTest } from '../StreamingTest';

// Combined interfaces from all three components
export interface UnifiedToolDefinition {
  name: string;
  description: string;
  category: string;
  version: string;
  enabled: boolean;
  parameters: Record<string, any>;
  securityLevel: 'low' | 'medium' | 'high';
  lastUsed?: number;
  usageCount: number;
  averageExecutionTime: number;
  successRate: number;
  errorCount: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  usageFrequency: number;
  errorRate: number;
  performanceScore: number;
  trend: 'up' | 'down' | 'stable';
}

export interface UnifiedSystemMetrics {
  totalTools: number;
  activeTools: number;
  totalExecutions: number;
  successRate: number;
  averageResponseTime: number;
  peakUsageHour: number;
  mostReliableTool: string;
  slowestTool: string;
  mostUsedTool: string;
  errorProneTool: string;
  isExecuting: boolean;
  activeToolCount: number;
  completedToolCount: number;
  failedToolCount: number;
  totalExecutionTime: number;
  lastExecutionTime?: number;
  availableToolCount: number;
}

export interface UnifiedAnalytics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  mostUsedTools: Array<{ name: string; count: number; percentage: number }>;
  recentActivity: Array<{
    timestamp: number;
    toolName: string;
    status: 'success' | 'error';
    executionTime: number;
  }>;
  performanceTrends: {
    executionTimesTrend: 'up' | 'down' | 'stable';
    successRateTrend: 'up' | 'down' | 'stable';
    usageTrend: 'up' | 'down' | 'stable';
  };
}

interface UnifiedToolDashboardProps {
  tools: UnifiedToolDefinition[];
  systemMetrics: UnifiedSystemMetrics;
  analytics: UnifiedAnalytics;
  platform: string;
  theme: 'light' | 'dark';
  timeRange?: '1h' | '24h' | '7d' | '30d';
  onToolToggle: (toolName: string, enabled: boolean) => void;
  onToolConfigure: (toolName: string, config: Record<string, any>) => void;
  onToolRefresh: (toolName: string) => void;
  onToolRemove: (toolName: string) => void;
  onExportConfig: () => void;
  onImportConfig: (config: any) => void;
  onRefreshAnalytics: () => void;
  onTimeRangeChange?: (range: '1h' | '24h' | '7d' | '30d') => void;
  onExportData?: () => void;
}

type ViewMode = 'overview' | 'tools' | 'analytics' | 'status' | 'testing';
type ToolFilter = 'all' | 'enabled' | 'disabled' | 'errors' | 'unused';
type MetricSort = 'name' | 'executions' | 'successRate' | 'avgTime' | 'errorRate' | 'performance';

export function UnifiedToolDashboard({
  tools = [],
  systemMetrics,
  analytics,
  platform,
  theme,
  timeRange = '24h',
  onToolToggle,
  onToolConfigure,
  onToolRefresh,
  onToolRemove,
  onExportConfig,
  onImportConfig,
  onRefreshAnalytics,
  onTimeRangeChange,
  onExportData
}: UnifiedToolDashboardProps) {
  // Provide safe defaults
  const safeTools = tools || [];
  const safeSystemMetrics = systemMetrics || {
    totalTools: 0,
    activeTools: 0,
    totalExecutions: 0,
    successRate: 0,
    averageResponseTime: 0,
    peakUsageHour: 0,
    mostReliableTool: 'N/A',
    slowestTool: 'N/A',
    mostUsedTool: 'N/A',
    errorProneTool: 'N/A',
    isExecuting: false,
    activeToolCount: 0,
    completedToolCount: 0,
    failedToolCount: 0,
    totalExecutionTime: 0,
    availableToolCount: 0
  };
  const safeAnalytics = analytics || {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
    mostUsedTools: [],
    recentActivity: [],
    performanceTrends: {
      executionTimesTrend: 'stable' as const,
      successRateTrend: 'stable' as const,
      usageTrend: 'stable' as const
    }
  };

  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [toolFilter, setToolFilter] = useState<ToolFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<MetricSort>('executions');
  const [sortAscending, setSortAscending] = useState(false);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});
  const [showStreamingTest, setShowStreamingTest] = useState(false);
  const [showToolCallTest, setShowToolCallTest] = useState(false);

  // Filter and sort tools
  const filteredTools = useMemo(() => {
    let filtered = [...safeTools];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(tool => 
        tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.category.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    switch (toolFilter) {
      case 'enabled':
        filtered = filtered.filter(tool => tool.enabled);
        break;
      case 'disabled':
        filtered = filtered.filter(tool => !tool.enabled);
        break;
      case 'errors':
        filtered = filtered.filter(tool => tool.errorCount > 0);
        break;
      case 'unused':
        filtered = filtered.filter(tool => tool.usageCount === 0);
        break;
    }

    // Sort tools
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'executions':
          comparison = a.totalExecutions - b.totalExecutions;
          break;
        case 'successRate':
          comparison = a.successRate - b.successRate;
          break;
        case 'avgTime':
          comparison = a.averageExecutionTime - b.averageExecutionTime;
          break;
        case 'errorRate':
          comparison = a.errorRate - b.errorRate;
          break;
        case 'performance':
          comparison = a.performanceScore - b.performanceScore;
          break;
      }
      
      return sortAscending ? comparison : -comparison;
    });

    return filtered;
  }, [safeTools, searchQuery, toolFilter, sortBy, sortAscending]);

  // Utility functions
  const formatExecutionTime = (time: number) => {
    if (time < 1000) return `${time}ms`;
    return `${(time / 1000).toFixed(1)}s`;
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const getStatusColor = () => {
    if (safeSystemMetrics.isExecuting) return 'text-blue-400';
    if (safeSystemMetrics.failedToolCount > 0) return 'text-red-400';
    if (safeSystemMetrics.completedToolCount > 0) return 'text-green-400';
    return 'text-gray-400';
  };

  const getStatusIcon = () => {
    if (safeSystemMetrics.isExecuting) return <Loader2 className="w-5 h-5 animate-spin" />;
    if (safeSystemMetrics.failedToolCount > 0) return <XCircle className="w-5 h-5" />;
    if (safeSystemMetrics.completedToolCount > 0) return <CheckCircle className="w-5 h-5" />;
    return <Wrench className="w-5 h-5" />;
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4 text-green-400" />;
      case 'down': return <TrendingDown className="w-4 h-4 text-red-400" />;
      default: return <Activity className="w-4 h-4 text-gray-400" />;
    }
  };

  const getCardClasses = () => cn(
    "p-3 rounded-lg border",
    platform === 'win32'
      ? "border-white/10 bg-white/5"
      : theme === 'dark' ? "border-white/10 bg-white/5" : "border-black/10 bg-black/5"
  );

  const getTextClasses = (variant: 'title' | 'subtitle' | 'body' = 'body') => {
    const baseClasses = platform === 'win32'
      ? variant === 'title' ? "text-white/90" : variant === 'subtitle' ? "text-white/80" : "text-white/60"
      : theme === 'dark' 
        ? variant === 'title' ? "text-white/90" : variant === 'subtitle' ? "text-white/80" : "text-white/60"
        : variant === 'title' ? "text-black/90" : variant === 'subtitle' ? "text-black/80" : "text-black/60";
    
    return cn(baseClasses);
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Status Header */}
      <div className={cn(
        "flex items-center gap-4 p-3 rounded-lg border",
        platform === 'win32'
          ? "border-white/10 bg-white/5"
          : theme === 'dark' ? "border-white/10 bg-white/5" : "border-black/10 bg-black/5"
      )}>
        <div className={cn("flex items-center gap-3", getStatusColor())}>
          {getStatusIcon()}
          <div>
            <h3 className={cn(
              "text-sm font-medium",
              platform === 'win32'
                ? "text-white/80"
                : theme === 'dark' ? "text-white/80" : "text-black/80"
            )}>
              Tool System Status
            </h3>
            <p className={cn(
              "text-xs",
              platform === 'win32'
                ? "text-white/60"
                : theme === 'dark' ? "text-white/60" : "text-black/60"
            )}>
              {safeSystemMetrics.isExecuting 
                ? `Executing ${safeSystemMetrics.activeToolCount} tools`
                : `${safeSystemMetrics.availableToolCount} tools available`
              }
            </p>
          </div>
        </div>
        
        <div className="flex-1" />
        
        <button
          onClick={onRefreshAnalytics}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            platform === 'win32' 
              ? "hover:bg-white/10"
              : theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10"
          )}
          title="Refresh Analytics"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={getCardClasses()}>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-blue-400" />
            <span className={cn("text-xs font-medium", getTextClasses('subtitle'))}>
              Active Tools
            </span>
          </div>
          <div className={cn("text-lg font-bold", getTextClasses('title'))}>
            {safeSystemMetrics.activeTools}
          </div>
          <div className={cn("text-xs", getTextClasses())}>
            of {safeSystemMetrics.totalTools} total
          </div>
        </div>

        <div className={getCardClasses()}>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className={cn("text-xs font-medium", getTextClasses('subtitle'))}>
              Success Rate
            </span>
          </div>
          <div className="text-lg font-bold text-green-400">
            {formatPercentage(safeSystemMetrics.successRate)}
          </div>
          <div className={cn("text-xs", getTextClasses())}>
            {safeSystemMetrics.totalExecutions} executions
          </div>
        </div>

        <div className={getCardClasses()}>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            <span className={cn("text-xs font-medium", getTextClasses('subtitle'))}>
              Avg Response
            </span>
          </div>
          <div className={cn("text-lg font-bold", getTextClasses('title'))}>
            {formatExecutionTime(safeSystemMetrics.averageResponseTime)}
          </div>
          <div className={cn("text-xs", getTextClasses())}>
            Peak: {safeSystemMetrics.peakUsageHour}:00
          </div>
        </div>

        <div className={getCardClasses()}>
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-purple-400" />
            <span className={cn("text-xs font-medium", getTextClasses('subtitle'))}>
              Most Used
            </span>
          </div>
          <div className={cn("text-sm font-bold", getTextClasses('title'))}>
            {safeSystemMetrics.mostUsedTool.substring(0, 12)}
          </div>
        </div>
      </div>

      {/* Performance Insights */}
      <div className={cn(
        "p-4 rounded-lg border",
        ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
        ThemeUtils.getBorderClass(platform, theme)
      )}>
        <h4 className={cn("text-md font-semibold mb-3", ThemeUtils.getTextClass(platform, theme))}>
          Performance Insights
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <div>
              <div className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
                Most Reliable
              </div>
              <div className={cn("text-sm", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                {safeSystemMetrics.mostReliableTool} has the highest success rate
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <div>
              <div className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
                Needs Attention
              </div>
              <div className={cn("text-sm", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                {safeSystemMetrics.errorProneTool} has high error rate
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-yellow-400" />
            <div>
              <div className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
                Performance Issue
              </div>
              <div className={cn("text-sm", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                {safeSystemMetrics.slowestTool} is slower than average
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderToolsList = () => (
    <div className="space-y-4">
      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full pl-10 pr-4 py-2 rounded-lg border",
              ThemeUtils.getBackgroundClass(platform, theme),
              ThemeUtils.getBorderClass(platform, theme),
              ThemeUtils.getTextClass(platform, theme)
            )}
          />
        </div>
        
        <select
          value={toolFilter}
          onChange={(e) => setToolFilter(e.target.value as ToolFilter)}
          className={cn(
            "px-3 py-2 rounded-lg border",
            ThemeUtils.getBackgroundClass(platform, theme),
            ThemeUtils.getBorderClass(platform, theme),
            ThemeUtils.getTextClass(platform, theme)
          )}
        >
          <option value="all">All Tools</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
          <option value="errors">With Errors</option>
          <option value="unused">Unused</option>
        </select>
      </div>

      {/* Tools List */}
      <div className="space-y-2">
        {filteredTools.map((tool) => (
          <motion.div
            key={tool.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "p-4 rounded-lg border",
              ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
              ThemeUtils.getBorderClass(platform, theme)
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onToolToggle(tool.name, !tool.enabled)}
                  className={cn(
                    "p-1 rounded transition-colors",
                    tool.enabled ? "text-green-400" : "text-gray-400"
                  )}
                >
                  {tool.enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                </button>
                
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                      {tool.name}
                    </span>
                    <span className={cn(
                      "px-2 py-1 text-xs rounded",
                      tool.category === 'utility' ? "bg-blue-100 text-blue-700" :
                      tool.category === 'data' ? "bg-green-100 text-green-700" :
                      "bg-gray-100 text-gray-700"
                    )}>
                      {tool.category}
                    </span>
                  </div>
                  <p className={cn("text-sm", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                    {tool.description}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="text-right text-sm">
                  <div className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                    {tool.totalExecutions} runs
                  </div>
                  <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                    {formatPercentage(tool.successRate)} success
                  </div>
                </div>
                
                <button
                  onClick={() => setShowDetails(prev => ({ ...prev, [tool.name]: !prev[tool.name] }))}
                  className={cn(
                    "p-1 rounded transition-colors",
                    ThemeUtils.getBackgroundClass(platform, theme, 'hover')
                  )}
                >
                  {showDetails[tool.name] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>
            
            <AnimatePresence>
              {showDetails[tool.name] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700"
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                        Avg Time:
                      </span>
                      <span className={cn("ml-1", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                        {formatExecutionTime(tool.averageExecutionTime)}
                      </span>
                    </div>
                    <div>
                      <span className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                        Error Rate:
                      </span>
                      <span className={cn("ml-1", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                        {formatPercentage(tool.errorRate)}
                      </span>
                    </div>
                    <div>
                      <span className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                        Performance:
                      </span>
                      <span className={cn("ml-1", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                        {tool.performanceScore}/100
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                        Trend:
                      </span>
                      {getTrendIcon(tool.trend)}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => onToolConfigure(tool.name, tool.parameters)}
                      className={cn(
                        "px-3 py-1 text-xs rounded transition-colors",
                        "bg-blue-100 text-blue-700 hover:bg-blue-200"
                      )}
                    >
                      Configure
                    </button>
                    <button
                      onClick={() => onToolRefresh(tool.name)}
                      className={cn(
                        "px-3 py-1 text-xs rounded transition-colors",
                        "bg-green-100 text-green-700 hover:bg-green-200"
                      )}
                    >
                      Refresh
                    </button>
                    <button
                      onClick={() => onToolRemove(tool.name)}
                      className={cn(
                        "px-3 py-1 text-xs rounded transition-colors",
                        "bg-red-100 text-red-700 hover:bg-red-200"
                      )}
                    >
                      Remove
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  );

  const renderAnalytics = () => (
    <div className="space-y-6">
      {/* Analytics Header */}
      <div className="flex items-center justify-between">
        <h3 className={cn("text-lg font-semibold", ThemeUtils.getTextClass(platform, theme))}>
          Tool Analytics
        </h3>
        <div className="flex items-center gap-2">
          {onTimeRangeChange && (
            <select
              value={timeRange}
              onChange={(e) => onTimeRangeChange(e.target.value as any)}
              className={cn(
                "px-3 py-1 text-sm rounded border",
                ThemeUtils.getBackgroundClass(platform, theme),
                ThemeUtils.getBorderClass(platform, theme)
              )}
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          )}
          {onExportData && (
            <button
              onClick={onExportData}
              className={cn(
                "p-2 rounded transition-colors",
                ThemeUtils.getBackgroundClass(platform, theme, 'hover')
              )}
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Performance Trends */}
      <div className={cn(
        "p-4 rounded-lg border",
        ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
        ThemeUtils.getBorderClass(platform, theme)
      )}>
        <h4 className={cn("text-md font-semibold mb-3", ThemeUtils.getTextClass(platform, theme))}>
          Performance Trends
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            {getTrendIcon(safeAnalytics.performanceTrends.executionTimesTrend)}
            <div>
              <div className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
                Execution Times
              </div>
              <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                {safeAnalytics.performanceTrends.executionTimesTrend} trend
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {getTrendIcon(safeAnalytics.performanceTrends.successRateTrend)}
            <div>
              <div className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
                Success Rate
              </div>
              <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                {safeAnalytics.performanceTrends.successRateTrend} trend
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {getTrendIcon(safeAnalytics.performanceTrends.usageTrend)}
            <div>
              <div className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
                Usage Volume
              </div>
              <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                {safeAnalytics.performanceTrends.usageTrend} trend
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Most Used Tools */}
      <div className={cn(
        "p-4 rounded-lg border",
        ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
        ThemeUtils.getBorderClass(platform, theme)
      )}>
        <h4 className={cn("text-md font-semibold mb-3", ThemeUtils.getTextClass(platform, theme))}>
          Most Used Tools
        </h4>
        <div className="space-y-2">
          {safeAnalytics.mostUsedTools.slice(0, 5).map((tool, index) => (
            <div key={tool.name} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                  index === 0 ? "bg-yellow-100 text-yellow-700" :
                  index === 1 ? "bg-gray-100 text-gray-700" :
                  index === 2 ? "bg-orange-100 text-orange-700" :
                  "bg-blue-100 text-blue-700"
                )}>
                  {index + 1}
                </span>
                <span className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                  {tool.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-sm", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                  {tool.count} uses
                </span>
                <span className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
                  {tool.percentage.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className={cn(
        "p-4 rounded-lg border",
        ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
        ThemeUtils.getBorderClass(platform, theme)
      )}>
        <h4 className={cn("text-md font-semibold mb-3", ThemeUtils.getTextClass(platform, theme))}>
          Recent Activity
        </h4>
        <div className="space-y-2">
          {safeAnalytics.recentActivity.slice(0, 10).map((activity, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {activity.status === 'success' ? 
                  <CheckCircle className="w-4 h-4 text-green-400" /> :
                  <XCircle className="w-4 h-4 text-red-400" />
                }
                <span className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                  {activity.toolName}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className={cn(ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                  {formatExecutionTime(activity.executionTime)}
                </span>
                <span className={cn(ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                  {new Date(activity.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStatus = () => (
    <div className="space-y-6">
      {/* Current Status */}
      <div className={cn(
        "p-6 rounded-lg border text-center",
        ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
        ThemeUtils.getBorderClass(platform, theme)
      )}>
        <div className={cn("flex justify-center mb-4", getStatusColor())}>
          {getStatusIcon()}
        </div>
        <h3 className={cn("text-xl font-bold mb-2", ThemeUtils.getTextClass(platform, theme))}>
          {safeSystemMetrics.isExecuting ? 'Tools Executing' : 'System Ready'}
        </h3>
        <p className={cn("text-sm", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
          {safeSystemMetrics.isExecuting 
            ? `${safeSystemMetrics.activeToolCount} tools currently running`
            : `${safeSystemMetrics.availableToolCount} tools available for execution`
          }
        </p>
      </div>

      {/* Execution Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={cn(
          "p-4 rounded-lg border",
          ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
          ThemeUtils.getBorderClass(platform, theme)
        )}>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-5 h-5 text-blue-400" />
            <h4 className={cn("font-semibold", ThemeUtils.getTextClass(platform, theme))}>
              Execution Stats
            </h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className={cn(ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                Total Executions:
              </span>
              <span className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                {safeSystemMetrics.totalExecutions}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={cn(ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                Completed:
              </span>
              <span className={cn("font-medium text-green-400")}>
                {safeSystemMetrics.completedToolCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={cn(ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                Failed:
              </span>
              <span className={cn("font-medium text-red-400")}>
                {safeSystemMetrics.failedToolCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={cn(ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                Total Time:
              </span>
              <span className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                {formatExecutionTime(safeSystemMetrics.totalExecutionTime)}
              </span>
            </div>
          </div>
        </div>

        <div className={cn(
          "p-4 rounded-lg border",
          ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
          ThemeUtils.getBorderClass(platform, theme)
        )}>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-yellow-400" />
            <h4 className={cn("font-semibold", ThemeUtils.getTextClass(platform, theme))}>
              Performance
            </h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className={cn(ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                Success Rate:
              </span>
              <span className={cn("font-medium text-green-400")}>
                {formatPercentage(safeSystemMetrics.successRate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={cn(ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                Avg Response:
              </span>
              <span className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                {formatExecutionTime(safeSystemMetrics.averageResponseTime)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={cn(ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                Last Execution:
              </span>
              <span className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                {safeSystemMetrics.lastExecutionTime 
                  ? new Date(safeSystemMetrics.lastExecutionTime).toLocaleTimeString()
                  : 'Never'
                }
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTesting = () => (
    <div className="space-y-6">
      {/* Testing Header */}
      <div className={cn(
        "p-4 rounded-lg border",
        ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
        ThemeUtils.getBorderClass(platform, theme)
      )}>
        <h3 className={cn("text-lg font-semibold mb-2", ThemeUtils.getTextClass(platform, theme))}>
          Tool Testing Interface
        </h3>
        <p className={cn("text-sm", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
          Test and validate tool functionality with real-time streaming and tool calling interfaces.
        </p>
      </div>

      {/* Streaming Test Section */}
      <div className="space-y-3">
        <h4 className={cn(
          "text-md font-medium flex items-center gap-2",
          ThemeUtils.getTextClass(platform, theme)
        )}>
          <Activity className="w-4 h-4" />
          Streaming Test
        </h4>
        
        <div className={cn(
          "p-4 rounded-lg border",
          ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
          ThemeUtils.getBorderClass(platform, theme)
        )}>
          <p className={cn(
            "text-sm mb-4",
            ThemeUtils.getTextClass(platform, theme, 'secondary')
          )}>
            Test real-time thinking and response streaming functionality with Ollama.
          </p>
          
          <button
            onClick={() => setShowStreamingTest(!showStreamingTest)}
            className={cn(
              "w-full px-4 py-2 text-sm rounded-lg transition-colors border font-medium",
              showStreamingTest
                ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                : platform === 'win32'
                  ? "border-white/20 bg-white/10 hover:bg-white/20 text-white/80"
                  : theme === 'dark' 
                    ? "border-white/20 bg-white/10 hover:bg-white/20 text-white/80"
                    : "border-black/20 bg-black/10 hover:bg-black/20 text-black/80"
            )}
          >
            {showStreamingTest ? 'Hide Streaming Test' : 'Show Streaming Test'}
          </button>
          
          {showStreamingTest && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 border-t pt-4"
            >
              <StreamingTest />
            </motion.div>
          )}
        </div>
      </div>

      {/* Tool Call Test Section */}
      <div className="space-y-3">
        <h4 className={cn(
          "text-md font-medium flex items-center gap-2",
          ThemeUtils.getTextClass(platform, theme)
        )}>
          <Wrench className="w-4 h-4" />
          Tool Call Test Interface
        </h4>
        
        <div className={cn(
          "rounded-lg border overflow-hidden",
          ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
          ThemeUtils.getBorderClass(platform, theme)
        )}>
          <div className="p-4 border-b">
            <p className={cn(
              "text-sm mb-3",
              ThemeUtils.getTextClass(platform, theme, 'secondary')
            )}>
              Interactive tool calling interface for testing AI tool integration.
            </p>
            
            <button
              onClick={() => setShowToolCallTest(!showToolCallTest)}
              className={cn(
                "w-full px-4 py-2 text-sm rounded-lg transition-colors border font-medium",
                showToolCallTest
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                  : platform === 'win32'
                    ? "border-white/20 bg-white/10 hover:bg-white/20 text-white/80"
                    : theme === 'dark' 
                      ? "border-white/20 bg-white/10 hover:bg-white/20 text-white/80"
                      : "border-black/20 bg-black/10 hover:bg-black/20 text-black/80"
              )}
            >
              {showToolCallTest ? 'Hide Tool Call Test' : 'Show Tool Call Test'}
            </button>
          </div>
          
          {showToolCallTest && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="h-80"
            >
              <ToolCallTest
                conversationId={`dashboard_test_${Date.now()}`}
                className="h-full"
              />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div 
      className={cn(
        "rounded-2xl border shadow-[0_12px_60px_rgba(0,0,0,0.6)]",
        // Theme-aware styling with less transparency
        theme === 'dark' 
          ? "border-white/30 text-white/95" 
          : "border-black/30 text-black/95",
        // Platform-specific backgrounds with reduced transparency
        platform === 'win32' 
          ? "bg-black/60" // More opaque for Windows acrylic
          : theme === 'dark'
            ? "bg-gradient-to-b from-gray-900/95 to-gray-800/95"
            : "bg-gradient-to-b from-gray-100/95 to-gray-200/95"
      )}
      style={{
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)'
      }}
    >
      {/* Header with Navigation */}
      <div className={cn(
        "flex items-center justify-between p-4 border-b",
        platform === 'win32'
          ? "border-white/10"
          : theme === 'dark' ? "border-white/10" : "border-black/10"
      )}>
        <div className="flex items-center gap-3">
          <Wrench className="w-5 h-5 text-blue-400" />
          <h2 className={cn(
            "text-lg font-semibold",
            platform === 'win32'
              ? "text-white/90"
              : theme === 'dark' ? "text-white/90" : "text-black/90"
          )}>
            Tool Dashboard
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={onExportConfig}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              platform === 'win32' 
                ? "hover:bg-white/10"
                : theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10"
            )}
            title="Export Configuration"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => onImportConfig({})}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              platform === 'win32' 
                ? "hover:bg-white/10"
                : theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10"
            )}
            title="Import Configuration"
          >
            <Upload className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className={cn(
        "flex gap-1 p-3 border-b",
        platform === 'win32'
          ? "border-white/10"
          : theme === 'dark' ? "border-white/10" : "border-black/10"
      )}>
        {[
          { key: 'overview', label: 'Overview', icon: BarChart3 },
          { key: 'tools', label: 'Tools', icon: Settings },
          { key: 'analytics', label: 'Analytics', icon: TrendingUp },
          { key: 'status', label: 'Status', icon: Activity },
          { key: 'testing', label: 'Testing', icon: Wrench }
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setViewMode(key as ViewMode)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors flex-1 justify-center text-sm",
              viewMode === key
                ? platform === 'win32'
                  ? "bg-white/20 text-white"
                  : theme === 'dark'
                    ? "bg-white/20 text-white"
                    : "bg-black/20 text-black"
                : platform === 'win32'
                  ? "hover:bg-white/10 text-white/70"
                  : theme === 'dark'
                    ? "hover:bg-white/10 text-white/70"
                    : "hover:bg-black/10 text-black/70"
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="font-medium">{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={viewMode}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {viewMode === 'overview' && renderOverview()}
            {viewMode === 'tools' && renderToolsList()}
            {viewMode === 'analytics' && renderAnalytics()}
            {viewMode === 'status' && renderStatus()}
            {viewMode === 'testing' && renderTesting()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}