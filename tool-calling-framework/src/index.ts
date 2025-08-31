/**
 * Tool Calling Framework - Main Export
 * 
 * A comprehensive framework for tool calling with security validation,
 * workflow orchestration, and multi-tool execution capabilities.
 */

// Core types and interfaces
export * from './types/index.js';

// Tool Registry
export { ToolRegistry, toolRegistry } from './registry/ToolRegistry.js';

// Tool Executor
export { ToolExecutor } from './executor/ToolExecutor.js';

// Tool Manager
export { ToolManager } from './manager/ToolManager.js';

// JSON Schemas (for external validation)
export { default as toolDefinitionSchema } from './schemas/tool-definition.schema.json' assert { type: 'json' };
export { default as executionRequestSchema } from './schemas/execution-request.schema.json' assert { type: 'json' };
export { default as executionResultSchema } from './schemas/execution-result.schema.json' assert { type: 'json' };

// Import classes for factory function
import { ToolRegistry } from './registry/ToolRegistry.js';
import { ToolExecutor } from './executor/ToolExecutor.js';
import { ToolManager } from './manager/ToolManager.js';

// Convenience factory function
export function createToolCallingFramework() {
  const registry = new ToolRegistry();
  const executor = new ToolExecutor(registry);
  const manager = new ToolManager(registry, executor);
  
  return {
    registry,
    executor,
    manager,
    
    // Cleanup function
    destroy() {
      manager.destroy();
      executor.destroy();
      registry.destroy();
    }
  };
}