/**
 * Unit tests for Tool Executor with Security Validation
 * Requirements: 10.2, 10.4, 16.2, 16.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolExecutor } from '../ToolExecutor.js';
import { ToolRegistry } from '../../registry/ToolRegistry.js';
import {
  ToolDefinition,
  ToolHandler,
  SecurityLevel,
  ExecutionStatus,
  ToolExecutionRequest,
  ExecutionContext
} from '../../types/index.js';

describe('ToolExecutor', () => {
  let executor: ToolExecutor;
  let registry: ToolRegistry;
  let mockHandler: ToolHandler;

  const validToolDefinition: ToolDefinition = {
    name: 'test_tool',
    description: 'A test tool for unit testing',
    version: '1.0.0',
    category: 'system',
    securityLevel: SecurityLevel.MEDIUM,
    parameters: {
      input: {
        type: 'string',
        required: true,
        description: 'Input parameter',
        pattern: '^[a-zA-Z0-9\\s]+$'
      },
      count: {
        type: 'number',
        required: false,
        minimum: 1,
        maximum: 100
      }
    },
    permissions: ['tool.execute'],
    timeout: 5000,
    retryable: true
  };

  const validExecutionContext: ExecutionContext = {
    userId: 'test_user',
    sessionId: 'test_session',
    timestamp: new Date().toISOString(),
    permissions: ['tool.execute']
  };

  const validExecutionRequest: ToolExecutionRequest = {
    toolName: 'test_tool',
    parameters: {
      input: 'test input',
      count: 5
    },
    executionId: 'test_execution_123',
    context: validExecutionContext
  };

  beforeEach(async () => {
    registry = new ToolRegistry();
    executor = new ToolExecutor(registry, {
      maxConcurrentExecutions: 5,
      defaultTimeout: 10000,
      enableAuditLogging: true,
      securityValidation: true,
      parameterSanitization: true
    });

    mockHandler = vi.fn().mockResolvedValue({ success: true, data: 'test result' });
    await registry.registerTool(validToolDefinition, mockHandler);
  });

  afterEach(() => {
    executor.destroy();
    registry.destroy();
  });

  describe('Tool Execution', () => {
    it('should execute a valid tool successfully', async () => {
      const result = await executor.executeToolSafe(validExecutionRequest);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.result).toEqual({ success: true, data: 'test result' });
      expect(result.executionId).toBe('test_execution_123');
      expect(result.toolName).toBe('test_tool');
      expect(result.executionTime).toBeGreaterThan(0);
      expect(mockHandler).toHaveBeenCalledWith(
        validExecutionRequest.parameters,
        validExecutionRequest.context
      );
    });

    it('should generate execution ID if not provided', async () => {
      const requestWithoutId = { ...validExecutionRequest };
      delete requestWithoutId.executionId;

      const result = await executor.executeToolSafe(requestWithoutId);

      expect(result.executionId).toBeDefined();
      expect(result.executionId).toMatch(/^[a-f0-9-]+$/);
    });

    it('should handle tool execution errors gracefully', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Tool execution failed'));
      await registry.updateTool('test_tool', validToolDefinition, errorHandler);

      const result = await executor.executeToolSafe(validExecutionRequest);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Tool execution failed');
      expect(result.error?.code).toBe('Error');
      expect(result.error?.recoverable).toBe(false);
    });

    it('should enforce execution timeout', async () => {
      const slowHandler = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 10000))
      );
      await registry.updateTool('test_tool', validToolDefinition, slowHandler);

      const requestWithTimeout = {
        ...validExecutionRequest,
        timeout: 100
      };

      const result = await executor.executeToolSafe(requestWithTimeout);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error?.message).toContain('timed out');
    });
  });

  describe('Security Validation', () => {
    it('should validate execution request schema', async () => {
      const invalidRequest = {
        ...validExecutionRequest,
        toolName: '', // Invalid empty tool name
      };

      const result = await executor.executeToolSafe(invalidRequest);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error?.message).toContain('validation failed');
    });

    it('should check tool availability', async () => {
      const requestForNonExistentTool = {
        ...validExecutionRequest,
        toolName: 'non_existent_tool'
      };

      const result = await executor.executeToolSafe(requestForNonExistentTool);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error?.message).toContain('is not registered');
    });

    it('should validate user permissions', async () => {
      const requestWithoutPermissions = {
        ...validExecutionRequest,
        context: {
          ...validExecutionContext,
          permissions: [] // No permissions
        }
      };

      const result = await executor.executeToolSafe(requestWithoutPermissions);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error?.message).toContain('Insufficient permissions');
    });

    it('should enforce critical security level requirements', async () => {
      const criticalTool: ToolDefinition = {
        ...validToolDefinition,
        name: 'critical_tool',
        securityLevel: SecurityLevel.CRITICAL,
        permissions: ['tool.execute', 'system.access', 'admin.override']
      };

      await registry.registerTool(criticalTool, mockHandler);

      const requestWithoutUserId = {
        ...validExecutionRequest,
        toolName: 'critical_tool',
        context: {
          ...validExecutionContext,
          userId: undefined,
          permissions: ['tool.execute', 'system.access', 'admin.override']
        }
      };

      const result = await executor.executeToolSafe(requestWithoutUserId);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error?.message).toContain('User identification required');
    });

    it('should enforce concurrent execution limits', async () => {
      // Create executor with very low concurrency limit
      const limitedExecutor = new ToolExecutor(registry, {
        maxConcurrentExecutions: 1, // Only allow 1 concurrent execution
        defaultTimeout: 10000
      });

      let resolveFirst: () => void;
      const firstPromise = new Promise<void>(resolve => { resolveFirst = resolve; });
      
      const blockingHandler = vi.fn().mockImplementation(async () => {
        await firstPromise; // Block until we release it
        return { success: true };
      });
      
      await registry.updateTool('test_tool', validToolDefinition, blockingHandler);

      // Start first execution (will block)
      const firstExecution = limitedExecutor.executeToolSafe({
        ...validExecutionRequest,
        executionId: 'execution_0'
      });

      // Wait a bit to ensure first execution has started
      await new Promise(resolve => setTimeout(resolve, 10));

      // Try to start more executions while first is blocked
      const secondExecution = limitedExecutor.executeToolSafe({
        ...validExecutionRequest,
        executionId: 'execution_1'
      });

      const thirdExecution = limitedExecutor.executeToolSafe({
        ...validExecutionRequest,
        executionId: 'execution_2'
      });

      // Wait a bit more to ensure they hit the concurrency limit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Now release the first execution
      resolveFirst!();

      const results = await Promise.all([firstExecution, secondExecution, thirdExecution]);
      
      // First should succeed, others should fail due to concurrency limits
      const failedResults = results.filter(r => r.status === ExecutionStatus.FAILED);
      const successResults = results.filter(r => r.status === ExecutionStatus.SUCCESS);
      
      expect(failedResults.length).toBeGreaterThan(0);
      expect(successResults.length).toBeGreaterThan(0);
      
      const concurrencyErrors = failedResults.filter(r => 
        r.error?.message.includes('Maximum concurrent executions')
      );
      expect(concurrencyErrors.length).toBeGreaterThan(0);
      
      limitedExecutor.destroy();
    });
  });

  describe('Parameter Sanitization', () => {
    it('should sanitize string parameters', async () => {
      const requestWithUnsafeString = {
        ...validExecutionRequest,
        parameters: {
          input: 'test input with spaces', // Valid input that will pass pattern validation
          count: 5
        }
      };

      const result = await executor.executeToolSafe(requestWithUnsafeString);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          input: 'test input with spaces',
          count: 5
        }),
        expect.any(Object)
      );
    });

    it('should reject parameters with XSS content that fail pattern validation', async () => {
      const requestWithXSS = {
        ...validExecutionRequest,
        parameters: {
          input: 'test<script>alert("xss")</script>input', // Contains invalid characters
          count: 5
        }
      };

      const result = await executor.executeToolSafe(requestWithXSS);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error?.message).toContain('does not match required pattern');
    });

    it('should validate numeric parameter bounds', async () => {
      const requestWithInvalidNumber = {
        ...validExecutionRequest,
        parameters: {
          input: 'test input',
          count: 150 // Above maximum of 100
        }
      };

      const result = await executor.executeToolSafe(requestWithInvalidNumber);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error?.message).toContain('above maximum');
    });

    it('should validate string patterns', async () => {
      const requestWithInvalidPattern = {
        ...validExecutionRequest,
        parameters: {
          input: 'test@#$%input', // Contains invalid characters
          count: 5
        }
      };

      const result = await executor.executeToolSafe(requestWithInvalidPattern);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error?.message).toContain('does not match required pattern');
    });

    it('should handle nested object sanitization', async () => {
      const toolWithNestedParams: ToolDefinition = {
        ...validToolDefinition,
        name: 'nested_tool',
        parameters: {
          config: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                pattern: '^[a-zA-Z]+$'
              },
              value: {
                type: 'number',
                minimum: 0,
                maximum: 10
              }
            }
          }
        }
      };

      await registry.registerTool(toolWithNestedParams, mockHandler);

      const requestWithNestedParams = {
        ...validExecutionRequest,
        toolName: 'nested_tool',
        parameters: {
          config: {
            name: 'test<script>',
            value: 5
          }
        }
      };

      await executor.executeToolSafe(requestWithNestedParams);

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            name: 'testscript', // Script tag removed
            value: 5
          })
        }),
        expect.any(Object)
      );
    });
  });

  describe('Tool Chain Execution', () => {
    beforeEach(async () => {
      const tool2: ToolDefinition = {
        ...validToolDefinition,
        name: 'test_tool_2'
      };
      
      const handler2 = vi.fn().mockImplementation((params, context) => {
        const previousResult = context.environment?.test_tool_result;
        return { success: true, data: `processed: ${previousResult?.data}` };
      });

      await registry.registerTool(tool2, handler2);
    });

    it('should execute tool chain with context passing', async () => {
      const requests = [
        validExecutionRequest,
        {
          ...validExecutionRequest,
          toolName: 'test_tool_2',
          executionId: 'test_execution_456'
        }
      ];

      const results = await executor.executeToolChain(requests);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe(ExecutionStatus.SUCCESS);
      expect(results[1].status).toBe(ExecutionStatus.SUCCESS);
      expect(results[1].result.data).toContain('processed: test result');
    });

    it('should stop chain execution on failure', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('First tool failed'));
      await registry.updateTool('test_tool', validToolDefinition, errorHandler);

      const requests = [
        validExecutionRequest,
        {
          ...validExecutionRequest,
          toolName: 'test_tool_2',
          executionId: 'test_execution_456'
        }
      ];

      const results = await executor.executeToolChain(requests);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe(ExecutionStatus.FAILED);
    });
  });

  describe('Execution Management', () => {
    it('should track active executions', async () => {
      const slowHandler = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 200))
      );
      await registry.updateTool('test_tool', validToolDefinition, slowHandler);

      const executionPromise = executor.executeToolSafe(validExecutionRequest);
      
      // Wait a bit to ensure execution has started
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Check that execution is tracked
      const activeExecutions = executor.getActiveExecutions();
      expect(activeExecutions).toContain('test_execution_123');

      await executionPromise;

      // Check that execution is no longer tracked
      const activeExecutionsAfter = executor.getActiveExecutions();
      expect(activeExecutionsAfter).not.toContain('test_execution_123');
    });

    it('should store and retrieve execution context', async () => {
      const slowHandler = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 200))
      );
      await registry.updateTool('test_tool', validToolDefinition, slowHandler);

      const executionPromise = executor.executeToolSafe(validExecutionRequest);
      
      // Wait a bit to ensure execution has started
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Check that context is stored
      const context = executor.getExecutionContext('test_execution_123');
      expect(context).toEqual(validExecutionContext);

      await executionPromise;

      // Check that context is cleaned up
      const contextAfter = executor.getExecutionContext('test_execution_123');
      expect(contextAfter).toBeUndefined();
    });

    it('should cancel running executions', async () => {
      const slowHandler = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 1000))
      );
      await registry.updateTool('test_tool', validToolDefinition, slowHandler);

      const executionPromise = executor.executeToolSafe(validExecutionRequest);
      
      // Wait a bit to ensure execution has started
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Cancel the execution
      const cancelled = await executor.cancelExecution('test_execution_123');
      expect(cancelled).toBe(true);

      // Check that execution is no longer tracked
      const activeExecutions = executor.getActiveExecutions();
      expect(activeExecutions).not.toContain('test_execution_123');
    });
  });

  describe('Audit Logging', () => {
    it('should log successful executions', async () => {
      await executor.executeToolSafe(validExecutionRequest);

      const auditLog = executor.getAuditLog();
      expect(auditLog.length).toBeGreaterThanOrEqual(2); // execute + success

      const executeEntry = auditLog.find(entry => entry.action === 'execute');
      const successEntry = auditLog.find(entry => entry.action === 'success');

      expect(executeEntry).toBeDefined();
      expect(executeEntry?.toolName).toBe('test_tool');
      expect(executeEntry?.userId).toBe('test_user');

      expect(successEntry).toBeDefined();
      expect(successEntry?.toolName).toBe('test_tool');
    });

    it('should log failed executions', async () => {
      // Test with invalid tool name to trigger failure
      const invalidRequest = {
        ...validExecutionRequest,
        toolName: 'non_existent_tool'
      };

      const result = await executor.executeToolSafe(invalidRequest);
      
      expect(result.status).toBe(ExecutionStatus.FAILED);

      const auditLog = executor.getAuditLog();
      const failureEntry = auditLog.find(entry => entry.action === 'failure');

      expect(failureEntry).toBeDefined();
      expect(failureEntry?.error?.message).toContain('is not registered');
    });

    it('should filter audit log entries', async () => {
      await executor.executeToolSafe(validExecutionRequest);

      const filteredLog = executor.getAuditLog({
        toolName: 'test_tool',
        userId: 'test_user',
        action: 'success'
      });

      expect(filteredLog.length).toBeGreaterThan(0);
      filteredLog.forEach(entry => {
        expect(entry.toolName).toBe('test_tool');
        expect(entry.userId).toBe('test_user');
        expect(entry.action).toBe('success');
      });
    });

    it('should clear audit log', async () => {
      await executor.executeToolSafe(validExecutionRequest);
      
      expect(executor.getAuditLog().length).toBeGreaterThan(0);
      
      executor.clearAuditLog();
      
      expect(executor.getAuditLog().length).toBe(0);
    });

    it('should emit audit events', async () => {
      const auditSpy = vi.fn();
      executor.on('audit_log', auditSpy);

      await executor.executeToolSafe(validExecutionRequest);

      expect(auditSpy).toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          executionId: 'test_execution_123',
          toolName: 'test_tool',
          action: expect.any(String)
        })
      );
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should provide recovery suggestions for different error types', async () => {
      const timeoutHandler = vi.fn().mockRejectedValue(new Error('Operation timeout'));
      await registry.updateTool('test_tool', validToolDefinition, timeoutHandler);

      const result = await executor.executeToolSafe(validExecutionRequest);

      expect(result.error?.suggestedActions).toContain('Increase timeout value');
    });

    it('should identify recoverable errors', async () => {
      const recoverableHandler = vi.fn().mockRejectedValue(new Error('NETWORK_ERROR: Connection failed'));
      await registry.updateTool('test_tool', validToolDefinition, recoverableHandler);

      const result = await executor.executeToolSafe(validExecutionRequest);

      expect(result.error?.recoverable).toBe(true);
    });

    it('should handle unknown error types', async () => {
      const unknownErrorHandler = vi.fn().mockRejectedValue('Unknown error string');
      await registry.updateTool('test_tool', validToolDefinition, unknownErrorHandler);

      const result = await executor.executeToolSafe(validExecutionRequest);

      expect(result.error?.code).toBe('UNKNOWN_ERROR');
      expect(result.error?.message).toBe('Unknown error string');
    });
  });

  describe('Configuration', () => {
    it('should respect disabled security validation', async () => {
      const unsecureExecutor = new ToolExecutor(registry, {
        securityValidation: false
      });

      const requestWithoutPermissions = {
        ...validExecutionRequest,
        context: {
          ...validExecutionContext,
          permissions: []
        }
      };

      const result = await unsecureExecutor.executeToolSafe(requestWithoutPermissions);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      
      unsecureExecutor.destroy();
    });

    it('should respect disabled parameter sanitization', async () => {
      const unsanitizedExecutor = new ToolExecutor(registry, {
        parameterSanitization: false
      });

      const requestWithUnsafeString = {
        ...validExecutionRequest,
        parameters: {
          input: 'test<script>alert("xss")</script>input',
          count: 5
        }
      };

      await unsanitizedExecutor.executeToolSafe(requestWithUnsafeString);

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          input: 'test<script>alert("xss")</script>input' // Not sanitized
        }),
        expect.any(Object)
      );
      
      unsanitizedExecutor.destroy();
    });

    it('should respect disabled audit logging', async () => {
      const unloggedExecutor = new ToolExecutor(registry, {
        enableAuditLogging: false
      });

      await unloggedExecutor.executeToolSafe(validExecutionRequest);

      expect(unloggedExecutor.getAuditLog().length).toBe(0);
      
      unloggedExecutor.destroy();
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup resources on destroy', async () => {
      const slowHandler = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 1000))
      );
      await registry.updateTool('test_tool', validToolDefinition, slowHandler);

      executor.executeToolSafe(validExecutionRequest);
      
      // Wait a bit to ensure execution has started
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(executor.getActiveExecutions().length).toBeGreaterThan(0);
      
      executor.destroy();
      
      expect(executor.getActiveExecutions().length).toBe(0);
      expect(executor.getAuditLog().length).toBe(0);
    });
  });
});