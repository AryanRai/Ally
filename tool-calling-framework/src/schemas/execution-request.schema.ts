export const executionRequestSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Tool Execution Request Schema",
  "description": "Schema for validating tool execution requests",
  "type": "object",
  "required": ["toolName", "parameters", "executionId", "context"],
  "properties": {
    "toolName": {
      "type": "string",
      "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$",
      "minLength": 1,
      "maxLength": 100,
      "description": "Name of the tool to execute"
    },
    "parameters": {
      "type": "object",
      "description": "Parameters to pass to the tool"
    },
    "executionId": {
      "type": "string",
      "pattern": "^[a-zA-Z0-9_-]+$",
      "minLength": 1,
      "maxLength": 100,
      "description": "Unique identifier for this execution"
    },
    "context": {
      "$ref": "#/definitions/executionContext"
    },
    "timeout": {
      "type": "number",
      "minimum": 1,
      "maximum": 300000,
      "description": "Execution timeout in milliseconds"
    },
    "priority": {
      "type": "number",
      "minimum": 1,
      "maximum": 10,
      "description": "Execution priority (1=lowest, 10=highest)"
    },
    "metadata": {
      "type": "object",
      "description": "Additional metadata for the execution"
    }
  },
  "definitions": {
    "executionContext": {
      "type": "object",
      "required": ["timestamp"],
      "properties": {
        "userId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "sessionId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "workflowId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "parentExecutionId": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "timestamp": {
          "type": "string",
          "format": "date-time"
        },
        "environment": {
          "type": "object"
        },
        "permissions": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^[a-zA-Z][a-zA-Z0-9_:.-]*$"
          },
          "uniqueItems": true
        }
      }
    }
  }
} as const;