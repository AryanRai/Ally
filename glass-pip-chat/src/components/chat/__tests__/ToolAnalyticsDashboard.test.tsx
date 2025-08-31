/**
 * Tool Analytics Dashboard Integration Tests
 * Requirements: 18.4, 18.5
 * 
 * Integration tests for tool analytics dashboard functionality
 * Tests metrics display, sorting, filtering, and trend analysis
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToolAnalyticsDashboard, ToolMetrics, SystemMetrics, TimeSeriesData } from '../ToolAnalyticsDashboard';

import { vi } from 'vitest';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  BarChart3: () => <div data-testid="bar-chart-icon" />,
  TrendingUp: () => <div data-testid="trending-up-icon" />,
  TrendingDown: () => <div data-testid="trending-down-icon" />,
  Activity: () => <div data-testid="activity-icon" />,
  Clock: () => <div data-testid="clock-icon" />,
  CheckCircle: () => <div data-testid="check-circle-icon" />,
  XCircle: () => <div data-testid="x-circle-icon" />,
  Zap: () => <div data-testid="zap-icon" />,
  AlertTriangle: () => <div data-testid="alert-triangle-icon" />,
  Target: () => <div data-testid="target-icon" />,
  Calendar: () => <div data-testid="calendar-icon" />,
  Filter: () => <div data-testid="filter-icon" />,
  Download: () => <div data-testid="download-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
  Info: () => <div data-testid="info-icon" />,
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
  ChevronUp: () => <div data-testid="chevron-up-icon" />,
}));

describe('ToolAnalyticsDashboard', () => {
  const mockToolMetrics: ToolMetrics[] = [
    {
      name: 'fast_tool',
      totalExecutions: 100,
      successfulExecutions: 95,
      failedExecutions: 5,
      averageExecutionTime: 500,
      minExecutionTime: 200,
      maxExecutionTime: 1000,
      lastExecutionTime: Date.now() - 60000,
      usageFrequency: 10.5,
      errorRate: 5,
      performanceScore: 90,
      trend: 'up',
      category: 'utility'
    },
    {
      name: 'slow_tool',
      totalExecutions: 50,
      successfulExecutions: 30,
      failedExecutions: 20,
      averageExecutionTime: 5000,
      minExecutionTime: 3000,
      maxExecutionTime: 8000,
      lastExecutionTime: Date.now() - 120000,
      usageFrequency: 2.1,
      errorRate: 40,
      performanceScore: 45,
      trend: 'down',
      category: 'processing'
    },
    {
      name: 'stable_tool',
      totalExecutions: 75,
      successfulExecutions: 70,
      failedExecutions: 5,
      averageExecutionTime: 1500,
      minExecutionTime: 1000,
      maxExecutionTime: 2000,
      lastExecutionTime: Date.now() - 30000,
      usageFrequency: 5.2,
      errorRate: 6.7,
      performanceScore: 75,
      trend: 'stable',
      category: 'utility'
    }
  ];

  const mockSystemMetrics: SystemMetrics = {
    totalTools: 10,
    activeTools: 8,
    totalExecutions: 225,
    successRate: 86.7,
    averageResponseTime: 1800,
    peakUsageHour: 14,
    mostReliableTool: 'fast_tool',
    slowestTool: 'slow_tool',
    mostUsedTool: 'fast_tool',
    errorProneTool: 'slow_tool'
  };

  const mockTimeSeriesData: TimeSeriesData[] = [
    {
      timestamp: Date.now() - 3600000,
      executions: 50,
      successRate: 85,
      averageTime: 1600,
      errors: 7
    },
    {
      timestamp: Date.now() - 1800000,
      executions: 75,
      successRate: 88,
      averageTime: 1700,
      errors: 9
    },
    {
      timestamp: Date.now(),
      executions: 100,
      successRate: 87,
      averageTime: 1800,
      errors: 13
    }
  ];

  const defaultProps = {
    toolMetrics: mockToolMetrics,
    systemMetrics: mockSystemMetrics,
    timeSeriesData: mockTimeSeriesData,
    platform: 'win32',
    theme: 'dark' as const,
    timeRange: '24h' as const,
    onTimeRangeChange: vi.fn(),
    onRefresh: vi.fn(),
    onExportData: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders analytics dashboard with header', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    expect(screen.getByText('Tool Analytics')).toBeInTheDocument();
    expect(screen.getByTestId('refresh-icon')).toBeInTheDocument();
    expect(screen.getByTestId('download-icon')).toBeInTheDocument();
  });

  it('displays time range selector', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.getByText('24h')).toBeInTheDocument();
    expect(screen.getByText('7d')).toBeInTheDocument();
    expect(screen.getByText('30d')).toBeInTheDocument();
  });

  it('changes time range when clicked', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    fireEvent.click(screen.getByText('7d'));
    
    expect(defaultProps.onTimeRangeChange).toHaveBeenCalledWith('7d');
  });

  it('displays system overview metrics', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    expect(screen.getByText('Active Tools')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('of 10 total')).toBeInTheDocument();
    
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('86.7%')).toBeInTheDocument();
    expect(screen.getByText('225 executions')).toBeInTheDocument();
    
    expect(screen.getByText('Avg Response')).toBeInTheDocument();
    expect(screen.getByText('1.8s')).toBeInTheDocument();
    expect(screen.getByText('Peak: 14:00')).toBeInTheDocument();
    
    expect(screen.getByText('Most Used')).toBeInTheDocument();
    expect(screen.getByText(/fast_tool/)).toBeInTheDocument();
  });

  it('displays key insights section', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    expect(screen.getByText('Key Insights')).toBeInTheDocument();
    expect(screen.getByText('Most Reliable Tool')).toBeInTheDocument();
    expect(screen.getByText(/fast_tool has the highest success rate/)).toBeInTheDocument();
    
    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
    expect(screen.getByText(/slow_tool has high error rate/)).toBeInTheDocument();
    
    expect(screen.getByText('Performance Issue')).toBeInTheDocument();
    expect(screen.getByText(/slow_tool is slower than average/)).toBeInTheDocument();
  });

  it('displays tool metrics table with sortable headers', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    expect(screen.getByText('Tool Performance Metrics')).toBeInTheDocument();
    
    // Check table headers
    expect(screen.getByText(/Tool Name/)).toBeInTheDocument();
    expect(screen.getByText(/Executions/)).toBeInTheDocument();
    expect(screen.getByText(/Success Rate/)).toBeInTheDocument();
    expect(screen.getByText(/Avg Time/)).toBeInTheDocument();
    expect(screen.getByText(/Error Rate/)).toBeInTheDocument();
    expect(screen.getByText(/Performance/)).toBeInTheDocument();
    expect(screen.getByText(/Trend/)).toBeInTheDocument();
  });

  it('sorts tools by executions by default', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    const toolNames = screen.getAllByText(/fast_tool|slow_tool|stable_tool/);
    // Should be sorted by executions descending: fast_tool (100), stable_tool (75), slow_tool (50)
    expect(toolNames[0]).toHaveTextContent('fast_tool');
  });

  it('sorts tools when header is clicked', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    // Click on Success Rate header
    fireEvent.click(screen.getByText(/Success Rate/));
    
    // Should sort by success rate
    const toolNames = screen.getAllByText(/fast_tool|slow_tool|stable_tool/);
    expect(toolNames[0]).toHaveTextContent('fast_tool'); // Highest success rate
  });

  it('filters tools by category', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    // Find and change category filter
    const categorySelect = screen.getByDisplayValue('All');
    fireEvent.change(categorySelect, { target: { value: 'utility' } });
    
    expect(screen.getByText('fast_tool')).toBeInTheDocument();
    expect(screen.getByText('stable_tool')).toBeInTheDocument();
    expect(screen.queryByText('slow_tool')).not.toBeInTheDocument();
  });

  it('displays correct performance colors', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    // fast_tool should have green color (score 90)
    const fastToolScore = screen.getByText('90');
    expect(fastToolScore).toHaveClass('text-green-400');
    
    // slow_tool should have red color (score 45)
    const slowToolScore = screen.getByText('45');
    expect(slowToolScore).toHaveClass('text-red-400');
    
    // stable_tool should have yellow color (score 75)
    const stableToolScore = screen.getByText('75');
    expect(stableToolScore).toHaveClass('text-yellow-400');
  });

  it('displays trend icons correctly', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    expect(screen.getByTestId('trending-up-icon')).toBeInTheDocument(); // fast_tool
    expect(screen.getByTestId('trending-down-icon')).toBeInTheDocument(); // slow_tool
    expect(screen.getByTestId('activity-icon')).toBeInTheDocument(); // stable_tool
  });

  it('expands tool details when chevron is clicked', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    // Click chevron to expand details
    const chevronButton = screen.getAllByTestId('chevron-down-icon')[0].closest('button');
    fireEvent.click(chevronButton!);
    
    // Should show detailed metrics
    expect(screen.getByText('Min Execution Time')).toBeInTheDocument();
    expect(screen.getByText('Max Execution Time')).toBeInTheDocument();
    expect(screen.getByText('Usage Frequency')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
  });

  it('displays detailed metrics correctly when expanded', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    // Expand first tool (fast_tool)
    const chevronButton = screen.getAllByTestId('chevron-down-icon')[0].closest('button');
    fireEvent.click(chevronButton!);
    
    expect(screen.getByText('200ms')).toBeInTheDocument(); // Min time
    expect(screen.getByText('1.0s')).toBeInTheDocument(); // Max time
    expect(screen.getByText('10.5/day')).toBeInTheDocument(); // Usage frequency
    expect(screen.getByText('utility')).toBeInTheDocument(); // Category
  });

  it('handles refresh action', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    const refreshButton = screen.getByTestId('refresh-icon').closest('button');
    fireEvent.click(refreshButton!);
    
    expect(defaultProps.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('handles export data action', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    const exportButton = screen.getByTestId('download-icon').closest('button');
    fireEvent.click(exportButton!);
    
    expect(defaultProps.onExportData).toHaveBeenCalledTimes(1);
  });

  it('formats execution times correctly', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    expect(screen.getByText('500ms')).toBeInTheDocument(); // fast_tool
    expect(screen.getByText('5.0s')).toBeInTheDocument(); // slow_tool
    expect(screen.getByText('1.5s')).toBeInTheDocument(); // stable_tool
  });

  it('formats percentages correctly', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    expect(screen.getByText('95.0%')).toBeInTheDocument(); // fast_tool success rate
    expect(screen.getByText('60.0%')).toBeInTheDocument(); // slow_tool success rate
    expect(screen.getByText('93.3%')).toBeInTheDocument(); // stable_tool success rate
  });

  it('displays error rates with appropriate colors', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    // fast_tool error rate (5%) should be green
    const fastToolError = screen.getByText('5.0%');
    expect(fastToolError).toHaveClass('text-green-400');
    
    // slow_tool error rate (40%) should be red
    const slowToolError = screen.getByText('40.0%');
    expect(slowToolError).toHaveClass('text-red-400');
  });

  it('handles empty tool metrics', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} toolMetrics={[]} />);
    
    expect(screen.getByText('Tool Performance Metrics')).toBeInTheDocument();
    // Should still show headers but no tool rows
    expect(screen.getByText(/Tool Name/)).toBeInTheDocument();
  });

  it('toggles sort direction when same header clicked twice', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    const executionsHeader = screen.getByText(/Executions/);
    
    // First click - should show descending indicator
    fireEvent.click(executionsHeader);
    expect(executionsHeader).toHaveTextContent('↓');
    
    // Second click - should show ascending indicator
    fireEvent.click(executionsHeader);
    expect(executionsHeader).toHaveTextContent('↑');
  });

  it('displays usage trend information', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} />);
    
    expect(screen.getByText('Tool usage increased 15% this week')).toBeInTheDocument();
  });

  it('shows correct time range selection', () => {
    render(<ToolAnalyticsDashboard {...defaultProps} timeRange="7d" />);
    
    const sevenDayButton = screen.getByText('7d');
    expect(sevenDayButton).toHaveClass('bg-blue-500/20');
  });
});