/**
 * Tool Execution Status Component Tests
 * Requirements: 9.2, 9.3
 * 
 * Unit tests for tool execution status display components
 * Tests real-time progress updates and status indicators
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToolExecutionStatus, ToolCall, ToolCallResult, ToolExecutionProgress } from '../ToolExecutionStatus';

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
  Wrench: () => <div data-testid="wrench-icon" />,
  CheckCircle: () => <div data-testid="check-circle-icon" />,
  XCircle: () => <div data-testid="x-circle-icon" />,
  Clock: () => <div data-testid="clock-icon" />,
  Loader2: () => <div data-testid="loader-icon" />,
  AlertTriangle: () => <div data-testid="alert-triangle-icon" />,
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
  ChevronUp: () => <div data-testid="chevron-up-icon" />,
  Play: () => <div data-testid="play-icon" />,
  Pause: () => <div data-testid="pause-icon" />,
}));

describe('ToolExecutionStatus', () => {
  const mockToolCalls: ToolCall[] = [
    {
      id: 'tool-1',
      name: 'test_tool',
      parameters: { param1: 'value1', param2: 'value2' },
      status: 'running'
    },
    {
      id: 'tool-2',
      name: 'another_tool',
      parameters: { param3: 'value3' },
      status: 'pending'
    }
  ];

  const mockToolResults: ToolCallResult[] = [
    {
      id: 'tool-1',
      name: 'test_tool',
      result: { success: true, data: 'test result' },
      executionTime: 1500,
      status: 'success'
    }
  ];

  const mockProgress: ToolExecutionProgress = {
    type: 'tool_call',
    content: 'Executing tools...',
    toolCalls: mockToolCalls,
    toolResults: mockToolResults,
    isComplete: false
  };

  const defaultProps = {
    isExecuting: false,
    currentToolCalls: [],
    currentToolResults: [],
    platform: 'win32',
    theme: 'dark' as const
  };

  it('renders nothing when no tools are executing or completed', () => {
    const { container } = render(<ToolExecutionStatus {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('displays compact view correctly', () => {
    render(
      <ToolExecutionStatus
        {...defaultProps}
        isExecuting={true}
        currentToolCalls={mockToolCalls}
        compact={true}
      />
    );

    expect(screen.getByTestId('wrench-icon')).toBeInTheDocument();
    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    expect(screen.getByText(/Executing 2 tools/)).toBeInTheDocument();
  });

  it('displays completed tools in compact view', () => {
    render(
      <ToolExecutionStatus
        {...defaultProps}
        isExecuting={false}
        currentToolResults={mockToolResults}
        compact={true}
      />
    );

    expect(screen.getByTestId('check-circle-icon')).toBeInTheDocument();
    expect(screen.getByText(/Completed 1 tool/)).toBeInTheDocument();
  });

  it('displays detailed view with tool information', () => {
    render(
      <ToolExecutionStatus
        {...defaultProps}
        isExecuting={true}
        currentToolCalls={mockToolCalls}
        currentToolResults={mockToolResults}
        progress={mockProgress}
        showDetails={true}
      />
    );

    expect(screen.getByText('Tool Execution')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('🔧 Executing tools...')).toBeInTheDocument();
    expect(screen.getByText('test_tool')).toBeInTheDocument();
    expect(screen.getByText('another_tool')).toBeInTheDocument();
  });

  it('shows progress bar during execution', () => {
    render(
      <ToolExecutionStatus
        {...defaultProps}
        isExecuting={true}
        currentToolCalls={mockToolCalls}
        currentToolResults={mockToolResults}
        progress={mockProgress}
      />
    );

    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('displays tool parameters correctly', () => {
    render(
      <ToolExecutionStatus
        {...defaultProps}
        currentToolCalls={mockToolCalls}
        showDetails={true}
      />
    );

    expect(screen.getByText(/param1: value1, param2: value2/)).toBeInTheDocument();
    expect(screen.getByText(/param3: value3/)).toBeInTheDocument();
  });

  it('shows execution time for completed tools', () => {
    render(
      <ToolExecutionStatus
        {...defaultProps}
        currentToolCalls={mockToolCalls}
        currentToolResults={mockToolResults}
        showDetails={true}
      />
    );

    expect(screen.getByText('1.5s')).toBeInTheDocument();
  });

  it('displays error information for failed tools', () => {
    const failedResult: ToolCallResult = {
      id: 'tool-2',
      name: 'another_tool',
      result: null,
      error: 'Tool execution failed',
      executionTime: 500,
      status: 'error'
    };

    render(
      <ToolExecutionStatus
        {...defaultProps}
        currentToolCalls={mockToolCalls}
        currentToolResults={[...mockToolResults, failedResult]}
        showDetails={true}
      />
    );

    expect(screen.getByTestId('alert-triangle-icon')).toBeInTheDocument();
    expect(screen.getByText('Tool execution failed')).toBeInTheDocument();
  });

  it('handles toggle details functionality', () => {
    const mockToggle = vi.fn();
    
    render(
      <ToolExecutionStatus
        {...defaultProps}
        currentToolCalls={mockToolCalls}
        showDetails={false}
        onToggleDetails={mockToggle}
      />
    );

    const toggleButton = screen.getByTestId('chevron-down-icon').closest('button');
    expect(toggleButton).toBeInTheDocument();
    
    fireEvent.click(toggleButton!);
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it('shows different progress types correctly', () => {
    const thinkingProgress: ToolExecutionProgress = {
      type: 'thinking',
      content: 'Planning...',
      isComplete: false
    };

    const { rerender } = render(
      <ToolExecutionStatus
        {...defaultProps}
        isExecuting={true}
        progress={thinkingProgress}
      />
    );

    expect(screen.getByText('💭 Planning tool execution...')).toBeInTheDocument();

    const responseProgress: ToolExecutionProgress = {
      type: 'response',
      content: 'Generating response...',
      isComplete: false
    };

    rerender(
      <ToolExecutionStatus
        {...defaultProps}
        isExecuting={true}
        progress={responseProgress}
      />
    );

    expect(screen.getByText('💬 Generating response...')).toBeInTheDocument();
  });

  it('formats long parameter values correctly', () => {
    const longParamTool: ToolCall = {
      id: 'tool-long',
      name: 'long_param_tool',
      parameters: {
        shortParam: 'short',
        longParam: 'this is a very long parameter value that should be truncated'
      }
    };

    render(
      <ToolExecutionStatus
        {...defaultProps}
        currentToolCalls={[longParamTool]}
        showDetails={true}
      />
    );

    expect(screen.getByText(/longParam: this is a very long \.\.\./)).toBeInTheDocument();
  });

  it('handles empty parameters correctly', () => {
    const emptyParamTool: ToolCall = {
      id: 'tool-empty',
      name: 'empty_param_tool',
      parameters: {}
    };

    render(
      <ToolExecutionStatus
        {...defaultProps}
        currentToolCalls={[emptyParamTool]}
        showDetails={true}
      />
    );

    expect(screen.getByText('No parameters')).toBeInTheDocument();
  });

  it('applies correct status colors', () => {
    const { container } = render(
      <ToolExecutionStatus
        {...defaultProps}
        currentToolCalls={mockToolCalls}
        currentToolResults={mockToolResults}
        showDetails={true}
      />
    );

    // Check for status-specific styling classes
    const runningTool = container.querySelector('[class*="border-blue-400"]');
    expect(runningTool).toBeInTheDocument();
  });

  it('truncates long result content', () => {
    const longResult: ToolCallResult = {
      id: 'tool-long-result',
      name: 'long_result_tool',
      result: 'A'.repeat(150), // Long result that should be truncated
      executionTime: 1000,
      status: 'success'
    };

    const longResultTool: ToolCall = {
      id: 'tool-long-result',
      name: 'long_result_tool',
      parameters: {}
    };

    render(
      <ToolExecutionStatus
        {...defaultProps}
        currentToolCalls={[longResultTool]}
        currentToolResults={[longResult]}
        showDetails={true}
      />
    );

    const resultText = screen.getByText(/A{100}\.\.\.$/);
    expect(resultText).toBeInTheDocument();
  });
});