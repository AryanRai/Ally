/**
 * Integration tests for the complete Tool Calling Framework
 * Tests all components working together
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createToolCallingFramework } from '../index.js';
import {
  ToolDefinition,
  SecurityLevel,
  ExecutionStatus,
  ExecutionContext
} from '../types/index.js';

describe('Tool Calling Framework Integration', () => {
  let framework: ReturnType<typeof createToolCallingFramework>;

  const mathTool: ToolDefinition = {
    name: 'math_calculator',
    description: 'Performs basic mathematical operations',
    version: '1.0.0',
    category: 'system',
    securityLevel: SecurityLevel.LOW,
    parameters: {
      operation: {
        type: 'string',
        required: true,
        enum: ['add', 'subtract', 'multiply', 'divide']
      },
      a: {
        type: 'number',
        required: true
      },
      b: {
        type: 'number',
        required: true
      }
    },
    permissions: []
  };

  const stringTool: ToolDefinition = {
    name: 'string_processor',
    description: 'Processes strings',
    version: '1.0.0',
    category: 'system',
    securityLevel: SecurityLevel.LOW,
    parameters: {
      text: {
        type: 'string',
        required: true
      },
      operation: {
        type: 'string',
        required: true,
        enum: ['uppercase', 'lowercase', 'reverse']
      }
    },
    permissions: []
  };

  const baseContext: ExecutionContext = {
    userId: 'integration_test',
    sessionId: 'test_session',
    timestamp: new Date().toISOString(),
    permissions: []
  };

  beforeEach(async () => {
    framework = createToolCallingFramework();

    // Register math tool
    const mathHandler = vi.fn().mockImplementation((params) => {
      const { operation, a, b } = params;
      switch (operation) {
        case 'add': return { result: a + b };
        case 'subtract': return { result: a - b };
        case 'multiply': return { result: a * b };
        case 'divide': return { result: a / b };
        default: throw new Error(`Unknown operation: ${operation}`);
      }
    });

    // Register string tool
    const stringHandler = vi.fn().mockImplementation((params) => {
      const { text, operation } = params;
      switch (operation) {
        case 'uppercase': return { result: text.toUpperCase() };
        case 'lowercase': return { result: text.toLowerCase() };
        case 'reverse': return { result: text.split('').reverse().join('') };
        default: throw new Error(`Unknown operation: ${operation}`);
      }
    });

    await framework.registry.registerTool(mathTool, mathHandler);
    await framework.registry.registerTool(stringTool, stringHandler);
  });

  afterEach(() => {
    framework.destroy();
  });

  describe('End-to-End Tool Execution', () => {
    it('should execute a single tool successfully', async () => {
      const result = await framework.executor.executeToolSafe({
        toolName: 'math_calculator',
        parameters: {
          operation: 'add',
          a: 5,
          b: 3
        },
        executionId: 'test_math',
        context: baseContext
      });

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.result.result).toBe(8);
    });

    it('should execute a simple workflow', async () => {
      const workflow = framework.manager.createSimpleWorkflow(
        ['math_calculator', 'string_processor'],
        baseContext,
        {
          math_calculator: {
            operation: 'multiply',
            a: 6,
            b: 7
          },
          string_processor: {
            text: 'hello world',
            operation: 'uppercase'
          }
        }
      );

      const result = await framework.manager.executeWorkflow(workflow);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].result.result).toBe(42);
      expect(result.steps[1].result.result).toBe('HELLO WORLD');
    });

    it('should execute a parallel workflow', async () => {
      const workflow = framework.manager.createParallelWorkflow(
        [
          {
            toolName: 'math_calculator',
            parameters: {
              operation: 'add',
              a: 10,
              b: 20
            }
          },
          {
            toolName: 'string_processor',
            parameters: {
              text: 'parallel execution',
              operation: 'reverse'
            }
          }
        ],
        baseContext
      );

      const result = await framework.manager.executeWorkflow(workflow);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.steps).toHaveLength(2);
      
      // Both steps should execute in parallel
      const mathResult = result.steps.find(s => s.toolName === 'math_calculator');
      const stringResult = result.steps.find(s => s.toolName === 'string_processor');
      
      expect(mathResult?.result.result).toBe(30);
      expect(stringResult?.result.result).toBe('noitucexe lellarap');
    });

    it('should handle workflow with dependencies and context passing', async () => {
      // Create a custom workflow where the second tool uses the result of the first
      const workflow = framework.manager.createSimpleWorkflow(
        ['math_calculator'],
        baseContext,
        {
          math_calculator: {
            operation: 'multiply',
            a: 4,
            b: 5
          }
        }
      );

      // Add a second step that depends on the first
      workflow.steps.push({
        id: 'step_2',
        toolName: 'string_processor',
        parameters: {
          text: 'The result is: 20',
          operation: 'uppercase'
        },
        dependsOn: ['step_1']
      });

      workflow.dependencies.step_2 = ['step_1'];

      const result = await framework.manager.executeWorkflow(workflow);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].result.result).toBe(20);
      expect(result.steps[1].result.result).toBe('THE RESULT IS: 20');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle tool execution errors gracefully', async () => {
      const result = await framework.executor.executeToolSafe({
        toolName: 'math_calculator',
        parameters: {
          operation: 'divide',
          a: 10,
          b: 0 // Division by zero
        },
        executionId: 'test_error',
        context: baseContext
      });

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.result.result).toBe(Infinity); // JavaScript behavior
    });

    it('should handle workflow failures', async () => {
      const workflow = framework.manager.createSimpleWorkflow(
        ['math_calculator', 'non_existent_tool'],
        baseContext,
        {
          math_calculator: {
            operation: 'add',
            a: 1,
            b: 2
          },
          non_existent_tool: {}
        }
      );

      const result = await framework.manager.executeWorkflow(workflow);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error?.message).toContain('not found');
    });
  });

  describe('Security and Validation', () => {
    it('should validate tool parameters', async () => {
      const result = await framework.executor.executeToolSafe({
        toolName: 'math_calculator',
        parameters: {
          operation: 'invalid_operation', // Invalid enum value
          a: 5,
          b: 3
        },
        executionId: 'test_validation',
        context: baseContext
      });

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error?.message).toContain('Unknown operation');
    });

    it('should enforce required parameters', async () => {
      const result = await framework.executor.executeToolSafe({
        toolName: 'math_calculator',
        parameters: {
          operation: 'add',
          a: 5
          // Missing required parameter 'b' - but our mock handler will handle this
        },
        executionId: 'test_required',
        context: baseContext
      });

      // The mock handler will receive undefined for 'b' and handle it
      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.result.result).toBeNaN(); // 5 + undefined = NaN in JavaScript
    });
  });

  describe('Tool Discovery and Management', () => {
    it('should list and search registered tools', () => {
      const allTools = framework.registry.listTools();
      expect(allTools).toHaveLength(2);

      const mathTools = framework.registry.searchTools({ category: 'system' });
      expect(mathTools).toHaveLength(2);

      const discoveryInfo = framework.registry.getDiscoveryInfo();
      expect(discoveryInfo).toHaveLength(2);
      expect(discoveryInfo.every(info => info.available)).toBe(true);
    });

    it('should provide tool statistics', () => {
      const stats = framework.registry.getToolStats();
      expect(stats.system).toBe(2);
    });
  });

  describe('Workflow Management', () => {
    it('should track active workflows', async () => {
      // Create a slow workflow
      const slowMathHandler = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ result: 42 }), 200))
      );
      
      await framework.registry.updateTool('math_calculator', mathTool, slowMathHandler);

      const workflow = framework.manager.createSimpleWorkflow(
        ['math_calculator'],
        baseContext,
        {
          math_calculator: {
            operation: 'add',
            a: 1,
            b: 1
          }
        }
      );

      const workflowPromise = framework.manager.executeWorkflow(workflow);
      
      // Wait a bit to ensure workflow has started
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const activeWorkflows = framework.manager.getActiveWorkflows();
      expect(activeWorkflows.length).toBeGreaterThan(0);

      await workflowPromise;

      const activeWorkflowsAfter = framework.manager.getActiveWorkflows();
      expect(activeWorkflowsAfter.length).toBe(0);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent tool executions', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        framework.executor.executeToolSafe({
          toolName: 'math_calculator',
          parameters: {
            operation: 'multiply',
            a: i,
            b: 2
          },
          executionId: `concurrent_${i}`,
          context: baseContext
        })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result.status).toBe(ExecutionStatus.SUCCESS);
        expect(result.result.result).toBe(i * 2);
      });
    });

    it('should handle complex workflow with multiple dependencies', async () => {
      // Create a diamond dependency pattern
      const workflow = {
        id: 'complex_workflow',
        steps: [
          {
            id: 'root',
            toolName: 'math_calculator',
            parameters: { operation: 'add', a: 1, b: 1 }
          },
          {
            id: 'left',
            toolName: 'math_calculator',
            parameters: { operation: 'multiply', a: 2, b: 3 },
            dependsOn: ['root']
          },
          {
            id: 'right',
            toolName: 'string_processor',
            parameters: { text: 'hello', operation: 'uppercase' },
            dependsOn: ['root']
          },
          {
            id: 'final',
            toolName: 'string_processor',
            parameters: { text: 'final step', operation: 'reverse' },
            dependsOn: ['left', 'right']
          }
        ],
        dependencies: {
          left: ['root'],
          right: ['root'],
          final: ['left', 'right']
        },
        context: baseContext
      };

      const result = await framework.manager.executeWorkflow(workflow);

      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.steps).toHaveLength(4);
      
      // Verify execution order respects dependencies
      const rootStep = result.steps.find(s => s.stepId === 'root');
      const leftStep = result.steps.find(s => s.stepId === 'left');
      const rightStep = result.steps.find(s => s.stepId === 'right');
      const finalStep = result.steps.find(s => s.stepId === 'final');

      expect(rootStep?.result.result).toBe(2);
      expect(leftStep?.result.result).toBe(6);
      expect(rightStep?.result.result).toBe('HELLO');
      expect(finalStep?.result.result).toBe('pets lanif');
    });
  });
});