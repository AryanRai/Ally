// Agent types live with the Electron runner; the renderer adds a few UI helpers.
export type {
  AgentProvider,
  AgentPermission,
  AgentEvent,
  AgentConfig,
  AgentStatus,
  AgentModel,
  AgentSessionSummary,
  AgentHistoryMessage,
  AgentUsage,
} from '../../electron/agent/types';
import type { AgentProvider } from '../../electron/agent/types';

/** Model ids in the picker look like `claude-code:sonnet` or `codex:gpt-6-sol`. */
export const AGENT_MODEL_PREFIX: Record<AgentProvider, string> = {
  claude: 'claude-code:',
  codex: 'codex:',
};

export const DEFAULT_AGENT_MODEL = `${AGENT_MODEL_PREFIX.claude}default`;

export function parseAgentModel(modelId: string | undefined): { provider: AgentProvider; model: string } | null {
  if (!modelId) return null;
  for (const provider of ['claude', 'codex'] as const) {
    const prefix = AGENT_MODEL_PREFIX[provider];
    if (modelId.startsWith(prefix)) return { provider, model: modelId.slice(prefix.length) || 'default' };
  }
  return null;
}

export const AGENT_LABEL: Record<AgentProvider, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
};
