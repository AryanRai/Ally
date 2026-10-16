import { useEffect, useState } from 'react';
import { FolderOpen, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AgentConfig, AgentPermission, AgentProvider } from '../../types/agent';

interface AgentSettingsSectionProps {
  platform: string;
  theme: 'light' | 'dark';
}

type Status = Record<AgentProvider, { available: boolean; path: string | null }>;

const PERMISSIONS: Array<{ id: AgentPermission; label: string; hint: string }> = [
  { id: 'readonly', label: 'Read-only', hint: 'Agents can read files but not change them' },
  { id: 'edit', label: 'Can edit', hint: 'Agents can edit files in the working folder' },
  { id: 'full', label: 'Full access', hint: 'Agents run anything without asking' },
];

/** Settings for the Claude Code / Codex backends. */
export default function AgentSettingsSection({ platform, theme }: AgentSettingsSectionProps) {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const agent = window.pip?.agent;

  useEffect(() => {
    if (!agent) return;
    agent.getConfig().then(setConfig).catch(() => {});
    agent.status().then(setStatus).catch(() => {});
  }, [agent]);

  if (!agent || !config) return null;

  const update = async (patch: Partial<AgentConfig>) => {
    setConfig(await agent.updateConfig(patch));
    if ('claudePath' in patch || 'codexPath' in patch) setStatus(await agent.status());
  };

  const muted = platform === 'win32' || theme === 'dark' ? 'text-white/60' : 'text-black/60';
  const heading = platform === 'win32' || theme === 'dark' ? 'text-white/80' : 'text-black/80';
  const box = platform === 'win32' || theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10';
  const input = cn('w-full px-2 py-1 text-xs rounded border bg-transparent', box);

  return (
    <div className="space-y-3">
      <h3 className={cn('text-sm font-medium', heading)}>Agents</h3>

      <div className={cn('p-3 rounded-lg border space-y-3', box)}>
        {(['claude', 'codex'] as const).map(p => (
          <div key={p} className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              {status?.[p].available
                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                : <XCircle className="w-3.5 h-3.5 text-red-400" />}
              {p === 'claude' ? 'Claude Code' : 'Codex'}
            </div>
            <input
              className={input}
              placeholder={status?.[p].path ?? 'Not found — set the CLI path'}
              defaultValue={(p === 'claude' ? config.claudePath : config.codexPath) ?? ''}
              onBlur={e => update(p === 'claude' ? { claudePath: e.target.value || undefined } : { codexPath: e.target.value || undefined })}
              title="Leave empty to auto-detect"
            />
          </div>
        ))}
      </div>

      <div className={cn('p-3 rounded-lg border space-y-3', box)}>
        <div className="space-y-1">
          <span className={cn('text-xs block', muted)}>Default working folder</span>
          <button
            onClick={async () => {
              const folder = await agent.pickFolder(config.defaultCwd);
              if (folder) update({ defaultCwd: folder });
            }}
            className={cn('w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded border text-left', box)}
            title={config.defaultCwd}
          >
            <FolderOpen className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{config.defaultCwd}</span>
          </button>
        </div>

        <div className="space-y-1">
          <span className={cn('text-xs block', muted)}>Permissions</span>
          <div className="grid grid-cols-3 gap-1">
            {PERMISSIONS.map(p => (
              <button
                key={p.id}
                onClick={() => update({ permission: p.id })}
                title={p.hint}
                className={cn(
                  'px-1.5 py-1 text-[11px] rounded border transition-colors',
                  config.permission === p.id ? 'bg-purple-500/25 border-purple-500/50 text-purple-200' : box
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-2 text-xs cursor-pointer">
          <span>
            Shake cursor to circle
            <span className={cn('block text-[10px]', muted)}>Wiggle the mouse to open Circle to Ask anywhere</span>
          </span>
          <input
            type="checkbox"
            checked={config.shakeToCircle ?? true}
            onChange={e => update({ shakeToCircle: e.target.checked })}
            className="accent-purple-500"
          />
        </label>

        <div className="space-y-1">
          <span className={cn('text-xs block', muted)}>Robot MCP server (HowYouSeeMe)</span>
          <input
            className={input}
            defaultValue={config.robotMcpUrl ?? ''}
            placeholder="http://localhost:8090/mcp"
            onBlur={e => update({ robotMcpUrl: e.target.value || undefined })}
            title="Given to the agent while Robot mode is on"
          />
        </div>
      </div>
    </div>
  );
}
