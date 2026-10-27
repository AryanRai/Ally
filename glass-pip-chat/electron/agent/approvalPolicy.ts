import type { AgentPermission } from './types.js';

/** Filesystem access and approval handling are independent: full access must
 * still allow a required approval to reach the user instead of auto-rejecting it. */
export function codexApprovalPolicy(_permission: AgentPermission | undefined, interactive = true) {
  if (!interactive) return { approvalPolicy: 'never' };
  return {
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user',
  };
}
