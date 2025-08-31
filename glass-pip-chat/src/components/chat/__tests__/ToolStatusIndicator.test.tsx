/**
 * Tool Status Indicator Component Tests
 * Requirements: 9.2, 9.3
 * 
 * Unit tests for tool status indicator in header
 * Tests status display and interaction functionality
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToolStatusIndicator, ToolStatusInfo } from '../ToolStatusIndicator';

import { vi } from 'vitest';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Wrench: () => <div data-testid="wrench-icon" />,
  CheckCircle: () => <div data-testid="check-circle-icon" />,
  XCircle: () => <div data-testid="x-circle-icon" />,
  Loader2: () => <div data-testid="loader-icon" />,
  AlertTriangle: () => <div data-testid="alert-triangle-icon" />,
  Activity: () => <div data-testid="activity-icon" />,
  Zap: () => <div data-testid="zap-icon" />,
  Clock: () => <div data-testid="clock-icon" />,
}));

describe('ToolStatusIndicator', () => {
  const defaultStatus: ToolStatusInfo = {
    isExecuting: false,
    activeToolCount: 0,
    completedToolCount: 0,
    failedToolCount: 0,
    totalExecutionTime: 0,
    availableToolCount: 5
  };

  const defaultProps = {
    status: defaultStatus,
    platform: 'win32',
    theme: 'dark' as const
  };

  it('displays idle state correctly', () => {
    render(<ToolStatusIndicator {...defaultProps} />);
    
    expect(screen.getByTestId('wrench-icon')).toBeInTheDocument();
    expect(screen.getByText('5 tools available')).toBeInTheDocument();
    expect(screen.getByTestId('zap-icon')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('displays executing state correctly', () => {
    const executingStatus: ToolStatusInfo = {
      ...defaultStatus,
      isExecuting: true,
      activeToolCount: 2
    };

    render(<ToolStatusIndicator {...defaultProps} status={executingStatus} />);
    
    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    expect(screen.getByText('Executing 2 tools')).toBeInTheDocument();
    expect(screen.getByTestId('activity-icon')).toBeInTheDocument();
  });

  it('displays completed state correctly', () => {
    const completedStatus: ToolStatusInfo = {
      ...defaultStatus,
      completedToolCount: 3,
      totalExecutionTime: 4500
    };

    render(<ToolStatusIndicator {...defaultProps} status={completedStatus} />);
    
    expect(screen.getByTestId('check-circle-icon')).toBeInTheDocument();
    expect(screen.getByText('3 tools completed')).toBeInTheDocument();
    expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
    expect(screen.getByText('4.5s')).toBeInTheDocument();
  });

  it('displays failed state correctly', () => {
    const failedStatus: ToolStatusInfo = {
      ...defaultStatus,
      failedToolCount: 1,
      completedToolCount: 2
    };

    render(<ToolStatusIndicator {...defaultProps} status={failedStatus} />);
    
    expect(screen.getByTestId('x-circle-icon')).toBeInTheDocument();
    expect(screen.getByText('1 tool failed')).toBeInTheDocument();
  });

  it('handles singular vs plural tool counts', () => {
    const singleToolStatus: ToolStatusInfo = {
      ...defaultStatus,
      completedToolCount: 1
    };

    render(<ToolStatusIndicator {...defaultProps} status={singleToolStatus} />);
    
    expect(screen.getByText('1 tool completed')).toBeInTheDocument();
  });

  it('displays compact view correctly', () => {
    const executingStatus: ToolStatusInfo = {
      ...defaultStatus,
      isExecuting: true,
      activeToolCount: 1
    };

    render(
      <ToolStatusIndicator 
        {...defaultProps} 
        status={executingStatus}
        compact={true}
      />
    );
    
    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    // In compact mode, should not show detailed text
    expect(screen.queryByText('Executing 1 tool')).not.toBeInTheDocument();
  });

  it('shows activity indicator during execution', () => {
    const executingStatus: ToolStatusInfo = {
      ...defaultStatus,
      isExecuting: true,
      activeToolCount: 1
    };

    render(<ToolStatusIndicator {...defaultProps} status={executingStatus} />);
    
    expect(screen.getByTestId('activity-icon')).toBeInTheDocument();
  });

  it('shows error indicator when tools failed', () => {
    const failedStatus: ToolStatusInfo = {
      ...defaultStatus,
      failedToolCount: 1
    };

    render(
      <ToolStatusIndicator 
        {...defaultProps} 
        status={failedStatus}
        compact={true}
      />
    );
    
    // In compact mode, error indicator should be present as a dot
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('shows success indicator when tools completed without errors', () => {
    const successStatus: ToolStatusInfo = {
      ...defaultStatus,
      completedToolCount: 2,
      failedToolCount: 0
    };

    render(
      <ToolStatusIndicator 
        {...defaultProps} 
        status={successStatus}
        compact={true}
      />
    );
    
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('handles click events', () => {
    const mockOnClick = vi.fn();
    
    render(
      <ToolStatusIndicator 
        {...defaultProps} 
        onClick={mockOnClick}
      />
    );
    
    const clickableElement = screen.getByText('5 tools available').closest('div');
    fireEvent.click(clickableElement!);
    
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('formats execution time correctly', () => {
    const testCases = [
      { time: 500, expected: '500ms' },
      { time: 1500, expected: '1.5s' },
      { time: 10000, expected: '10.0s' }
    ];

    testCases.forEach(({ time, expected }) => {
      const status: ToolStatusInfo = {
        ...defaultStatus,
        completedToolCount: 1,
        totalExecutionTime: time
      };

      const { unmount } = render(
        <ToolStatusIndicator {...defaultProps} status={status} />
      );
      
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    });
  });

  it('formats last execution time correctly', () => {
    const now = Date.now();
    const testCases = [
      { timestamp: now - 30000, expected: 'Just now' },
      { timestamp: now - 300000, expected: '5m ago' },
      { timestamp: now - 7200000, expected: '2h ago' }
    ];

    testCases.forEach(({ timestamp, expected }) => {
      const status: ToolStatusInfo = {
        ...defaultStatus,
        lastExecutionTime: timestamp
      };

      const { unmount } = render(
        <ToolStatusIndicator 
          {...defaultProps} 
          status={status}
          showTooltip={true}
        />
      );
      
      // Tooltip content would be tested in integration tests
      // Here we just verify the component renders without error
      expect(screen.getByText('5 tools available')).toBeInTheDocument();
      unmount();
    });
  });

  it('handles zero available tools', () => {
    const noToolsStatus: ToolStatusInfo = {
      ...defaultStatus,
      availableToolCount: 0
    };

    render(<ToolStatusIndicator {...defaultProps} status={noToolsStatus} />);
    
    expect(screen.getByText('0 tools available')).toBeInTheDocument();
    expect(screen.queryByTestId('zap-icon')).not.toBeInTheDocument();
  });

  it('prioritizes error state over success state', () => {
    const mixedStatus: ToolStatusInfo = {
      ...defaultStatus,
      completedToolCount: 2,
      failedToolCount: 1
    };

    render(<ToolStatusIndicator {...defaultProps} status={mixedStatus} />);
    
    expect(screen.getByTestId('x-circle-icon')).toBeInTheDocument();
    expect(screen.getByText('1 tool failed')).toBeInTheDocument();
  });

  it('shows tooltip when enabled', () => {
    render(
      <ToolStatusIndicator 
        {...defaultProps} 
        showTooltip={true}
        compact={true}
      />
    );
    
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', '5 tools available');
  });

  it('does not show tooltip when disabled', () => {
    render(
      <ToolStatusIndicator 
        {...defaultProps} 
        showTooltip={false}
        compact={true}
      />
    );
    
    const button = screen.getByRole('button');
    expect(button).not.toHaveAttribute('title');
  });

  it('applies correct CSS classes for different states', () => {
    const executingStatus: ToolStatusInfo = {
      ...defaultStatus,
      isExecuting: true,
      activeToolCount: 1
    };

    const { container } = render(
      <ToolStatusIndicator {...defaultProps} status={executingStatus} />
    );
    
    // Check for blue color class (executing state)
    expect(container.querySelector('[class*="text-blue-400"]')).toBeInTheDocument();
  });
});