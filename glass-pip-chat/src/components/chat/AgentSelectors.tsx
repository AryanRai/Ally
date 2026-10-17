import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, FolderOpen, Home } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { AGENT_LABEL, AGENT_MODEL_PREFIX, type AgentModel, type AgentPermission, type AgentProvider } from '@/types/agent';

export interface AgentSelection {
  provider: AgentProvider;
  model: string;
  folder: string;
  homeFolder?: string;
  /** Other working folders this user's chats run in, most recent first */
  recentFolders: string[];
  permission: AgentPermission;
}

interface AgentSelectorsProps extends AgentSelection {
  onModel: (id: string) => void;
  onFolder: (folder: string) => void;
  onPickFolder: () => void;
  onPermission: (permission: AgentPermission) => void;
  /** No switching mid-turn: the running turn keeps its engine and folder */
  disabled?: boolean;
  prefix?: ReactNode;
}

const PERMISSIONS: { id: AgentPermission; label: string; hint: string }[] = [
  { id: 'readonly', label: 'Read-only', hint: 'Read-only files; asks for approvals' },
  { id: 'edit', label: 'Can edit', hint: 'Workspace edits; asks for approvals' },
  { id: 'full', label: 'Full access', hint: 'Unrestricted files; fewer prompts' },
];

const norm = (p?: string) => p?.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase();
const folderName = (p: string) => p.split(/[\\/]/).filter(Boolean).at(-1) || p;

/** `shrink`: may truncate when the line is tight (model, folder); the others keep their full label. */
function Trigger({ children, title, disabled, danger, shrink }: { children: ReactNode; title: string; disabled?: boolean; danger?: boolean; shrink?: boolean }) {
  return (
    <DropdownMenuTrigger asChild disabled={disabled}>
      <button
        type="button"
        title={title}
        className={cn(
          'px-label inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors hover:bg-white/8 hover:text-foreground data-[state=open]:bg-white/10 data-[state=open]:text-foreground disabled:pointer-events-none',
          shrink ? 'min-w-0' : 'shrink-0',
          danger && 'text-destructive/90'
        )}
      >
        <span className="truncate">{children}</span>
        <ChevronDown className="size-2.5 shrink-0 opacity-50" />
      </button>
    </DropdownMenuTrigger>
  );
}

function Row({ active, children, hint, onSelect }: { active: boolean; children: ReactNode; hint?: string; onSelect: () => void }) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="gap-2 text-xs">
      <Check className={cn('size-3.5 shrink-0', !active && 'invisible')} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="ml-2 truncate text-[10px] text-muted-foreground">{hint}</span>}
    </DropdownMenuItem>
  );
}

/**
 * The composer's status line as pickers: engine · model · folder · permission.
 * Same choices as the header's model picker and Settings, one click away.
 */
export default function AgentSelectors({
  provider, model, folder, homeFolder, recentFolders, permission,
  onModel, onFolder, onPickFolder, onPermission, disabled, prefix,
}: AgentSelectorsProps) {
  const [available, setAvailable] = useState<Record<AgentProvider, boolean>>({ claude: true, codex: true });
  const [models, setModels] = useState<AgentModel[]>([]);

  useEffect(() => {
    window.pip?.agent?.status().then(s => setAvailable({ claude: s.claude.available, codex: s.codex.available })).catch(() => {});
  }, []);
  useEffect(() => {
    let live = true;
    window.pip?.agent?.listModels(provider).then(m => live && setModels(m)).catch(() => live && setModels([]));
    return () => { live = false; };
  }, [provider]);

  const isHome = !!homeFolder && norm(folder) === norm(homeFolder);
  const folders = [homeFolder, ...recentFolders].filter((f, i, all): f is string => !!f && all.findIndex(x => norm(x) === norm(f)) === i).slice(0, 7);
  const modelLabel = models.find(m => m.id === model)?.name ?? model;

  return (
    <div className="flex min-w-0 items-center gap-0.5 text-foreground/55">
      {prefix}

      <DropdownMenu>
        <Trigger title="Engine" disabled={disabled}>{AGENT_LABEL[provider]}</Trigger>
        <DropdownMenuContent align="start" className="min-w-44">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Engine</DropdownMenuLabel>
          {(['claude', 'codex'] as const).map(p => (
            <Row key={p} active={p === provider} hint={available[p] ? undefined : 'not found'} onSelect={() => onModel(`${AGENT_MODEL_PREFIX[p]}default`)}>
              {AGENT_LABEL[p]}
            </Row>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="px-label opacity-50">·</span>

      <DropdownMenu>
        <Trigger title="Model" disabled={disabled} shrink>{modelLabel}</Trigger>
        <DropdownMenuContent align="start" className="max-h-72 min-w-52 overflow-y-auto">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">{AGENT_LABEL[provider]} model</DropdownMenuLabel>
          <Row active={model === 'default'} hint="CLI default" onSelect={() => onModel(`${AGENT_MODEL_PREFIX[provider]}default`)}>Default</Row>
          {models.filter(m => m.id !== 'default').map(m => (
            <Row key={m.id} active={m.id === model} hint={m.description} onSelect={() => onModel(`${AGENT_MODEL_PREFIX[provider]}${m.id}`)}>
              {m.name}
            </Row>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="px-label opacity-50">·</span>

      <DropdownMenu>
        <Trigger title={folder} disabled={disabled} shrink>{isHome ? 'Home' : folderName(folder)}</Trigger>
        <DropdownMenuContent align="start" className="min-w-56 max-w-72">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Working folder</DropdownMenuLabel>
          {folders.map(f => (
            <Row key={f} active={norm(f) === norm(folder)} hint={norm(f) === norm(homeFolder) ? undefined : f} onSelect={() => onFolder(f)}>
              {norm(f) === norm(homeFolder) ? <span className="inline-flex items-center gap-1.5"><Home className="size-3" />Home</span> : folderName(f)}
            </Row>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onPickFolder} className="gap-2 text-xs">
            <FolderOpen className="size-3.5" /> Choose folder…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="px-label opacity-50">·</span>

      <DropdownMenu>
        <Trigger title="Permissions" disabled={disabled} danger={permission === 'full'}>
          {PERMISSIONS.find(p => p.id === permission)?.label ?? permission}
        </Trigger>
        <DropdownMenuContent align="start" className="min-w-52">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Permissions</DropdownMenuLabel>
          {PERMISSIONS.map(p => (
            <Row key={p.id} active={p.id === permission} hint={p.hint} onSelect={() => onPermission(p.id)}>{p.label}</Row>
          ))}
          <DropdownMenuSeparator />
          <p className="max-w-72 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {provider === 'codex' ? 'Full access automatically reviews eligible requests. Required browser confirmations still appear.' : 'Full access uses Claude’s bypass mode. Browser security checks still apply.'}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
