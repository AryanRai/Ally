/**
 * Tool Management Interface Component
 * Requirements: 18.4, 18.5
 * 
 * Creates tool configuration and management interface
 * Implements tool analytics dashboard with usage metrics
 * Builds tool troubleshooting and diagnostic interface
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
  Info
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';

export interface ToolDefinition {
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
}

export interface ToolAnalytics {
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

interface ToolManagementInterfaceProps {
  tools: ToolDefinition[];
  analytics: ToolAnalytics;
  platform: string;
  theme: 'light' | 'dark';
  onToolToggle: (toolName: string, enabled: boolean) => void;
  onToolConfigure: (toolName: string, config: Record<string, any>) => void;
  onToolRefresh: (toolName: string) => void;
  onToolRemove: (toolName: string) => void;
  onExportConfig: () => void;
  onImportConfig: (config: any) => void;
  onRefreshAnalytics: () => void;
}

type ViewMode = 'overview' | 'tools' | 'analytics' | 'diagnostics';
type ToolFilter = 'all' | 'enabled' | 'disabled' | 'errors' | 'unused';

export function ToolManagementInterface({
  tools,
  analytics,
  platform,
  theme,
  onToolToggle,
  onToolConfigure,
  onToolRefresh,
  onToolRemove,
  onExportConfig,
  onImportConfig,
  onRefreshAnalytics
}: ToolManagementInterfaceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [toolFilter, setToolFilter] = useState<ToolFilter>('all');
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [showToolDetails, setShowToolDetails] = useState<Record<string, boolean>>({});

  // Filter and search tools
  const filteredTools = useMemo(() => {
    let filtered = [...tools];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(tool => 
        tool.name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query) ||
        tool.category.toLowerCase().includes(query)
      );
    }

    // Apply type filter
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

    return filtered;
  }, [tools, searchQuery, toolFilter]);

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

  const getSecurityLevelColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'medium': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      case 'low': return 'text-green-400 bg-green-500/10 border-green-500/20';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4 text-green-400" />;
      case 'down': return <TrendingDown className="w-4 h-4 text-red-400" />;
      default: return <Activity className="w-4 h-4 text-gray-400" />;
    }
  };

  const toggleToolDetails = (toolName: string) => {
    setShowToolDetails(prev => ({
      ...prev,
      [toolName]: !prev[toolName]
    }));
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={cn(
          "p-4 rounded-lg border",
          ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
          ThemeUtils.getBorderClass(platform, theme)
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-blue-400" />
            <span className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
              Total Tools
            </span>
          </div>
          <div className={cn("text-2xl font-bold", ThemeUtils.getTextClass(platform, theme))}>
            {tools.length}
          </div>
          <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
            {tools.filter(t => t.enabled).length} enabled
          </div>
        </div>

        <div className={cn(
          "p-4 rounded-lg border",
          ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
          ThemeUtils.getBorderClass(platform, theme)
        )}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-green-400" />
            <span className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
              Success Rate
            </span>
          </div>
          <div className={cn("text-2xl font-bold text-green-400")}>
            {analytics.totalExecutions > 0 
              ? Math.round((analytics.successfulExecutions / analytics.totalExecutions) * 100)
              : 0}%
          </div>
          <div className="flex items-center gap-1">
            {getTrendIcon(analytics.performanceTrends.successRateTrend)}
            <span className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
              {analytics.successfulExecutions}/{analytics.totalExecutions}
            </span>
          </div>
        </div>

        <div className={cn(
          "p-4 rounded-lg border",
          ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
          ThemeUtils.getBorderClass(platform, theme)
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            <span className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
              Avg Time
            </span>
          </div>
          <div className={cn("text-2xl font-bold", ThemeUtils.getTextClass(platform, theme))}>
            {formatExecutionTime(analytics.averageExecutionTime)}
          </div>
          <div className="flex items-center gap-1">
            {getTrendIcon(analytics.performanceTrends.executionTimesTrend)}
            <span className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
              Performance
            </span>
          </div>
        </div>

        <div className={cn(
          "p-4 rounded-lg border",
          ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
          ThemeUtils.getBorderClass(platform, theme)
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-purple-400" />
            <span className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
              Usage
            </span>
          </div>
          <div className={cn("text-2xl font-bold", ThemeUtils.getTextClass(platform, theme))}>
            {analytics.totalExecutions}
          </div>
          <div className="flex items-center gap-1">
            {getTrendIcon(analytics.performanceTrends.usageTrend)}
            <span className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
              Total executions
            </span>
          </div>
        </div>
      </div>

      {/* Most Used Tools */}
      <div className={cn(
        "p-4 rounded-lg border",
        ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
        ThemeUtils.getBorderClass(platform, theme)
      )}>
        <h3 className={cn("font-medium mb-3", ThemeUtils.getTextClass(platform, theme))}>
          Most Used Tools
        </h3>
        <div className="space-y-2">
          {analytics.mostUsedTools.slice(0, 5).map((tool, index) => (
            <div key={tool.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn("text-sm", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                  #{index + 1}
                </span>
                <span className={cn("text-sm", ThemeUtils.getTextClass(platform, theme))}>
                  {tool.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 bg-white/10 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="h-full bg-blue-400 rounded-full"
                    style={{ width: `${tool.percentage}%` }}
                  />
                </div>
                <span className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                  {tool.count}
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
        <h3 className={cn("font-medium mb-3", ThemeUtils.getTextClass(platform, theme))}>
          Recent Activity
        </h3>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {analytics.recentActivity.slice(0, 10).map((activity, index) => (
            <div key={index} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                {activity.status === 'success' 
                  ? <CheckCircle className="w-3 h-3 text-green-400" />
                  : <XCircle className="w-3 h-3 text-red-400" />
                }
                <span className={cn("text-sm", ThemeUtils.getTextClass(platform, theme))}>
                  {activity.toolName}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className={ThemeUtils.getTextClass(platform, theme, 'secondary')}>
                  {formatExecutionTime(activity.executionTime)}
                </span>
                <span className={ThemeUtils.getTextClass(platform, theme, 'secondary')}>
                  {formatTimestamp(activity.timestamp)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderToolsList = () => (
    <div className="space-y-4">
      {/* Search and Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full pl-10 pr-4 py-2 text-sm rounded-lg border",
              ThemeUtils.getInputClass(platform, theme)
            )}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          {(['all', 'enabled', 'disabled', 'errors', 'unused'] as ToolFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setToolFilter(filter)}
              className={cn(
                "px-3 py-1 text-xs rounded-full transition-colors",
                toolFilter === filter
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
      </div>

      {/* Tools List */}
      <div className="space-y-2">
        {filteredTools.map((tool) => (
          <div
            key={tool.name}
            className={cn(
              "border rounded-lg overflow-hidden",
              ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
              ThemeUtils.getBorderClass(platform, theme)
            )}
          >
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => onToolToggle(tool.name, !tool.enabled)}
                    className={cn(
                      "p-1 rounded transition-colors",
                      tool.enabled 
                        ? "text-green-400 hover:bg-green-500/20"
                        : "text-gray-400 hover:bg-gray-500/20"
                    )}
                  >
                    {tool.enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                  </button>
                  
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                        {tool.name}
                      </h4>
                      <span className={cn(
                        "px-2 py-0.5 text-xs rounded-full border",
                        getSecurityLevelColor(tool.securityLevel)
                      )}>
                        {tool.securityLevel}
                      </span>
                    </div>
                    <p className={cn("text-sm", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                      {tool.description}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs">
                      <span className={ThemeUtils.getTextClass(platform, theme, 'secondary')}>
                        Category: {tool.category}
                      </span>
                      <span className={ThemeUtils.getTextClass(platform, theme, 'secondary')}>
                        Version: {tool.version}
                      </span>
                      <span className={ThemeUtils.getTextClass(platform, theme, 'secondary')}>
                        Used: {tool.usageCount} times
                      </span>
                      <span className={ThemeUtils.getTextClass(platform, theme, 'secondary')}>
                        Success: {tool.successRate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleToolDetails(tool.name)}
                    className={cn(
                      "p-1 rounded hover:bg-white/10 transition-colors",
                      ThemeUtils.getTextClass(platform, theme, 'secondary')
                    )}
                  >
                    {showToolDetails[tool.name] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  
                  <button
                    onClick={() => onToolRefresh(tool.name)}
                    className={cn(
                      "p-1 rounded hover:bg-white/10 transition-colors",
                      ThemeUtils.getTextClass(platform, theme, 'secondary')
                    )}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  
                  <button
                    onClick={() => setSelectedTool(tool.name)}
                    className={cn(
                      "p-1 rounded hover:bg-white/10 transition-colors",
                      ThemeUtils.getTextClass(platform, theme, 'secondary')
                    )}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  
                  <button
                    onClick={() => onToolRemove(tool.name)}
                    className="p-1 rounded hover:bg-red-500/20 transition-colors text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {/* Tool Details */}
              <AnimatePresence>
                {showToolDetails[tool.name] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                        <div>
                          <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                            Avg Execution Time
                          </div>
                          <div className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                            {formatExecutionTime(tool.averageExecutionTime)}
                          </div>
                        </div>
                        <div>
                          <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                            Error Count
                          </div>
                          <div className={cn("font-medium", tool.errorCount > 0 ? "text-red-400" : ThemeUtils.getTextClass(platform, theme))}>
                            {tool.errorCount}
                          </div>
                        </div>
                        <div>
                          <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                            Last Used
                          </div>
                          <div className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                            {tool.lastUsed ? formatTimestamp(tool.lastUsed) : 'Never'}
                          </div>
                        </div>
                        <div>
                          <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                            Parameters
                          </div>
                          <div className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                            {Object.keys(tool.parameters).length}
                          </div>
                        </div>
                      </div>
                      
                      {Object.keys(tool.parameters).length > 0 && (
                        <div>
                          <div className={cn("text-xs font-medium mb-2", ThemeUtils.getTextClass(platform, theme))}>
                            Parameters:
                          </div>
                          <div className="space-y-1">
                            {Object.entries(tool.parameters).slice(0, 3).map(([key, value]) => (
                              <div key={key} className="flex items-center justify-between text-xs">
                                <span className={ThemeUtils.getTextClass(platform, theme, 'secondary')}>
                                  {key}:
                                </span>
                                <span className={ThemeUtils.getTextClass(platform, theme)}>
                                  {typeof value === 'object' ? JSON.stringify(value).substring(0, 30) + '...' : String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={cn(
      "border rounded-lg overflow-hidden",
      ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
      ThemeUtils.getBorderClass(platform, theme)
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-400" />
          <h2 className={cn("text-lg font-semibold", ThemeUtils.getTextClass(platform, theme))}>
            Tool Management
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={onRefreshAnalytics}
            className={cn(
              "p-2 rounded hover:bg-white/10 transition-colors",
              ThemeUtils.getTextClass(platform, theme, 'secondary')
            )}
            title="Refresh Analytics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          
          <button
            onClick={onExportConfig}
            className={cn(
              "p-2 rounded hover:bg-white/10 transition-colors",
              ThemeUtils.getTextClass(platform, theme, 'secondary')
            )}
            title="Export Configuration"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex border-b border-white/10">
        {[
          { key: 'overview', label: 'Overview', icon: BarChart3 },
          { key: 'tools', label: 'Tools', icon: Zap },
          { key: 'analytics', label: 'Analytics', icon: TrendingUp },
          { key: 'diagnostics', label: 'Diagnostics', icon: AlertTriangle }
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setViewMode(key as ViewMode)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
              viewMode === key
                ? "text-blue-300 border-b-2 border-blue-400 bg-blue-500/10"
                : cn(
                    "hover:bg-white/5",
                    ThemeUtils.getTextClass(platform, theme, 'secondary')
                  )
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {viewMode === 'overview' && renderOverview()}
        {viewMode === 'tools' && renderToolsList()}
        {viewMode === 'analytics' && (
          <div className={cn("text-center py-8", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
            <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Detailed analytics view coming soon</p>
          </div>
        )}
        {viewMode === 'diagnostics' && (
          <div className={cn("text-center py-8", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Diagnostics interface coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
}