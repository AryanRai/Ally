import { useEffect, useState } from 'react';
import { FolderOpen, CheckCircle2, XCircle, LoaderCircle } from 'lucide-react';
import { openClaudeLogin } from '@/lib/claudeLogin';
import ChatsMcpSettings from './ChatsMcpSettings';
import type { ClaudeAccount } from '../../../electron/agent/claudeLogin';
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
  { id: 'full', label: 'Full access', hint: 'Unrestricted files. Codex auto-reviews eligible requests; Claude uses bypass. Required browser confirmations still apply.' },
];

/** Settings for the Claude Code / Codex backends. */
export default function AgentSettingsSection({ platform, theme }: AgentSettingsSectionProps) {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  // Checked on demand: verifying costs one tiny request to Claude
  const [account, setAccount] = useState<ClaudeAccount | 'checking' | null>(null);
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
  const input = cn('w-full px-2 py-1 text-xs rounded-sm border bg-transparent', box);

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
            {p === 'claude' && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
                <span className={cn('min-w-0 flex-1 truncate', muted)}>
                  {account === 'checking' ? (
                    <span className="inline-flex items-center gap-1"><LoaderCircle className="w-3 h-3 animate-spin" /> Checking sign-in…</span>
                  ) : account?.ok ? (
                    `Signed in${account.email ? ` as ${account.email}` : ''}${account.plan ? ` · ${account.plan}` : ''}`
                  ) : account ? (
                    <span className="text-red-400">{account.error ?? 'Not signed in'}</span>
                  ) : 'Sign-in not checked'}
                </span>
                <button
                  className={cn('px-2 py-0.5 rounded-sm border', box)}
                  disabled={account === 'checking'}
                  onClick={async () => {
                    setAccount('checking');
                    try { setAccount(await agent.claudeAccount()); }
                    catch (e) { setAccount({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
                  }}
                >
                  Check
                </button>
                <button className={cn('px-2 py-0.5 rounded-sm border', box)} onClick={openClaudeLogin}>Sign in…</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={cn('p-3 rounded-lg border space-y-3', box)}>
        {platform === 'win32' && (
          <label className="flex items-start justify-between gap-3 text-xs cursor-pointer">
            <span>
              Codex desktop connection <span className={muted}>· Experimental</span>
              <span className={cn('block mt-1 text-[10px] leading-relaxed', muted)}>
                Continue existing chats through the open Codex app, on desktop and watch.
                Uses its tools and browser. No background model checks or chat copies.
                Open the chat in Codex first. New chats still use the standard connection.
                Some native questions need an answer in Codex.
              </span>
            </span>
            <input type="checkbox" aria-label="Experimental Codex desktop connection"
              checked={config.codexDesktop ?? false}
              onChange={e => update({ codexDesktop: e.target.checked })}
              className="accent-white mt-0.5" />
          </label>
        )}
        <ChatsMcpSettings muted={muted} box={box} />
        <div className="space-y-1">
          <span className={cn('text-xs block', muted)}>Default working folder</span>
          <button
            onClick={async () => {
              const folder = await agent.pickFolder(config.defaultCwd);
              if (folder) update({ defaultCwd: folder });
            }}
            className={cn('w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded-sm border text-left', box)}
            title={config.defaultCwd}
          >
            <FolderOpen className="w-3 h-3 shrink-0" />
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
                  'px-1.5 py-1 text-[11px] rounded-sm border transition-colors',
                  config.permission === p.id ? 'bg-white/13 border-white/25 text-white' : box
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
            className="accent-white"
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

        <div className="space-y-1">
          <span className={cn('text-xs block', muted)}>Robot motion MCP server (DroidCore)</span>
          <input
            className={input}
            defaultValue={config.droidcoreMcpUrl ?? ''}
            placeholder="http://localhost:8091/mcp"
            onBlur={e => update({ droidcoreMcpUrl: e.target.value || undefined })}
            title="Motion tools (move, rotate, stop, scan, speak) given to the agent while Robot mode is on"
          />
        </div>
      </div>
    </div>
  );
}
