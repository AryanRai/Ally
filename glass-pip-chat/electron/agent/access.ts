import type { AgentPermission } from './types.js';
import { codexApprovalPolicy } from './approvalPolicy.js';

export type AccessScope = 'current_reply' | 'next_message';
export type AccessControl = { setPermission?: (permission: AgentPermission) => Promise<AccessScope> };

export function validateAccess(value: unknown): AgentPermission {
  if (value !== 'readonly' && value !== 'edit' && value !== 'full') throw Error('Choose a valid access level');
  return value;
}

export function codexAccessSettings(permission: AgentPermission, cwd: string) {
  return { ...codexApprovalPolicy(permission), sandboxPolicy: permission === 'full' ? { type: 'dangerFullAccess' }
    : permission === 'readonly' ? { type: 'readOnly', networkAccess: true }
    : { type: 'workspaceWrite', writableRoots: [cwd], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false } };
}

/** Only an explicit unsupported-method response permits the next-message fallback.
 * A timeout has an uncertain outcome and must remain an error, without retry. */
export function unsupportedAccessUpdate(error: unknown): boolean {
  return error instanceof Error && /method not found|unknown variant .thread\/settings\/update|unknown method.*thread\/settings\/update/i.test(error.message);
}
