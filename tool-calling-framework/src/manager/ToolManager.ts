/**
 * Tool Manager Orchestration
 * Requirements: 10.3, 15.1, 15.2, 15.4
 * 
 * Provides workflow planning, dependency resolution, multi-tool execution,
 * context passing, retry logic, and error recovery mechanisms
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkflowPlan,
  WorkflowStep,
  RetryPolicy,
  ToolExecutionRequest,
  ToolExecutionResult,
  ExecutionContext,
  ExecutionStatus,
  ToolError
} from '../types/index.js';
import { ToolRegistry } from '../registry/ToolRegistry.js';
import { ToolExecutor } from '../executor/ToolExecutor.js';

export interface WorkflowExecutionResult {
  workflowId: string;
  status: ExecutionStatus;
  steps: Array<{
    stepId: string;
    toolName: string;
    status: ExecutionStatus;
    result?: any;
    error?: ToolError;
    executionTime: number;
    retryCount: number;
  }>;
  totalExecutionTime: number;
  timestamp: string;
  error?: ToolError;
}

export interface ManagerConfig {
  maxConcurrentWorkflows: number;
  defaultRetryPolicy: RetryPolicy;
  enableWorkflowLogging: boolean;
  workflowTimeout: number;
}

export class ToolManager extends EventEmitter {
  private registry: ToolRegistry;
  private executor: ToolExecutor;
  private config: ManagerConfig;
  private activeWorkflows: Map<string, Promise<WorkflowExecutionResult>> = new Map();
  private workflowContexts: Map<string, Record<string, any>> = new Map();

  constructor(
    registry: ToolRegistry,
    executor: ToolExecutor,
    config: Partial<ManagerConfig> = {}
  ) {
    super();
    
    this.registry = registry;
    this.executor = executor;
    this.config = {
      maxConcurrentWorkflows: 5,
      defaultRetryPolicy: {
        maxRetries: 3,
        backoffStrategy: 'exponential',
        baseDelay: 1000,
        maxDelay: 30000,
        retryableErrors: ['TIMEOUT', 'NETWORK_ERROR', 'TEMPORARY_FAILURE']
      },
      enableWorkflowLogging: true,
      workflowTimeout: 300000, // 5 minutes
      ...config
    };
  }

  /**
   * Execute a workflow plan with dependency resolution and error recovery
   */
  async executeWorkflow(plan: WorkflowPlan): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    const workflowId = plan.id || uuidv4();
    
    try {
      // Validate workflow plan
      this.validateWorkflowPlan(plan);
      
      // Check concurrent workflow limits
      this.checkConcurrencyLimits();
      
      // Resolve step dependencies and create execution order
      const executionOrder = this.resolveDependencies(plan);
      
      // Initialize workflow context
      const workflowContext: Record<string, any> = {
        workflowId,
        startTime,
        ...plan.context.environment
      };
      this.workflowContexts.set(workflowId, workflowContext);
      
      // Create workflow execution promise
      const workflowPromise = this.executeWorkflowInternal(
        workflowId,
        executionOrder,
        plan.context,
        workflowContext
      );
      
      this.activeWorkflows.set(workflowId, workflowPromise);
      
      // Execute with timeout
      const result = await this.executeWithTimeout(workflowPromise, this.config.workflowTimeout);
      
      // Clean up
      this.activeWorkflows.delete(workflowId);
      this.workflowContexts.delete(workflowId);
      
      // Log workflow completion
      if (this.config.enableWorkflowLogging) {
        this.emit('workflow_completed', {
          workflowId,
          status: result.status,
          executionTime: result.totalExecutionTime,
          stepCount: result.steps.length
        });
      }
      
      return result;
      
    } catch (error) {
      // Clean up on error
      this.activeWorkflows.delete(workflowId);
      this.workflowContexts.delete(workflowId);
      
      const workflowError = this.formatWorkflowError(error);
      const result: WorkflowExecutionResult = {
        workflowId,
        status: ExecutionStatus.FAILED,
        steps: [],
        totalExecutionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: workflowError
      };
      
      // Log workflow failure
      if (this.config.enableWorkflowLogging) {
        this.emit('workflow_failed', {
          workflowId,
          error: workflowError,
          executionTime: result.totalExecutionTime
        });
      }
      
      return result;
    }
  }

  /**
   * Create a workflow plan from a simple tool chain
   */
  createSimpleWorkflow(
    toolNames: string[],
    baseContext: ExecutionContext,
    parameters?: Record<string, Record<string, any>>
  ): WorkflowPlan {
    const workflowId = uuidv4();
    const steps: WorkflowStep[] = [];
    const dependencies: Record<string, string[]> = {};
    
    for (let i = 0; i < toolNames.length; i++) {
      const toolName = toolNames[i];
      const stepId = `step_${i + 1}`;
      
      steps.push({
        id: stepId,
        toolName,
        parameters: parameters?.[toolName] || {},
        dependsOn: i > 0 ? [`step_${i}`] : undefined,
        retryPolicy: this.config.defaultRetryPolicy
      });
      
      if (i > 0) {
        dependencies[stepId] = [`step_${i}`];
      }
    }
    
    return {
      id: workflowId,
      steps,
      dependencies,
      context: baseContext,
      metadata: {
        type: 'simple_chain',
        createdAt: new Date().toISOString()
      }
    };
  }

  /**
   * Create a parallel workflow plan
   */
  createParallelWorkflow(
    toolConfigs: Array<{ toolName: string; parameters: Record<string, any> }>,
    baseContext: ExecutionContext,
    finalStep?: { toolName: string; parameters: Record<string, any> }
  ): WorkflowPlan {
    const workflowId = uuidv4();
    const steps: WorkflowStep[] = [];
    const dependencies: Record<string, string[]> = {};
    
    // Create parallel steps
    const parallelStepIds: string[] = [];
    for (let i = 0; i < toolConfigs.length; i++) {
      const config = toolConfigs[i];
      const stepId = `parallel_${i + 1}`;
      parallelStepIds.push(stepId);
      
      steps.push({
        id: stepId,
        toolName: config.toolName,
        parameters: config.parameters,
        retryPolicy: this.config.defaultRetryPolicy
      });
    }
    
    // Add final step if provided
    if (finalStep) {
      const finalStepId = 'final_step';
      steps.push({
        id: finalStepId,
        toolName: finalStep.toolName,
        parameters: finalStep.parameters,
        dependsOn: parallelStepIds,
        retryPolicy: this.config.defaultRetryPolicy
      });
      
      dependencies[finalStepId] = parallelStepIds;
    }
    
    return {
      id: workflowId,
      steps,
      dependencies,
      context: baseContext,
      metadata: {
        type: 'parallel',
        createdAt: new Date().toISOString()
      }
    };
  }

  /**
   * Get active workflows
   */
  getActiveWorkflows(): string[] {
    return Array.from(this.activeWorkflows.keys());
  }

  /**
   * Cancel a running workflow
   */
  async cancelWorkflow(workflowId: string): Promise<boolean> {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      return false;
    }
    
    // Note: In a real implementation, you'd need to implement cancellation tokens
    // For now, we'll just remove it from tracking
    this.activeWorkflows.delete(workflowId);
    this.workflowContexts.delete(workflowId);
    
    if (this.config.enableWorkflowLogging) {
      this.emit('workflow_cancelled', { workflowId });
    }
    
    return true;
  }

  /**
   * Get workflow context
   */
  getWorkflowContext(workflowId: string): Record<string, any> | undefined {
    return this.workflowContexts.get(workflowId);
  }

  /**
   * Validate workflow plan structure
   */
  private validateWorkflowPlan(plan: WorkflowPlan): void {
    if (!plan.id) {
      throw new Error('Workflow plan must have an ID');
    }
    
    if (!plan.steps || plan.steps.length === 0) {
      throw new Error('Workflow plan must have at least one step');
    }
    
    // Validate step IDs are unique
    const stepIds = new Set<string>();
    for (const step of plan.steps) {
      if (stepIds.has(step.id)) {
        throw new Error(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);
      
      // Validate tool exists
      if (!this.registry.getTool(step.toolName)) {
        throw new Error(`Tool '${step.toolName}' not found for step '${step.id}'`);
      }
    }
    
    // Validate dependencies reference existing steps
    for (const [stepId, deps] of Object.entries(plan.dependencies)) {
      if (!stepIds.has(stepId)) {
        throw new Error(`Dependency references unknown step: ${stepId}`);
      }
      
      for (const depId of deps) {
        if (!stepIds.has(depId)) {
          throw new Error(`Step '${stepId}' depends on unknown step: ${depId}`);
        }
      }
    }
    
    // Check for circular dependencies
    this.detectCircularDependencies(plan);
  }

  /**
   * Detect circular dependencies in workflow plan
   */
  private detectCircularDependencies(plan: WorkflowPlan): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycle = (stepId: string): boolean => {
      if (recursionStack.has(stepId)) {
        return true; // Circular dependency detected
      }
      
      if (visited.has(stepId)) {
        return false; // Already processed
      }
      
      visited.add(stepId);
      recursionStack.add(stepId);
      
      const dependencies = plan.dependencies[stepId] || [];
      for (const depId of dependencies) {
        if (hasCycle(depId)) {
          return true;
        }
      }
      
      recursionStack.delete(stepId);
      return false;
    };
    
    for (const step of plan.steps) {
      if (hasCycle(step.id)) {
        throw new Error(`Circular dependency detected involving step: ${step.id}`);
      }
    }
  }

  /**
   * Resolve dependencies and create execution order
   */
  private resolveDependencies(plan: WorkflowPlan): WorkflowStep[][] {
    const stepMap = new Map<string, WorkflowStep>();
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();
    
    // Build step map and initialize in-degree
    for (const step of plan.steps) {
      stepMap.set(step.id, step);
      inDegree.set(step.id, 0);
      adjList.set(step.id, []);
    }
    
    // Build adjacency list and calculate in-degrees
    for (const [stepId, deps] of Object.entries(plan.dependencies)) {
      for (const depId of deps) {
        adjList.get(depId)!.push(stepId);
        inDegree.set(stepId, inDegree.get(stepId)! + 1);
      }
    }
    
    // Topological sort to determine execution order
    const executionLevels: WorkflowStep[][] = [];
    const queue: string[] = [];
    
    // Find all steps with no dependencies
    for (const [stepId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(stepId);
      }
    }
    
    while (queue.length > 0) {
      const currentLevel: WorkflowStep[] = [];
      const levelSize = queue.length;
      
      // Process all steps at current level
      for (let i = 0; i < levelSize; i++) {
        const stepId = queue.shift()!;
        const step = stepMap.get(stepId)!;
        currentLevel.push(step);
        
        // Update in-degrees of dependent steps
        for (const dependentId of adjList.get(stepId)!) {
          const newDegree = inDegree.get(dependentId)! - 1;
          inDegree.set(dependentId, newDegree);
          
          if (newDegree === 0) {
            queue.push(dependentId);
          }
        }
      }
      
      executionLevels.push(currentLevel);
    }
    
    return executionLevels;
  }

  /**
   * Check concurrent workflow limits
   */
  private checkConcurrencyLimits(): void {
    if (this.activeWorkflows.size >= this.config.maxConcurrentWorkflows) {
      throw new Error(
        `Maximum concurrent workflows (${this.config.maxConcurrentWorkflows}) exceeded`
      );
    }
  }

  /**
   * Execute workflow with timeout
   */
  private async executeWithTimeout(
    workflowPromise: Promise<WorkflowExecutionResult>,
    timeout: number
  ): Promise<WorkflowExecutionResult> {
    const timeoutPromise = new Promise<WorkflowExecutionResult>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Workflow execution timed out after ${timeout}ms`));
      }, timeout);
    });
    
    return Promise.race([workflowPromise, timeoutPromise]);
  }

  /**
   * Internal workflow execution with dependency resolution
   */
  private async executeWorkflowInternal(
    workflowId: string,
    executionLevels: WorkflowStep[][],
    baseContext: ExecutionContext,
    workflowContext: Record<string, any>
  ): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    const stepResults: WorkflowExecutionResult['steps'] = [];
    
    try {
      // Execute each level of steps
      for (const level of executionLevels) {
        // Execute all steps in current level in parallel
        const levelPromises = level.map(step => 
          this.executeStepWithRetry(step, baseContext, workflowContext)
        );
        
        const levelResults = await Promise.all(levelPromises);
        
        // Process results and update context
        for (let i = 0; i < level.length; i++) {
          const step = level[i];
          const result = levelResults[i];
          
          stepResults.push({
            stepId: step.id,
            toolName: step.toolName,
            status: result.status,
            result: result.result,
            error: result.error,
            executionTime: result.executionTime,
            retryCount: result.metadata?.retryCount || 0
          });
          
          // Add successful results to workflow context
          if (result.status === ExecutionStatus.SUCCESS && result.result) {
            workflowContext[`${step.id}_result`] = result.result;
            workflowContext[`${step.toolName}_result`] = result.result;
          }
          
          // Stop workflow on failure unless configured otherwise
          if (result.status === ExecutionStatus.FAILED) {
            return {
              workflowId,
              status: ExecutionStatus.FAILED,
              steps: stepResults,
              totalExecutionTime: Date.now() - startTime,
              timestamp: new Date().toISOString(),
              error: result.error
            };
          }
        }
      }
      
      return {
        workflowId,
        status: ExecutionStatus.SUCCESS,
        steps: stepResults,
        totalExecutionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        workflowId,
        status: ExecutionStatus.FAILED,
        steps: stepResults,
        totalExecutionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: this.formatWorkflowError(error)
      };
    }
  }

  /**
   * Execute a single step with retry logic
   */
  private async executeStepWithRetry(
    step: WorkflowStep,
    baseContext: ExecutionContext,
    workflowContext: Record<string, any>
  ): Promise<ToolExecutionResult> {
    const retryPolicy = step.retryPolicy || this.config.defaultRetryPolicy;
    let lastError: ToolError | undefined;
    let retryCount = 0;
    
    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      try {
        // Create execution request
        const request: ToolExecutionRequest = {
          toolName: step.toolName,
          parameters: step.parameters,
          executionId: `${step.id}_attempt_${attempt}`,
          context: {
            ...baseContext,
            environment: {
              ...baseContext.environment,
              ...workflowContext
            }
          },
          timeout: step.timeout
        };
        
        // Execute tool
        const result = await this.executor.executeToolSafe(request);
        
        // Return on success
        if (result.status === ExecutionStatus.SUCCESS) {
          return {
            ...result,
            metadata: { ...result.metadata, retryCount }
          };
        }
        
        // Check if error is retryable
        lastError = result.error;
        if (!this.isRetryableError(result.error, retryPolicy)) {
          break;
        }
        
        retryCount++;
        
        // Wait before retry (except on last attempt)
        if (attempt < retryPolicy.maxRetries) {
          const delay = this.calculateRetryDelay(attempt, retryPolicy);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
      } catch (error) {
        lastError = this.formatWorkflowError(error);
        
        if (!this.isRetryableError(lastError, retryPolicy)) {
          break;
        }
        
        retryCount++;
        
        if (attempt < retryPolicy.maxRetries) {
          const delay = this.calculateRetryDelay(attempt, retryPolicy);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Return failure result
    return {
      executionId: `${step.id}_failed`,
      toolName: step.toolName,
      status: ExecutionStatus.FAILED,
      error: lastError,
      executionTime: 0,
      timestamp: new Date().toISOString(),
      metadata: { retryCount }
    };
  }

  /**
   * Check if an error is retryable based on retry policy
   */
  private isRetryableError(error: ToolError | undefined, retryPolicy: RetryPolicy): boolean {
    if (!error || !error.recoverable) {
      return false;
    }
    
    if (!retryPolicy.retryableErrors || retryPolicy.retryableErrors.length === 0) {
      return true; // Retry all recoverable errors if no specific list
    }
    
    return retryPolicy.retryableErrors.some(errorCode => 
      error.code.includes(errorCode) || error.message.includes(errorCode)
    );
  }

  /**
   * Calculate retry delay based on backoff strategy
   */
  private calculateRetryDelay(attempt: number, retryPolicy: RetryPolicy): number {
    let delay: number;
    
    switch (retryPolicy.backoffStrategy) {
      case 'linear':
        delay = retryPolicy.baseDelay * (attempt + 1);
        break;
      case 'exponential':
        delay = retryPolicy.baseDelay * Math.pow(2, attempt);
        break;
      case 'fixed':
      default:
        delay = retryPolicy.baseDelay;
        break;
    }
    
    // Apply maximum delay limit
    if (retryPolicy.maxDelay) {
      delay = Math.min(delay, retryPolicy.maxDelay);
    }
    
    return delay;
  }

  /**
   * Format workflow error for consistent error handling
   */
  private formatWorkflowError(error: any): ToolError {
    if (error && typeof error === 'object' && error.code && error.message) {
      return error as ToolError;
    }
    
    if (error instanceof Error) {
      return {
        code: 'WORKFLOW_ERROR',
        message: error.message,
        details: error.stack,
        recoverable: false,
        suggestedActions: ['Check workflow configuration', 'Review step dependencies']
      };
    }
    
    return {
      code: 'UNKNOWN_WORKFLOW_ERROR',
      message: String(error),
      recoverable: false,
      suggestedActions: ['Check workflow logs', 'Contact system administrator']
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Cancel all active workflows
    for (const workflowId of this.activeWorkflows.keys()) {
      this.cancelWorkflow(workflowId);
    }
    
    this.activeWorkflows.clear();
    this.workflowContexts.clear();
    this.removeAllListeners();
  }
}