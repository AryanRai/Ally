/** Native owner remains the authority for every mirrored decision. */
export const approvalRoutes: Record<string, { method: string; field: 'decision' | 'response' }> = {
  'item/commandExecution/requestApproval': { method: 'thread-follower-command-approval-decision', field: 'decision' },
  'item/fileChange/requestApproval': { method: 'thread-follower-file-approval-decision', field: 'decision' },
  'item/permissions/requestApproval': { method: 'thread-follower-permissions-request-approval-response', field: 'response' },
  'item/tool/requestUserInput': { method: 'thread-follower-submit-user-input', field: 'response' },
  'mcpServer/elicitation/request': { method: 'thread-follower-submit-mcp-server-elicitation-response', field: 'response' },
};
