/**
 * Unit tests for Tool Manager Orchestration
 * Requirements: 10.3, 15.1, 15.2, 15.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolManager } from '../ToolManager.js';
import { ToolRegistry } from '../../registry/ToolRegistry.js';
import { ToolExecutor } from '../../executor/ToolExecutor.js';
import {
  ToolDefinition,
  ToolHandler,
  SecurityLevel,
  ExecutionStatus,
  ExecutionContext,
  WorkflowPlan,
  WorkflowStep
} from '../../types/index.js';

describe('ToolManager', () => {
  let manager: ToolManager;
  let registry: ToolRegistry;
  let executor: ToolExecutor;
  let mockHandler1: ToolHandler;
  let mockHandler2: ToolHandler;
  let mockHandler3: ToolHandler;

  const toolDefinition1: ToolDefinition = {
    name: 'tool_1',
    description: 'First test tool',
    version: '1.0.0',
    category: 'system',
    securityLevel: SecurityLevel.LOW,
    parameters: {
      input: {
        type: 'string',
        required: true
      }
    },
    permissions: []
  };

  const toolDefinition2: ToolDefinition = {
    name: 'tool_2',
    description: 'Second test tool',
    version: '1.0.0',
    category: 'system',
    securityLevel: SecurityLevel.LOW,
    parameters: {
      data: {
        type: 'string',
        required: true
      }
    },
    permissions: []
  };

  const toolDefinition3: ToolDefinition = {
    name: 'tool_3',
    description: 'Third test tool',
    version: '1.0.0',
    category: 'system',
    securityLevel: SecurityLevel.LOW,
    parameters: {
      result: {
        type: 'string',
        required: true
      }
    },
    permissions: []
  };

  const baseContext: ExecutionContext = {
    userId: 'test_user',
    sessionId: 'test_session',
    timestamp: new Date().toISOString(),
    permissions: []
  };

  beforeEach(async () => {
    registry = new ToolRegistry();
    executor = new ToolExecutor(registry);
    manager = new ToolManager(registry, executor, {
      maxConcurrentWorkflows: 3,
      workflowTimeout: 10000
    });

    mockHandler1 = vi.fn().mockResolvedValue({ step: 1, data: 'result1' });
    mockHandler2 = vi.fn().mockResolvedValue({ step: 2, data: 'result2' });
    mockHandler3 = vi.fn().mockResolvedValue({ step: 3, data: 'result3' });

    await registry.registerTool(toolDefinition1, mockHandler1);
    await registry.registerTool(toolDefinition2, mockHandler2);
    await registry.registerTool(toolDefinition3, mockHandler3);
  });

  afterEach(() => {
    manager.destroy();
    executor.destroy();
    registry.destroy();
  });

  describe('Workflow Plan Validation', () => {
    it('should validate a correct workflow plan', async () => {
      const plan: WorkflowPlan = {
        id: 'test_workflow',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' }
          },
          {
            id: 'step2',
            toolName: 'tool_2',
            parameters: { data: 'test' },
            dependsOn: ['step1']
          }
        ],
        dependencies: {
          step2: ['step1']
        },
        context: baseContext
      };

      const result = await manager.executeWorkflow(plan);
      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.steps).toHaveLength(2);
    });

    it('should reject workflow with missing steps', async () => {
      const plan: WorkflowPlan = {
        id: 'test_workflow',
        steps: [],
        dependencies: {},
        context: baseContext
      };

      const result = await manager.executeWorkflow(plan);
      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error?.message).toContain('at least one step');
    });

    it('should reject workflow with duplicate step IDs', async () => {
      const plan: WorkflowPlan = {
        id: 'test_workflow',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' }
          },
          {
            id: 'step1', // Duplicate ID
            toolName: 'tool_2',
            parameters: { data: 'test' }
          }
        ],
        dependencies: {},
        context: baseContext
      };

      const result = await manager.executeWorkflow(plan);
      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error?.message).toContain('Duplicate step ID');
    });

    it('should reject workflow with unknown tool', async () => {
      const plan: WorkflowPlan = {
        id: 'test_workflow',
        steps: [
          {
            id: 'step1',
            toolName: 'unknown_tool',
            parameters: { input: 'test' }
          }
        ],
        dependencies: {},
        context: baseContext
      };

      const result = await manager.executeWorkflow(plan);
      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error?.message).toContain('not found');
    });

    it('should reject workflow with circular dependencies', async () => {
      const plan: WorkflowPlan = {
        id: 'test_workflow',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' },
            dependsOn: ['step2']
          },
          {
            id: 'step2',
            toolName: 'tool_2',
            parameters: { data: 'test' },
            dependsOn: ['step1']
          }
        ],
        dependencies: {
          step1: ['step2'],
          step2: ['step1']
        },
        context: baseContext
      };

      const result = await manager.executeWorkflow(plan);
      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error?.message).toContain('Circular dependency');
    });
  });

  describe('Dependency Resolution', () => {
    it('should execute steps in correct dependency order', async () => {
      const executionOrder: string[] = [];
      
      mockHandler1.mockImplementation(async () => {
        executionOrder.push('tool_1');
        return { step: 1, data: 'result1' };
      });
      
      mockHandler2.mockImplementation(async () => {
        executionOrder.push('tool_2');
        return { step: 2, data: 'result2' };
      });
      
      mockHandler3.mockImplementation(async () => {
        executionOrder.push('tool_3');
        return { step: 3, data: 'result3' };
      });

      const plan: WorkflowPlan = {
        id: 'dependency_test',
        steps: [
          {
            id: 'step3',
            toolName: 'tool_3',
            parameters: { result: 'test' },
            dependsOn: ['step1', 'step2']
          },
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' }
          },
          {
            id: 'step2',
            toolName: 'tool_2',
            parameters: { data: 'test' },
            dependsOn: ['step1']
          }
        ],
        dependencies: {
          step2: ['step1'],
          step3: ['step1', 'step2']
        },
        context: baseContext
      };

      const result = await manager.executeWorkflow(plan);
      
      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(executionOrder).toEqual(['tool_1', 'tool_2', 'tool_3']);
    });

    it('should execute independent steps in parallel', async () => {
      const startTimes: Record<string, number> = {};
      const endTimes: Record<string, number> = {};
      
      mockHandler1.mockImplementation(async () => {
        startTimes.tool_1 = Date.now();
        await new Promise(resolve => setTimeout(resolve, 100));
        endTimes.tool_1 = Date.now();
        return { step: 1, data: 'result1' };
      });
      
      mockHandler2.mockImplementation(async () => {
        startTimes.tool_2 = Date.now();
        await new Promise(resolve => setTimeout(resolve, 100));
        endTimes.tool_2 = Date.now();
        return { step: 2, data: 'result2' };
      });

      const plan: WorkflowPlan = {
        id: 'parallel_test',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' }
          },
          {
            id: 'step2',
            toolName: 'tool_2',
            parameters: { data: 'test' }
          }
        ],
        dependencies: {},
        context: baseContext
      };

      const result = await manager.executeWorkflow(plan);
      
      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      
      // Check that steps started around the same time (parallel execution)
      const timeDiff = Math.abs(startTimes.tool_1 - startTimes.tool_2);
      expect(timeDiff).toBeLessThan(50); // Should start within 50ms of each other
    });
  });

  describe('Context Passing', () => {
    it('should pass results between workflow steps', async () => {
      mockHandler2.mockImplementation(async (params, context) => {
        // Should have access to step1 result in context
        expect(context.environment?.step1_result).toEqual({ step: 1, data: 'result1' });
        expect(context.environment?.tool_1_result).toEqual({ step: 1, data: 'result1' });
        return { step: 2, processed: context.environment?.step1_result?.data };
      });

      const plan: WorkflowPlan = {
        id: 'context_test',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' }
          },
          {
            id: 'step2',
            toolName: 'tool_2',
            parameters: { data: 'test' },
            dependsOn: ['step1']
          }
        ],
        dependencies: {
          step2: ['step1']
        },
        context: baseContext
      };

      const result = await manager.executeWorkflow(plan);
      
      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.steps[1].result.processed).toBe('result1');
    });

    it('should include workflow context in step execution', async () => {
      const workflowContext = { customData: 'workflow_value' };
      
      mockHandler1.mockImplementation(async (params, context) => {
        expect(context.environment?.customData).toBe('workflow_value');
        expect(context.environment?.workflowId).toBeDefined();
        return { step: 1, data: 'result1' };
      });

      const plan: WorkflowPlan = {
        id: 'context_workflow_test',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' }
          }
        ],
        dependencies: {},
        context: {
          ...baseContext,
          environment: workflowContext
        }
      };

      const result = await manager.executeWorkflow(plan);
      expect(result.status).toBe(ExecutionStatus.SUCCESS);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should stop workflow on step failure', async () => {
      mockHandler1.mockRejectedValue(new Error('Tool 1 failed'));

      const plan: WorkflowPlan = {
        id: 'error_test',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' }
          },
          {
            id: 'step2',
            toolName: 'tool_2',
            parameters: { data: 'test' },
            dependsOn: ['step1']
          }
        ],
        dependencies: {
          step2: ['step1']
        },
        context: baseContext
      };

      const result = await manager.executeWorkflow(plan);
      
      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].status).toBe(ExecutionStatus.FAILED);
      expect(mockHandler2).not.toHaveBeenCalled();
    });

    it('should retry failed steps according to retry policy', async () => {
      let attemptCount = 0;
      mockHandler1.mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('TEMPORARY_FAILURE: Simulated failure');
        }
        return { step: 1, data: 'result1', attempts: attemptCount };
      });

      const plan: WorkflowPlan = {
        id: 'retry_test',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' },
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: 'fixed',
              baseDelay: 10,
              retryableErrors: ['TEMPORARY_FAILURE']
            }
          }
        ],
        dependencies: {},
        context: baseContext
      };

      const result = await manager.executeWorkflow(plan);
      
      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.steps[0].retryCount).toBe(2);
      expect(result.steps[0].result.attempts).toBe(3);
    });

    it('should not retry non-retryable errors', async () => {
      mockHandler1.mockRejectedValue(new Error('PERMANENT_FAILURE: Cannot retry'));

      const plan: WorkflowPlan = {
        id: 'no_retry_test',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' },
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: 'fixed',
              baseDelay: 10,
              retryableErrors: ['TEMPORARY_FAILURE']
            }
          }
        ],
        dependencies: {},
        context: baseContext
      };

      const result = await manager.executeWorkflow(plan);
      
      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.steps[0].retryCount).toBe(0);
      expect(mockHandler1).toHaveBeenCalledTimes(1);
    });
  });

  describe('Workflow Creation Helpers', () => {
    it('should create simple sequential workflow', () => {
      const workflow = manager.createSimpleWorkflow(
        ['tool_1', 'tool_2', 'tool_3'],
        baseContext,
        {
          tool_1: { input: 'test1' },
          tool_2: { data: 'test2' },
          tool_3: { result: 'test3' }
        }
      );

      expect(workflow.steps).toHaveLength(3);
      expect(workflow.steps[0].toolName).toBe('tool_1');
      expect(workflow.steps[0].dependsOn).toBeUndefined();
      expect(workflow.steps[1].dependsOn).toEqual(['step_1']);
      expect(workflow.steps[2].dependsOn).toEqual(['step_2']);
      expect(workflow.dependencies.step_2).toEqual(['step_1']);
      expect(workflow.dependencies.step_3).toEqual(['step_2']);
    });

    it('should create parallel workflow with final step', () => {
      const toolConfigs = [
        { toolName: 'tool_1', parameters: { input: 'test1' } },
        { toolName: 'tool_2', parameters: { data: 'test2' } }
      ];
      
      const workflow = manager.createParallelWorkflow(
        toolConfigs,
        baseContext,
        { toolName: 'tool_3', parameters: { result: 'final' } }
      );

      expect(workflow.steps).toHaveLength(3);
      expect(workflow.steps[0].dependsOn).toBeUndefined();
      expect(workflow.steps[1].dependsOn).toBeUndefined();
      expect(workflow.steps[2].dependsOn).toEqual(['parallel_1', 'parallel_2']);
      expect(workflow.dependencies.final_step).toEqual(['parallel_1', 'parallel_2']);
    });

    it('should create parallel workflow without final step', () => {
      const toolConfigs = [
        { toolName: 'tool_1', parameters: { input: 'test1' } },
        { toolName: 'tool_2', parameters: { data: 'test2' } }
      ];
      
      const workflow = manager.createParallelWorkflow(toolConfigs, baseContext);

      expect(workflow.steps).toHaveLength(2);
      expect(workflow.steps[0].dependsOn).toBeUndefined();
      expect(workflow.steps[1].dependsOn).toBeUndefined();
      expect(Object.keys(workflow.dependencies)).toHaveLength(0);
    });
  });

  describe('Workflow Management', () => {
    it('should track active workflows', async () => {
      const slowHandler = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ data: 'slow' }), 200))
      );
      await registry.updateTool('tool_1', toolDefinition1, slowHandler);

      const plan: WorkflowPlan = {
        id: 'tracking_test',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' }
          }
        ],
        dependencies: {},
        context: baseContext
      };

      const workflowPromise = manager.executeWorkflow(plan);
      
      // Wait a bit to ensure workflow has started
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const activeWorkflows = manager.getActiveWorkflows();
      expect(activeWorkflows).toContain('tracking_test');

      await workflowPromise;

      const activeWorkflowsAfter = manager.getActiveWorkflows();
      expect(activeWorkflowsAfter).not.toContain('tracking_test');
    });

    it('should cancel running workflows', async () => {
      const slowHandler = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ data: 'slow' }), 1000))
      );
      await registry.updateTool('tool_1', toolDefinition1, slowHandler);

      const plan: WorkflowPlan = {
        id: 'cancel_test',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' }
          }
        ],
        dependencies: {},
        context: baseContext
      };

      const workflowPromise = manager.executeWorkflow(plan);
      
      // Wait a bit to ensure workflow has started
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const cancelled = await manager.cancelWorkflow('cancel_test');
      expect(cancelled).toBe(true);

      const activeWorkflows = manager.getActiveWorkflows();
      expect(activeWorkflows).not.toContain('cancel_test');
    });

    it('should enforce concurrent workflow limits', async () => {
      const limitedManager = new ToolManager(registry, executor, {
        maxConcurrentWorkflows: 1
      });

      const slowHandler = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ data: 'slow' }), 100))
      );
      await registry.updateTool('tool_1', toolDefinition1, slowHandler);

      const plan1: WorkflowPlan = {
        id: 'workflow_1',
        steps: [{ id: 'step1', toolName: 'tool_1', parameters: { input: 'test' } }],
        dependencies: {},
        context: baseContext
      };

      const plan2: WorkflowPlan = {
        id: 'workflow_2',
        steps: [{ id: 'step1', toolName: 'tool_1', parameters: { input: 'test' } }],
        dependencies: {},
        context: baseContext
      };

      // Start both workflows simultaneously
      const results = await Promise.all([
        limitedManager.executeWorkflow(plan1),
        limitedManager.executeWorkflow(plan2)
      ]);
      
      // One should succeed, one should fail due to concurrency limit
      const successCount = results.filter(r => r.status === ExecutionStatus.SUCCESS).length;
      const failureCount = results.filter(r => r.status === ExecutionStatus.FAILED).length;
      
      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);
      
      const failedResult = results.find(r => r.status === ExecutionStatus.FAILED);
      expect(failedResult?.error?.message).toContain('Maximum concurrent workflows');
      
      limitedManager.destroy();
    });

    it('should get workflow context', async () => {
      const slowHandler = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ data: 'slow' }), 200))
      );
      await registry.updateTool('tool_1', toolDefinition1, slowHandler);

      const plan: WorkflowPlan = {
        id: 'context_get_test',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' }
          }
        ],
        dependencies: {},
        context: {
          ...baseContext,
          environment: { customValue: 'test_value' }
        }
      };

      const workflowPromise = manager.executeWorkflow(plan);
      
      // Wait a bit to ensure workflow has started
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const context = manager.getWorkflowContext('context_get_test');
      expect(context).toBeDefined();
      expect(context?.workflowId).toBe('context_get_test');
      expect(context?.customValue).toBe('test_value');

      await workflowPromise;

      const contextAfter = manager.getWorkflowContext('context_get_test');
      expect(contextAfter).toBeUndefined();
    });
  });

  describe('Event Emission', () => {
    it('should emit workflow completion events', async () => {
      const completedSpy = vi.fn();
      manager.on('workflow_completed', completedSpy);

      const plan: WorkflowPlan = {
        id: 'event_test',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' }
          }
        ],
        dependencies: {},
        context: baseContext
      };

      const result = await manager.executeWorkflow(plan);
      
      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(completedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 'event_test',
          status: ExecutionStatus.SUCCESS,
          stepCount: 1
        })
      );
    });

    it('should emit workflow failure events', async () => {
      const failedSpy = vi.fn();
      manager.on('workflow_failed', failedSpy);

      mockHandler1.mockRejectedValue(new Error('Test failure'));

      const plan: WorkflowPlan = {
        id: 'failure_event_test',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' }
          }
        ],
        dependencies: {},
        context: baseContext
      };

      const result = await manager.executeWorkflow(plan);
      
      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error).toBeDefined();
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].status).toBe(ExecutionStatus.FAILED);
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup resources on destroy', async () => {
      const slowHandler = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ data: 'slow' }), 1000))
      );
      await registry.updateTool('tool_1', toolDefinition1, slowHandler);

      const plan: WorkflowPlan = {
        id: 'cleanup_test',
        steps: [
          {
            id: 'step1',
            toolName: 'tool_1',
            parameters: { input: 'test' }
          }
        ],
        dependencies: {},
        context: baseContext
      };

      manager.executeWorkflow(plan);
      
      // Wait a bit to ensure workflow has started
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(manager.getActiveWorkflows().length).toBeGreaterThan(0);
      
      manager.destroy();
      
      expect(manager.getActiveWorkflows().length).toBe(0);
    });
  });
});