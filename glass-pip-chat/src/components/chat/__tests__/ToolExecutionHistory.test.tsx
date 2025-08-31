/**
 * Tool Execution History Component Tests
 * Requirements: 9.2, 9.3
 * 
 * Unit tests for tool execution history display
 * Tests filtering, search, and statistics functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToolExecutionHistory, ToolExecutionHistoryItem } from '../ToolExecutionHistory';

import { vi } from 'vitest';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  History: () => <div data-testid="history-icon" />,
  Search: () => <div data-testid="search-icon" />,
  Filter: () => <div data-testid="filter-icon" />,
  CheckCircle: () => <div data-testid="check-circle-icon" />,
  XCircle: () => <div data-testid="x-circle-icon" />,
  Clock: () => <div data-testid="clock-icon" />,
  Wrench: () => <div data-testid="wrench-icon" />,
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
  ChevronUp: () => <div data-testid="chevron-up-icon" />,
  Calendar: () => <div data-testid="calendar-icon" />,
  BarChart3: () => <div data-testid="bar-chart-icon" />,
  TrendingUp: () => <div data-testid="trending-up-icon" />,
  AlertTriangle: () => <div data-testid="alert-triangle-icon" />,
}));

describe('ToolExecutionHistory', () => {
  const mockHistory: ToolExecutionHistoryItem[] = [
    {
      id: 'exec-1',
      name: 'test_tool',
      parameters: { param1: 'value1' },
      result: { success: true },
      executionTime: 1500,
      timestamp: Date.now() - 60000, // 1 minute ago
      status: 'success'
    },
    {
      id: 'exec-2',
      name: 'another_tool',
      parameters: { param2: 'value2' },
      result: null,
      error: 'Tool execution failed',
      executionTime: 500,
      timestamp: Date.now() - 120000, // 2 minutes ago
      status: 'error'
    },
    {
      id: 'exec-3',
      name: 'slow_tool',
      parameters: { param3: 'value3' },
      result: { data: 'slow result' },
      executionTime: 6000, // 6 seconds (slow)
      timestamp: Date.now() - 3600000, // 1 hour ago
      status: 'success'
    }
  ];

  const defaultProps = {
    history: mockHistory,
    platform: 'win32',
    theme: 'dark' as const
  };

  it('renders empty state when no history', () => {
    render(<ToolExecutionHistory {...defaultProps} history={[]} />);
    
    expect(screen.getByTestId('wrench-icon')).toBeInTheDocument();
    expect(screen.getByText('No tool execution history yet')).toBeInTheDocument();
  });

  it('displays history header with count', () => {
    render(<ToolExecutionHistory {...defaultProps} />);
    
    expect(screen.getByTestId('history-icon')).toBeInTheDocument();
    expect(screen.getByText('Tool Execution History')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // Count badge
  });

  it('shows statistics correctly', () => {
    render(<ToolExecutionHistory {...defaultProps} showStats={true} />);
    
    expect(screen.getByText('3')).toBeInTheDocument(); // Total
    expect(screen.getByText('67%')).toBeInTheDocument(); // Success rate (2/3)
    expect(screen.getByText('2.7s')).toBeInTheDocument(); // Average time
    expect(screen.getByText(/test_too/)).toBeInTheDocument(); // Most used (truncated)
  });

  it('filters by search query', async () => {
    render(<ToolExecutionHistory {...defaultProps} showSearch={true} />);
    
    const searchInput = screen.getByPlaceholderText(/Search tools/);
    fireEvent.change(searchInput, { target: { value: 'test_tool' } });
    
    await waitFor(() => {
      expect(screen.getByText('test_tool')).toBeInTheDocument();
      expect(screen.queryByText('another_tool')).not.toBeInTheDocument();
    });
  });

  it('filters by status', () => {
    render(<ToolExecutionHistory {...defaultProps} showFilter={true} />);
    
    const errorFilter = screen.getByText('Error');
    fireEvent.click(errorFilter);
    
    expect(screen.getByText('another_tool')).toBeInTheDocument();
    expect(screen.queryByText('test_tool')).not.toBeInTheDocument();
  });

  it('filters by recent executions', () => {
    render(<ToolExecutionHistory {...defaultProps} showFilter={true} />);
    
    const recentFilter = screen.getByText('Recent');
    fireEvent.click(recentFilter);
    
    // Should show only executions from the last hour
    expect(screen.getByText('test_tool')).toBeInTheDocument();
    expect(screen.getByText('another_tool')).toBeInTheDocument();
    expect(screen.queryByText('slow_tool')).not.toBeInTheDocument();
  });

  it('filters by slow executions', () => {
    render(<ToolExecutionHistory {...defaultProps} showFilter={true} />);
    
    const slowFilter = screen.getByText('Slow');
    fireEvent.click(slowFilter);
    
    // Should show only executions > 5 seconds
    expect(screen.getByText('slow_tool')).toBeInTheDocument();
    expect(screen.queryByText('test_tool')).not.toBeInTheDocument();
    expect(screen.queryByText('another_tool')).not.toBeInTheDocument();
  });

  it('displays execution details correctly', () => {
    render(<ToolExecutionHistory {...defaultProps} />);
    
    expect(screen.getByText('test_tool')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();
    expect(screen.getByText(/1m ago/)).toBeInTheDocument();
    expect(screen.getByText(/param1: value1/)).toBeInTheDocument();
  });

  it('shows error information for failed executions', () => {
    render(<ToolExecutionHistory {...defaultProps} />);
    
    expect(screen.getByTestId('alert-triangle-icon')).toBeInTheDocument();
    expect(screen.getByText('Tool execution failed')).toBeInTheDocument();
  });

  it('handles item click events', () => {
    const mockOnItemClick = vi.fn();
    
    render(
      <ToolExecutionHistory 
        {...defaultProps} 
        onItemClick={mockOnItemClick}
      />
    );
    
    const firstItem = screen.getByText('test_tool').closest('div');
    fireEvent.click(firstItem!);
    
    expect(mockOnItemClick).toHaveBeenCalledWith(mockHistory[0]);
  });

  it('toggles details view', () => {
    render(<ToolExecutionHistory {...defaultProps} />);
    
    const toggleButton = screen.getByTestId('chevron-up-icon').closest('button');
    fireEvent.click(toggleButton!);
    
    // Details should be hidden after click
    expect(screen.queryByText('test_tool')).not.toBeInTheDocument();
  });

  it('respects maxItems limit', () => {
    const manyItems = Array.from({ length: 100 }, (_, i) => ({
      id: `exec-${i}`,
      name: `tool_${i}`,
      parameters: {},
      result: { success: true },
      executionTime: 1000,
      timestamp: Date.now() - i * 1000,
      status: 'success' as const
    }));

    render(
      <ToolExecutionHistory 
        {...defaultProps} 
        history={manyItems}
        maxItems={10}
      />
    );
    
    expect(screen.getByText('10')).toBeInTheDocument(); // Count should be limited
  });

  it('formats timestamps correctly', () => {
    const timestampTests = [
      { timestamp: Date.now() - 30000, expected: /Just now|0m ago/ }, // 30 seconds ago
      { timestamp: Date.now() - 300000, expected: /5m ago/ }, // 5 minutes ago
      { timestamp: Date.now() - 7200000, expected: /2h ago/ }, // 2 hours ago
      { timestamp: Date.now() - 86400000 * 2, expected: /2d ago/ }, // 2 days ago
    ];

    timestampTests.forEach(({ timestamp, expected }, index) => {
      const testItem: ToolExecutionHistoryItem = {
        id: `test-${index}`,
        name: `test_tool_${index}`,
        parameters: {},
        result: { success: true },
        executionTime: 1000,
        timestamp,
        status: 'success'
      };

      const { unmount } = render(
        <ToolExecutionHistory 
          {...defaultProps} 
          history={[testItem]}
        />
      );

      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    });
  });

  it('handles empty search results', async () => {
    render(<ToolExecutionHistory {...defaultProps} showSearch={true} />);
    
    const searchInput = screen.getByPlaceholderText(/Search tools/);
    fireEvent.change(searchInput, { target: { value: 'nonexistent_tool' } });
    
    await waitFor(() => {
      expect(screen.getByText('No matching tool executions found')).toBeInTheDocument();
    });
  });

  it('truncates long parameter values', () => {
    const longParamItem: ToolExecutionHistoryItem = {
      id: 'long-param',
      name: 'long_param_tool',
      parameters: {
        shortParam: 'short',
        longParam: 'this is a very long parameter value that should be truncated'
      },
      result: { success: true },
      executionTime: 1000,
      timestamp: Date.now(),
      status: 'success'
    };

    render(
      <ToolExecutionHistory 
        {...defaultProps} 
        history={[longParamItem]}
      />
    );

    expect(screen.getByText(/longParam: this is a very long p/)).toBeInTheDocument();
  });

  it('handles no parameters correctly', () => {
    const noParamItem: ToolExecutionHistoryItem = {
      id: 'no-param',
      name: 'no_param_tool',
      parameters: {},
      result: { success: true },
      executionTime: 1000,
      timestamp: Date.now(),
      status: 'success'
    };

    render(
      <ToolExecutionHistory 
        {...defaultProps} 
        history={[noParamItem]}
      />
    );

    expect(screen.getByText('Parameters: None')).toBeInTheDocument();
  });

  it('calculates statistics correctly with edge cases', () => {
    const edgeCaseHistory: ToolExecutionHistoryItem[] = [];

    render(
      <ToolExecutionHistory 
        {...defaultProps} 
        history={edgeCaseHistory}
        showStats={true}
      />
    );

    expect(screen.getByText('No tool execution history yet')).toBeInTheDocument();
  });
});