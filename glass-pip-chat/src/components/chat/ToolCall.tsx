import { Terminal } from '@/components/ai-elements/terminal';
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import type { ToolExecution } from '@/types/chat';

const SHELL_TOOLS = new Set(['bash', 'shell', 'powershell', 'run_command', 'exec']);
// Parameter keys that best summarise a call in its one-line title, in priority order
const SUMMARY_KEYS = ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'description', 'prompt'];

type ToolState = 'input-available' | 'output-available' | 'output-error';

const STATE: Record<ToolExecution['status'], ToolState> = {
  pending: 'input-available',
  executing: 'input-available',
  success: 'output-available',
  error: 'output-error',
};

function shellCommand(tool: ToolExecution): string | null {
  const command = tool.parameters?.command;
  if (typeof command !== 'string') return null;
  return SHELL_TOOLS.has(tool.name.toLowerCase()) || tool.name.startsWith('shell') ? command : null;
}

/** "Read · src/app.tsx", "Bash · npm test" — the agent's call at a glance. */
export function toolTitle(tool: ToolExecution): string {
  const params = tool.parameters ?? {};
  const key = SUMMARY_KEYS.find(k => typeof params[k] === 'string' && params[k]);
  if (!key) return tool.name;
  let value = String(params[key]).replace(/\s+/g, ' ').trim();
  // Paths: the tail is what identifies them
  if (key.includes('path')) value = value.split(/[\\/]/).slice(-2).join('/');
  return `${tool.name} · ${value.length > 60 ? value.slice(0, 57) + '…' : value}`;
}

function asText(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/** One agent tool call as an expandable card; shell commands get a terminal pane. */
export default function ToolCall({ tool }: { tool: ToolExecution }) {
  const state = STATE[tool.status];
  const command = shellCommand(tool);
  const running = state === 'input-available';

  return (
    <Tool className="mb-2 bg-card/60 backdrop-blur-sm">
      <ToolHeader type="dynamic-tool" toolName={tool.name} title={toolTitle(tool)} state={state} />
      <ToolContent className="space-y-3 border-t border-border p-3">
        {command !== null ? (
          <Terminal
            output={`$ ${command}\n${asText(tool.error ?? tool.result)}`}
            isStreaming={running}
            className="max-h-72"
          />
        ) : (
          <>
            <ToolInput input={tool.parameters ?? {}} />
            <ToolOutput output={tool.error ? undefined : asText(tool.result) || undefined} errorText={tool.error} />
          </>
        )}
      </ToolContent>
    </Tool>
  );
}
