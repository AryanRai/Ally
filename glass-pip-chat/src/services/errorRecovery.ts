/**
 * Error classification and recovery instruction injector.
 *
 * Instead of passing raw error strings directly to the LLM, every tool failure
 * is first classified into one of 7 typed error classes.  Each class carries an
 * explicit recovery instruction that is embedded in the ToolMessage so the model
 * receives structured guidance rather than an opaque error blob.
 *
 * Hard-stop classes (permission_denied, mcp_server_unavailable) are special:
 * the result_verifier node routes directly to END for these instead of looping
 * back to the planner, preventing futile retry cycles.
 */

export type ErrorClass =
  | 'file_not_found'
  | 'permission_denied'
  | 'timeout'
  | 'schema_mismatch'
  | 'network_error'
  | 'mcp_server_unavailable'
  | 'unknown';

export interface ClassifiedError {
  class: ErrorClass;
  originalError: string;
  recoveryInstruction: string;
}

/**
 * Classify a tool error string into a typed error class and attach a specific
 * recovery instruction for the model.
 *
 * The matching is intentionally broad (case-insensitive regex) so it catches
 * error messages from Node.js, Python subprocesses, HTTP APIs and MCP servers.
 */
export function classifyToolError(
  errorMessage: string,
  toolName: string
): ClassifiedError {
  if (/ENOENT|no such file|not found/i.test(errorMessage)) {
    return {
      class: 'file_not_found',
      originalError: errorMessage,
      recoveryInstruction:
        'File not found. Use list_directory on the parent path first to confirm the correct filename before retrying.',
    };
  }

  if (/EACCES|permission denied|forbidden/i.test(errorMessage)) {
    return {
      class: 'permission_denied',
      originalError: errorMessage,
      recoveryInstruction:
        'Permission denied. Do not retry this tool call. Report the permission error to the user and stop.',
    };
  }

  if (/timeout|timed out|ETIMEDOUT/i.test(errorMessage)) {
    return {
      class: 'timeout',
      originalError: errorMessage,
      recoveryInstruction:
        'Tool call timed out. Wait before retrying. If this is the second timeout for the same tool, report to user and stop.',
    };
  }

  if (/schema|validation|invalid.*argument|required.*missing/i.test(errorMessage)) {
    return {
      class: 'schema_mismatch',
      originalError: errorMessage,
      recoveryInstruction:
        'Tool argument schema mismatch. Re-read the tool definition and fix the argument types before retrying.',
    };
  }

  if (/MCP|server.*unavailable|ECONNREFUSED/i.test(errorMessage)) {
    return {
      class: 'mcp_server_unavailable',
      originalError: errorMessage,
      recoveryInstruction:
        'MCP server is unavailable. Do not retry. Use an alternative tool if available, otherwise report to user.',
    };
  }

  if (/fetch|network|ENETUNREACH/i.test(errorMessage)) {
    return {
      class: 'network_error',
      originalError: errorMessage,
      recoveryInstruction:
        'Network error. Check connectivity. Do not retry more than once.',
    };
  }

  return {
    class: 'unknown',
    originalError: errorMessage,
    recoveryInstruction: `Unexpected error from tool "${toolName}". Report the error to the user and stop unless you have a clear alternative approach.`,
  };
}

/**
 * Error classes that should cause the agentic loop to hard-stop without
 * routing back to the planner for another attempt.
 */
export const HARD_STOP_ERRORS: ErrorClass[] = [
  'permission_denied',
  'mcp_server_unavailable',
];
