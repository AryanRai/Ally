/**
 * Tool Analytics Dashboard Component
 * Requirements: 18.4, 18.5
 * 
 * Implements tool analytics dashboard with usage metrics
 * Provides performance monitoring and trend analysis
 * Shows tool usage patterns and optimization recommendations
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Zap,
  AlertTriangle,
  Target,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';

export interface ToolMetrics {
  name: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  lastExecutionTime?: number;
  usageFrequency: number; // executions per day
  errorRate: number;
  performanceScore: number; // 0-100
  trend: 'up' | 'down' | 'stable';
  category: string;
}

export interface SystemMetrics {
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
}

export interface TimeSeriesData {
  timestamp: number;
  executions: number;
  successRate: number;
  averageTime: number;
  errors: number;
}

interface ToolAnalyticsDashboardProps {
  toolMetrics: ToolMetrics[];
  systemMetrics: SystemMetrics;
  timeSeriesData: TimeSeriesData[];
  platform: string;
  theme: 'light' | 'dark';
  timeRange: '1h' | '24h' | '7d' | '30d';
  onTimeRangeChange: (range: '1h' | '24h' | '7d' | '30d') => void;
  onRefresh: () => void;
  onExportData: () => void;
}

type MetricSort = 'name' | 'executions' | 'successRate' | 'avgTime' | 'errorRate' | 'performance';

export function ToolAnalyticsDashboard({
  toolMetrics,
  systemMetrics,
  timeSeriesData,
  platform,
  theme,
  timeRange,
  onTimeRangeChange,
  onRefresh,
  onExportData
}: ToolAnalyticsDashboardProps) {
  const [sortBy, setSortBy] = useState<MetricSort>('executions');
  const [sortAscending, setSortAscending] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});

  // Sort and filter tool metrics
  const sortedMetrics = useMemo(() => {
    let filtered = [...toolMetrics];

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(tool => tool.category === selectedCategory);
    }

    // Sort metrics
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
          comparison = (a.successfulExecutions / a.totalExecutions) - (b.successfulExecutions / b.totalExecutions);
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
  }, [toolMetrics, sortBy, sortAscending, selectedCategory]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(toolMetrics.map(tool => tool.category));
    return ['all', ...Array.from(cats)];
  }, [toolMetrics]);

  const formatExecutionTime = (time: number) => {
    if (time < 1000) return `${time}ms`;
    return `${(time / 1000).toFixed(1)}s`;
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getPerformanceColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-3 h-3 text-green-400" />;
      case 'down': return <TrendingDown className="w-3 h-3 text-red-400" />;
      default: return <Activity className="w-3 h-3 text-gray-400" />;
    }
  };

  const toggleDetails = (toolName: string) => {
    setShowDetails(prev => ({
      ...prev,
      [toolName]: !prev[toolName]
    }));
  };

  const handleSort = (metric: MetricSort) => {
    if (sortBy === metric) {
      setSortAscending(!sortAscending);
    } else {
      setSortBy(metric);
      setSortAscending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className={cn("text-lg font-semibold", ThemeUtils.getTextClass(platform, theme))}>
            Tool Analytics
          </h3>
          
          {/* Time Range Selector */}
          <div className="flex items-center gap-1 border rounded-lg p-1">
            {(['1h', '24h', '7d', '30d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className={cn(
                  "px-3 py-1 text-xs rounded transition-colors",
                  timeRange === range
                    ? "bg-blue-500/20 text-blue-300"
                    : cn(
                        "hover:bg-white/10",
                        ThemeUtils.getTextClass(platform, theme, 'secondary')
                      )
                )}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className={cn(
              "p-2 rounded hover:bg-white/10 transition-colors",
              ThemeUtils.getTextClass(platform, theme, 'secondary')
            )}
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          
          <button
            onClick={onExportData}
            className={cn(
              "p-2 rounded hover:bg-white/10 transition-colors",
              ThemeUtils.getTextClass(platform, theme, 'secondary')
            )}
            title="Export Data"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={cn(
          "p-4 rounded-lg border",
          ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
          ThemeUtils.getBorderClass(platform, theme)
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-blue-400" />
            <span className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
              Active Tools
            </span>
          </div>
          <div className={cn("text-2xl font-bold", ThemeUtils.getTextClass(platform, theme))}>
            {systemMetrics.activeTools}
          </div>
          <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
            of {systemMetrics.totalTools} total
          </div>
        </div>

        <div className={cn(
          "p-4 rounded-lg border",
          ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
          ThemeUtils.getBorderClass(platform, theme)
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-green-400" />
            <span className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
              Success Rate
            </span>
          </div>
          <div className={cn("text-2xl font-bold text-green-400")}>
            {formatPercentage(systemMetrics.successRate)}
          </div>
          <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
            {systemMetrics.totalExecutions} executions
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
              Avg Response
            </span>
          </div>
          <div className={cn("text-2xl font-bold", ThemeUtils.getTextClass(platform, theme))}>
            {formatExecutionTime(systemMetrics.averageResponseTime)}
          </div>
          <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
            Peak: {systemMetrics.peakUsageHour}:00
          </div>
        </div>

        <div className={cn(
          "p-4 rounded-lg border",
          ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
          ThemeUtils.getBorderClass(platform, theme)
        )}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-purple-400" />
            <span className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
              Most Used
            </span>
          </div>
          <div className={cn("text-lg font-bold", ThemeUtils.getTextClass(platform, theme))}>
            {systemMetrics.mostUsedTool.substring(0, 12)}
          </div>
          <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
            Top performer
          </div>
        </div>
      </div>

      {/* Key Insights */}
      <div className={cn(
        "p-4 rounded-lg border",
        ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
        ThemeUtils.getBorderClass(platform, theme)
      )}>
        <h4 className={cn("font-medium mb-3", ThemeUtils.getTextClass(platform, theme))}>
          Key Insights
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
            <div>
              <div className={cn("font-medium text-sm", ThemeUtils.getTextClass(platform, theme))}>
                Most Reliable Tool
              </div>
              <div className={cn("text-sm", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                {systemMetrics.mostReliableTool} has the highest success rate
              </div>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
            <div>
              <div className={cn("font-medium text-sm", ThemeUtils.getTextClass(platform, theme))}>
                Needs Attention
              </div>
              <div className={cn("text-sm", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                {systemMetrics.errorProneTool} has high error rate
              </div>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-yellow-400 mt-0.5" />
            <div>
              <div className={cn("font-medium text-sm", ThemeUtils.getTextClass(platform, theme))}>
                Performance Issue
              </div>
              <div className={cn("text-sm", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                {systemMetrics.slowestTool} is slower than average
              </div>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-blue-400 mt-0.5" />
            <div>
              <div className={cn("font-medium text-sm", ThemeUtils.getTextClass(platform, theme))}>
                Usage Trend
              </div>
              <div className={cn("text-sm", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                Tool usage increased 15% this week
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tool Metrics Table */}
      <div className={cn(
        "border rounded-lg overflow-hidden",
        ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
        ThemeUtils.getBorderClass(platform, theme)
      )}>
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h4 className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
              Tool Performance Metrics
            </h4>
            
            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className={cn(
                  "px-3 py-1 text-sm rounded border",
                  ThemeUtils.getInputClass(platform, theme)
                )}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-7 gap-4 p-3 border-b border-white/10 text-xs font-medium">
          <button
            onClick={() => handleSort('name')}
            className={cn(
              "text-left hover:text-blue-400 transition-colors",
              ThemeUtils.getTextClass(platform, theme, 'secondary')
            )}
          >
            Tool Name {sortBy === 'name' && (sortAscending ? '↑' : '↓')}
          </button>
          <button
            onClick={() => handleSort('executions')}
            className={cn(
              "text-center hover:text-blue-400 transition-colors",
              ThemeUtils.getTextClass(platform, theme, 'secondary')
            )}
          >
            Executions {sortBy === 'executions' && (sortAscending ? '↑' : '↓')}
          </button>
          <button
            onClick={() => handleSort('successRate')}
            className={cn(
              "text-center hover:text-blue-400 transition-colors",
              ThemeUtils.getTextClass(platform, theme, 'secondary')
            )}
          >
            Success Rate {sortBy === 'successRate' && (sortAscending ? '↑' : '↓')}
          </button>
          <button
            onClick={() => handleSort('avgTime')}
            className={cn(
              "text-center hover:text-blue-400 transition-colors",
              ThemeUtils.getTextClass(platform, theme, 'secondary')
            )}
          >
            Avg Time {sortBy === 'avgTime' && (sortAscending ? '↑' : '↓')}
          </button>
          <button
            onClick={() => handleSort('errorRate')}
            className={cn(
              "text-center hover:text-blue-400 transition-colors",
              ThemeUtils.getTextClass(platform, theme, 'secondary')
            )}
          >
            Error Rate {sortBy === 'errorRate' && (sortAscending ? '↑' : '↓')}
          </button>
          <button
            onClick={() => handleSort('performance')}
            className={cn(
              "text-center hover:text-blue-400 transition-colors",
              ThemeUtils.getTextClass(platform, theme, 'secondary')
            )}
          >
            Performance {sortBy === 'performance' && (sortAscending ? '↑' : '↓')}
          </button>
          <div className={cn("text-center", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
            Trend
          </div>
        </div>

        {/* Table Body */}
        <div className="max-h-96 overflow-y-auto">
          {sortedMetrics.map((tool) => (
            <div key={tool.name}>
              <div className="grid grid-cols-7 gap-4 p-3 border-b border-white/10 hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleDetails(tool.name)}
                    className={cn(
                      "p-0.5 rounded hover:bg-white/10 transition-colors",
                      ThemeUtils.getTextClass(platform, theme, 'secondary')
                    )}
                  >
                    {showDetails[tool.name] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  <span className={cn("text-sm font-medium", ThemeUtils.getTextClass(platform, theme))}>
                    {tool.name}
                  </span>
                </div>
                
                <div className={cn("text-center text-sm", ThemeUtils.getTextClass(platform, theme))}>
                  {tool.totalExecutions}
                </div>
                
                <div className="text-center">
                  <span className={cn(
                    "text-sm",
                    tool.successfulExecutions / tool.totalExecutions >= 0.9 ? "text-green-400" : 
                    tool.successfulExecutions / tool.totalExecutions >= 0.7 ? "text-yellow-400" : "text-red-400"
                  )}>
                    {formatPercentage((tool.successfulExecutions / tool.totalExecutions) * 100)}
                  </span>
                </div>
                
                <div className={cn("text-center text-sm", ThemeUtils.getTextClass(platform, theme))}>
                  {formatExecutionTime(tool.averageExecutionTime)}
                </div>
                
                <div className="text-center">
                  <span className={cn(
                    "text-sm",
                    tool.errorRate < 5 ? "text-green-400" : 
                    tool.errorRate < 15 ? "text-yellow-400" : "text-red-400"
                  )}>
                    {formatPercentage(tool.errorRate)}
                  </span>
                </div>
                
                <div className="text-center">
                  <span className={cn("text-sm font-medium", getPerformanceColor(tool.performanceScore))}>
                    {tool.performanceScore}
                  </span>
                </div>
                
                <div className="flex justify-center">
                  {getTrendIcon(tool.trend)}
                </div>
              </div>

              {/* Detailed Metrics */}
              <AnimatePresence>
                {showDetails[tool.name] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden bg-white/5"
                  >
                    <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                          Min Execution Time
                        </div>
                        <div className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                          {formatExecutionTime(tool.minExecutionTime)}
                        </div>
                      </div>
                      <div>
                        <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                          Max Execution Time
                        </div>
                        <div className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                          {formatExecutionTime(tool.maxExecutionTime)}
                        </div>
                      </div>
                      <div>
                        <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                          Usage Frequency
                        </div>
                        <div className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                          {tool.usageFrequency.toFixed(1)}/day
                        </div>
                      </div>
                      <div>
                        <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                          Category
                        </div>
                        <div className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
                          {tool.category}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}