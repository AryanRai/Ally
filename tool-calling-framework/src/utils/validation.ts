/**
 * Simple validation utilities for browser compatibility
 * Replaces AJV for basic schema validation
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class SimpleValidator {
  static validateToolDefinition(tool: any): ValidationResult {
    const errors: string[] = [];

    // Required fields
    if (!tool.name || typeof tool.name !== 'string') {
      errors.push('Tool name is required and must be a string');
    }
    if (!tool.description || typeof tool.description !== 'string') {
      errors.push('Tool description is required and must be a string');
    }
    if (!tool.version || typeof tool.version !== 'string') {
      errors.push('Tool version is required and must be a string');
    }
    if (!tool.category || typeof tool.category !== 'string') {
      errors.push('Tool category is required and must be a string');
    }
    if (!tool.securityLevel || typeof tool.securityLevel !== 'string') {
      errors.push('Tool securityLevel is required and must be a string');
    }
    if (!tool.parameters || typeof tool.parameters !== 'object') {
      errors.push('Tool parameters is required and must be an object');
    }
    if (!tool.permissions || !Array.isArray(tool.permissions)) {
      errors.push('Tool permissions is required and must be an array');
    }

    // Validate enums
    const validCategories = ['system', 'robot', 'communication', 'web', 'mcp', 'custom'];
    if (tool.category && !validCategories.includes(tool.category)) {
      errors.push(`Tool category must be one of: ${validCategories.join(', ')}`);
    }

    const validSecurityLevels = ['low', 'medium', 'high', 'critical'];
    if (tool.securityLevel && !validSecurityLevels.includes(tool.securityLevel)) {
      errors.push(`Tool securityLevel must be one of: ${validSecurityLevels.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateExecutionRequest(request: any): ValidationResult {
    const errors: string[] = [];

    // Required fields
    if (!request.toolName || typeof request.toolName !== 'string') {
      errors.push('toolName is required and must be a string');
    }
    if (!request.parameters || typeof request.parameters !== 'object') {
      errors.push('parameters is required and must be an object');
    }
    if (!request.executionId || typeof request.executionId !== 'string') {
      errors.push('executionId is required and must be a string');
    }
    if (!request.context || typeof request.context !== 'object') {
      errors.push('context is required and must be an object');
    }

    // Validate context
    if (request.context && !request.context.timestamp) {
      errors.push('context.timestamp is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateExecutionResult(result: any): ValidationResult {
    const errors: string[] = [];

    // Required fields
    if (!result.executionId || typeof result.executionId !== 'string') {
      errors.push('executionId is required and must be a string');
    }
    if (!result.toolName || typeof result.toolName !== 'string') {
      errors.push('toolName is required and must be a string');
    }
    if (!result.status || typeof result.status !== 'string') {
      errors.push('status is required and must be a string');
    }
    if (typeof result.executionTime !== 'number') {
      errors.push('executionTime is required and must be a number');
    }
    if (!result.timestamp || typeof result.timestamp !== 'string') {
      errors.push('timestamp is required and must be a string');
    }

    // Validate status enum
    const validStatuses = ['pending', 'running', 'success', 'failed', 'cancelled', 'timeout'];
    if (result.status && !validStatuses.includes(result.status)) {
      errors.push(`status must be one of: ${validStatuses.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}