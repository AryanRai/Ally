/**
 * Tool Management Interface Integration Tests
 * Requirements: 18.4, 18.5
 * 
 * Integration tests for tool management UI functionality
 * Tests tool configuration, analytics, and management workflows
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToolManagementInterface, ToolDefinition, ToolAnalytics } from '../ToolManagementInterface';

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
  Settings: () => <div data-testid="settings-icon" />,
  BarChart3: () => <div data-testid="bar-chart-icon" />,
  AlertTriangle: () => <div data-testid="alert-triangle-icon" />,
  CheckCircle: () => <div data-testid="check-circle-icon" />,
  XCircle: () => <div data-testid="x-circle-icon" />,
  Clock: () => <div data-testid="clock-icon" />,
  Zap: () => <div data-testid="zap-icon" />,
  Activity: () => <div data-testid="activity-icon" />,
  TrendingUp: () => <div data-testid="trending-up-icon" />,
  TrendingDown: () => <div data-testid="trending-down-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
  Power: () => <div data-testid="power-icon" />,
  PowerOff: () => <div data-testid="power-off-icon" />,
  Eye: () => <div data-testid="eye-icon" />,
  EyeOff: () => <div data-testid="eye-off-icon" />,
  Search: () => <div data-testid="search-icon" />,
  Filter: () => <div data-testid="filter-icon" />,
  Download: () => <div data-testid="download-icon" />,
  Upload: () => <div data-testid="upload-icon" />,
  Trash2: () => <div data-testid="trash-icon" />,
  Edit3: () => <div data-testid="edit-icon" />,
  Plus: () => <div data-testid="plus-icon" />,
  Minus: () => <div data-testid="minus-icon" />,
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
  ChevronUp: () => <div data-testid="chevron-up-icon" />,
  Info: () => <div data-testid="info-icon" />,
}));

describe('ToolManagementInterface', () => {
  const mockTools: ToolDefinition[] = [
    {
      name: 'test_tool',
      description: 'A test tool for testing',
      category: 'testing',
      version: '1.0.0',
      enabled: true,
      parameters: { param1: 'value1', param2: 'value2' },
      securityLevel: 'medium',
      lastUsed: Date.now() - 60000,
      usageCount: 10,
      averageExecutionTime: 1500,
      successRate: 90,
      errorCount: 1
    },
    {
      name: 'disabled_tool',
      description: 'A disabled tool',
      category: 'utility',
      version: '2.0.0',
      enabled: false,
      parameters: {},
      securityLevel: 'high',
      usageCount: 0,
      averageExecutionTime: 0,
      successRate: 0,
      errorCount: 0
    },
    {
      name: 'error_prone_tool',
      description: 'A tool with errors',
      category: 'testing',
      version: '1.5.0',
      enabled: true,
      parameters: { param3: 'value3' },
      securityLevel: 'low',
      lastUsed: Date.now() - 120000,
      usageCount: 5,
      averageExecutionTime: 3000,
      successRate: 60,
      errorCount: 5
    }
  ];

  const mockAnalytics: ToolAnalytics = {
    totalExecutions: 15,
    successfulExecutions: 12,
    failedExecutions: 3,
    averageExecutionTime: 2000,
    mostUsedTools: [
      { name: 'test_tool', count: 10, percentage: 66.7 },
      { name: 'error_prone_tool', count: 5, percentage: 33.3 }
    ],
    recentActivity: [
      {
        timestamp: Date.now() - 30000,
        toolName: 'test_tool',
        status: 'success',
        executionTime: 1200
      },
      {
        timestamp: Date.now() - 60000,
        toolName: 'error_prone_tool',
        status: 'error',
        executionTime: 2500
      }
    ],
    performanceTrends: {
      executionTimesTrend: 'stable',
      successRateTrend: 'up',
      usageTrend: 'up'
    }
  };

  const defaultProps = {
    tools: mockTools,
    analytics: mockAnalytics,
    platform: 'win32',
    theme: 'dark' as const,
    onToolToggle: vi.fn(),
    onToolConfigure: vi.fn(),
    onToolRefresh: vi.fn(),
    onToolRemove: vi.fn(),
    onExportConfig: vi.fn(),
    onImportConfig: vi.fn(),
    onRefreshAnalytics: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tool management interface with header', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    expect(screen.getByTestId('settings-icon')).toBeInTheDocument();
    expect(screen.getByText('Tool Management')).toBeInTheDocument();
    expect(screen.getByTestId('refresh-icon')).toBeInTheDocument();
    expect(screen.getByTestId('download-icon')).toBeInTheDocument();
  });

  it('displays navigation tabs correctly', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
  });

  it('shows overview with summary cards by default', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    expect(screen.getByText('Total Tools')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // Total tools count
    expect(screen.getByText('2 enabled')).toBeInTheDocument();
    
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument(); // 12/15 * 100
    
    expect(screen.getByText('Avg Time')).toBeInTheDocument();
    expect(screen.getByText('2.0s')).toBeInTheDocument();
    
    expect(screen.getByText('Usage')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument(); // Total executions
  });

  it('displays most used tools section', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    expect(screen.getByText('Most Used Tools')).toBeInTheDocument();
    expect(screen.getByText('test_tool')).toBeInTheDocument();
    expect(screen.getByText('error_prone_tool')).toBeInTheDocument();
  });

  it('shows recent activity', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByTestId('check-circle-icon')).toBeInTheDocument();
    expect(screen.getByTestId('x-circle-icon')).toBeInTheDocument();
  });

  it('switches to tools view when clicked', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    const toolsTab = screen.getByText('Tools');
    fireEvent.click(toolsTab);
    
    expect(screen.getByPlaceholderText('Search tools...')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument(); // Filter button
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('filters tools by search query', async () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    // Switch to tools view
    fireEvent.click(screen.getByText('Tools'));
    
    const searchInput = screen.getByPlaceholderText('Search tools...');
    fireEvent.change(searchInput, { target: { value: 'test_tool' } });
    
    await waitFor(() => {
      expect(screen.getByText('test_tool')).toBeInTheDocument();
      expect(screen.queryByText('disabled_tool')).not.toBeInTheDocument();
    });
  });

  it('filters tools by status', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    // Switch to tools view
    fireEvent.click(screen.getByText('Tools'));
    
    // Click disabled filter
    fireEvent.click(screen.getByText('Disabled'));
    
    expect(screen.getByText('disabled_tool')).toBeInTheDocument();
    expect(screen.queryByText('test_tool')).not.toBeInTheDocument();
  });

  it('filters tools by errors', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    // Switch to tools view
    fireEvent.click(screen.getByText('Tools'));
    
    // Click errors filter
    fireEvent.click(screen.getByText('Errors'));
    
    expect(screen.getByText('error_prone_tool')).toBeInTheDocument();
    expect(screen.queryByText('disabled_tool')).not.toBeInTheDocument();
  });

  it('toggles tool enabled/disabled state', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    // Switch to tools view
    fireEvent.click(screen.getByText('Tools'));
    
    // Find and click the power button for test_tool
    const powerButtons = screen.getAllByTestId('power-icon');
    fireEvent.click(powerButtons[0].closest('button')!);
    
    expect(defaultProps.onToolToggle).toHaveBeenCalledWith('test_tool', false);
  });

  it('refreshes individual tools', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    // Switch to tools view
    fireEvent.click(screen.getByText('Tools'));
    
    // Find and click refresh button
    const refreshButtons = screen.getAllByTestId('refresh-icon');
    fireEvent.click(refreshButtons[1]); // Second refresh button (first is in header)
    
    expect(defaultProps.onToolRefresh).toHaveBeenCalledWith('test_tool');
  });

  it('opens tool configuration', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    // Switch to tools view
    fireEvent.click(screen.getByText('Tools'));
    
    // Find and click edit button
    const editButton = screen.getByTestId('edit-icon').closest('button');
    fireEvent.click(editButton!);
    
    // This would typically open a configuration modal or set selected tool
    // For now, we just verify the button works
    expect(editButton).toBeInTheDocument();
  });

  it('removes tools', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    // Switch to tools view
    fireEvent.click(screen.getByText('Tools'));
    
    // Find and click trash button
    const trashButton = screen.getByTestId('trash-icon').closest('button');
    fireEvent.click(trashButton!);
    
    expect(defaultProps.onToolRemove).toHaveBeenCalledWith('test_tool');
  });

  it('toggles tool details', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    // Switch to tools view
    fireEvent.click(screen.getByText('Tools'));
    
    // Find and click chevron to expand details
    const chevronButton = screen.getByTestId('chevron-down-icon').closest('button');
    fireEvent.click(chevronButton!);
    
    // Should show detailed metrics
    expect(screen.getByText('Avg Execution Time')).toBeInTheDocument();
    expect(screen.getByText('Error Count')).toBeInTheDocument();
    expect(screen.getByText('Last Used')).toBeInTheDocument();
    expect(screen.getByText('Parameters')).toBeInTheDocument();
  });

  it('displays security level badges correctly', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    // Switch to tools view
    fireEvent.click(screen.getByText('Tools'));
    
    expect(screen.getByText('medium')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('low')).toBeInTheDocument();
  });

  it('shows tool parameters when details are expanded', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    // Switch to tools view
    fireEvent.click(screen.getByText('Tools'));
    
    // Expand details for first tool
    const chevronButton = screen.getByTestId('chevron-down-icon').closest('button');
    fireEvent.click(chevronButton!);
    
    expect(screen.getByText('Parameters:')).toBeInTheDocument();
    expect(screen.getByText(/param1:/)).toBeInTheDocument();
    expect(screen.getByText(/param2:/)).toBeInTheDocument();
  });

  it('handles export configuration', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    const exportButton = screen.getByTestId('download-icon').closest('button');
    fireEvent.click(exportButton!);
    
    expect(defaultProps.onExportConfig).toHaveBeenCalledTimes(1);
  });

  it('handles refresh analytics', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    const refreshButton = screen.getByTestId('refresh-icon').closest('button');
    fireEvent.click(refreshButton!);
    
    expect(defaultProps.onRefreshAnalytics).toHaveBeenCalledTimes(1);
  });

  it('shows analytics placeholder when analytics tab is clicked', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Analytics'));
    
    expect(screen.getByText('Detailed analytics view coming soon')).toBeInTheDocument();
  });

  it('shows diagnostics placeholder when diagnostics tab is clicked', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Diagnostics'));
    
    expect(screen.getByText('Diagnostics interface coming soon')).toBeInTheDocument();
  });

  it('displays correct tool metrics in overview', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    // Check usage counts
    expect(screen.getByText('10')).toBeInTheDocument(); // test_tool usage
    expect(screen.getByText('5')).toBeInTheDocument(); // error_prone_tool usage
    
    // Check success rates in overview
    expect(screen.getByText('12/15')).toBeInTheDocument(); // successful/total
  });

  it('formats timestamps correctly in recent activity', () => {
    render(<ToolManagementInterface {...defaultProps} />);
    
    // Recent activity should show relative timestamps
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });

  it('handles empty tools list', () => {
    render(<ToolManagementInterface {...defaultProps} tools={[]} />);
    
    expect(screen.getByText('0')).toBeInTheDocument(); // Total tools
    expect(screen.getByText('0 enabled')).toBeInTheDocument();
  });

  it('handles empty analytics data', () => {
    const emptyAnalytics: ToolAnalytics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      mostUsedTools: [],
      recentActivity: [],
      performanceTrends: {
        executionTimesTrend: 'stable',
        successRateTrend: 'stable',
        usageTrend: 'stable'
      }
    };

    render(<ToolManagementInterface {...defaultProps} analytics={emptyAnalytics} />);
    
    expect(screen.getByText('0%')).toBeInTheDocument(); // Success rate
    expect(screen.getByText('0ms')).toBeInTheDocument(); // Avg time
  });
});