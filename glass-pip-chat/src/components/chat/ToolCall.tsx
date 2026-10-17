import { useState } from 'react';
import { Check, ChevronRight, Circle } from 'lucide-react';
import { Terminal } from '@/components/ai-elements/terminal';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { cn } from '@/lib/utils';
import type { ToolExecution } from '@/types/chat';

interface Described {
  /** Past tense once done ("Ran"), present while running ("Running") */
  done: string;
  running: string;
  target?: string;
  /** Show the target in mono (commands, paths, patterns) */
  mono?: boolean;
  /** Shell command → terminal pane when expanded */
  command?: string;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const tail = (p: string) => p.split(/[\\/]/).filter(Boolean).slice(-2).join('/');

/** Codex wraps commands as `"...\powershell.exe" -Command '…'` (or `bash -lc '…'`); show just the inner command. */
function unwrapShell(cmd: string): string {
  const m = cmd.match(/^"?[^"]*?(?:powershell|pwsh|bash|zsh|sh|cmd)(?:\.exe)?"?\s+(?:-NoProfile\s+)?(?:-Command|-lc|-c|\/c)\s+([\s\S]+)$/i);
  if (!m) return cmd;
  const inner = m[1].trim();
  const q = inner[0];
  return (q === '"' || q === "'") && inner.endsWith(q) ? inner.slice(1, -1) : inner;
}

/**
 * Claude Code / Codex-style one-line description of a tool call:
 * "Ran `git status`", "Read src/app.tsx", "Edited ChatInput.tsx", "Searched web".
 */
export function describeTool(tool: ToolExecution): Described {
  const p = tool.parameters ?? {};
  const name = tool.name;
  const lower = name.toLowerCase();
  const path = str(p.file_path) ?? str(p.path) ?? str(p.notebook_path);

  if ((lower === 'exec' || lower === 'functions.exec') && str(p.input)) {
    return { done: 'Ran', running: 'Running', target: 'script', command: str(p.input) };
  }
  if (['bash', 'shell', 'powershell', 'run_command', 'exec'].includes(lower) || str(p.command) || str(p.cmd)) {
    const command = unwrapShell(str(p.command) ?? str(p.cmd) ?? '');
    return { done: 'Ran', running: 'Running', target: command, mono: true, command };
  }
  if (lower === 'read' || lower === 'view_image') {
    return { done: tool.images?.length ? 'Viewed' : 'Read', running: 'Reading', target: path && tail(path), mono: true };
  }
  if (lower === 'write') return { done: 'Wrote', running: 'Writing', target: path && tail(path), mono: true };
  if (['edit', 'multiedit', 'notebookedit'].includes(lower)) return { done: 'Edited', running: 'Editing', target: path && tail(path), mono: true };
  if (lower === 'edit_files' || lower.endsWith('apply_patch')) {
    const changes = Array.isArray(p.changes) ? (p.changes as { path?: string }[]) : [];
    const patchPaths = typeof p.input === 'string' ? [...p.input.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map(m => m[1].trim()) : [];
    const target = changes.length === 1 && changes[0].path ? tail(changes[0].path) : changes.length ? `${changes.length} files` : patchPaths.length === 1 ? tail(patchPaths[0]) : patchPaths.length ? `${patchPaths.length} files` : undefined;
    return { done: 'Edited', running: 'Editing', target, mono: changes.length === 1 };
  }
  if (lower === 'grep' || lower === 'glob') return { done: 'Searched', running: 'Searching', target: str(p.pattern), mono: true };
  if (lower === 'websearch' || lower === 'web_search') return { done: 'Searched web', running: 'Searching web', target: str(p.query) };
  if (lower === 'webfetch') {
    const url = str(p.url);
    let host = url;
    try { if (url) host = new URL(url).host; } catch { /* keep raw */ }
    return { done: 'Fetched', running: 'Fetching', target: host, mono: true };
  }
  if (lower === 'task' || lower === 'agent') return { done: 'Ran agent', running: 'Running agent', target: str(p.description) };
  if (lower === 'todowrite' || lower === 'todo_list' || lower === 'update_plan') return { done: 'Updated plan', running: 'Updating plan' };
  // MCP tools: "mcp__server__tool" (Claude) or "server.tool" (Codex)
  const mcp = name.match(/^mcp__(.+?)__(.+)$/) ?? name.match(/^([^.]+)\.(.+)$/);
  if (mcp) return { done: 'Called', running: 'Calling', target: `${mcp[1]} · ${mcp[2]}`, mono: true };
  return { done: name, running: name };
}

function asText(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

// ---------------------------------------------------------------------------
// Edits → diff lines
// ---------------------------------------------------------------------------

type DiffLine = { sign: '+' | '-' | ' '; text: string };

/** Old/new text as a diff: unchanged lines at the edges become context, the middle is −/+. */
function diffLines(before: string, after: string): DiffLine[] {
  const a = before ? before.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n') : [];
  const b = after ? after.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n') : [];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const ctx = (lines: string[]) => lines.map(text => ({ sign: ' ' as const, text }));
  return [
    ...ctx(a.slice(Math.max(0, start - 2), start)),
    ...a.slice(start, endA).map(text => ({ sign: '-' as const, text })),
    ...b.slice(start, endB).map(text => ({ sign: '+' as const, text })),
    ...ctx(a.slice(endA, endA + 2)),
  ];
}

export function editDiff(tool: ToolExecution): DiffLine[] | null {
  const p = tool.parameters ?? {};
  const lower = tool.name.toLowerCase();
  if (lower.endsWith('apply_patch') && typeof p.input === 'string') {
    return p.input.split(/\r?\n/).flatMap<DiffLine>(line => {
      if (/^\*\*\* (?:Add|Update|Delete|Move)/.test(line) || line.startsWith('@@')) return [{ sign: ' ', text: line }];
      if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) return [{ sign: line[0] as DiffLine['sign'], text: line.slice(1) }];
      return [];
    });
  }
  if (lower === 'edit_files' && Array.isArray(p.changes)) {
    const lines = p.changes.flatMap<DiffLine>((change: { path?: string; diff?: string }) => change.diff ? [
      { sign: ' ', text: change.path ?? '' },
      ...change.diff.split(/\r?\n/).filter(line => !/^(---|\+\+\+)/.test(line)).map(line => ({ sign: (/^[+\- ]/.test(line) ? line[0] : ' ') as DiffLine['sign'], text: /^[+\- ]/.test(line) ? line.slice(1) : line })),
    ] : []);
    return lines.length ? lines : null;
  }
  if (lower === 'edit' && typeof p.old_string === 'string' && typeof p.new_string === 'string') {
    return diffLines(p.old_string, p.new_string);
  }
  if (lower === 'multiedit' && Array.isArray(p.edits)) {
    return (p.edits as { old_string?: string; new_string?: string }[]).flatMap((e, i) => [
      ...(i > 0 ? [{ sign: ' ' as const, text: '⋯' }] : []),
      ...diffLines(e.old_string ?? '', e.new_string ?? ''),
    ]);
  }
  if (lower === 'write' && typeof p.content === 'string') {
    return diffLines('', p.content);
  }
  return null;
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-md border border-border bg-black/40 py-1 font-mono text-[11px] leading-relaxed">
      {lines.map((l, i) => (
        <div
          key={i}
          className={cn(
            'whitespace-pre-wrap break-all px-2',
            l.sign === '+' && 'bg-emerald-400/10 text-emerald-300/90',
            l.sign === '-' && 'bg-red-400/10 text-red-300/85',
            l.sign === ' ' && 'text-foreground/40'
          )}
        >
          <span className="mr-2 select-none opacity-60">{l.sign}</span>
          {l.text}
        </div>
      ))}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Plans (Claude TodoWrite / Codex todo_list)
// ---------------------------------------------------------------------------

type Todo = { text: string; state: 'done' | 'active' | 'pending' };

function todosOf(tool: ToolExecution): Todo[] | null {
  const p = tool.parameters ?? {};
  if (Array.isArray(p.todos)) {
    return (p.todos as { content?: string; activeForm?: string; status?: string }[]).map(t => ({
      text: (t.status === 'in_progress' ? t.activeForm : t.content) ?? t.content ?? '',
      state: t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'active' : 'pending',
    }));
  }
  if (Array.isArray(p.items)) {
    const items = p.items as { text?: string; completed?: boolean }[];
    const firstOpen = items.findIndex(t => !t.completed);
    return items.map((t, i) => ({ text: t.text ?? '', state: t.completed ? 'done' : i === firstOpen ? 'active' : 'pending' }));
  }
  if (Array.isArray(p.plan)) {
    return (p.plan as { step?: string; status?: string }[]).map(t => ({
      text: t.step ?? '',
      state: t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'active' : 'pending',
    }));
  }
  return null;
}

function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <ul className="mb-1 ml-3.5 mt-0.5 space-y-0.5 border-l border-border pl-3 text-[12.5px]">
      {todos.map((t, i) => (
        <li key={i} className="flex items-start gap-2">
          {t.state === 'done' ? (
            <Check className="mt-0.5 size-3 shrink-0 text-foreground/40" />
          ) : (
            <Circle className={cn('mt-0.5 size-3 shrink-0', t.state === 'active' ? 'fill-foreground/80 text-foreground/80' : 'text-foreground/30')} />
          )}
          <span
            className={cn(
              t.state === 'done' && 'text-foreground/35 line-through',
              t.state === 'active' && 'font-medium text-foreground/90',
              t.state === 'pending' && 'text-foreground/60'
            )}
          >
            {t.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Images (screenshots, image reads, attachments)
// ---------------------------------------------------------------------------

/** Thumbnails; click one to see it full width, click again to shrink. */
export function ImageStrip({ images, className }: { images: string[]; className?: string }) {
  const [zoomed, setZoomed] = useState<number | null>(null);
  if (zoomed !== null && images[zoomed]) {
    return (
      <img
        src={images[zoomed]}
        alt=""
        onClick={() => setZoomed(null)}
        className={cn('max-h-[60vh] max-w-full cursor-zoom-out rounded-md border border-border object-contain', className)}
      />
    );
  }
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {images.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          onClick={() => setZoomed(i)}
          className="h-20 max-w-48 cursor-zoom-in rounded-md border border-border object-cover transition-opacity hover:opacity-80"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

/** One agent tool call as a compact, expandable line (Codex / Claude Code style). */
export default function ToolCall({ tool }: { tool: ToolExecution }) {
  const [open, setOpen] = useState(false);
  const d = describeTool(tool);
  const running = tool.status === 'executing' || tool.status === 'pending';
  const failed = tool.status === 'error';
  const output = asText(tool.error ?? tool.result);
  const diff = editDiff(tool);
  const todos = todosOf(tool);
  const changes = Array.isArray(tool.parameters?.changes) ? (tool.parameters!.changes as { path?: string; kind?: string }[]) : null;
  const added = diff?.filter(l => l.sign === '+').length ?? 0;
  const removed = diff?.filter(l => l.sign === '-').length ?? 0;
  const hasDetails = !todos && !!(output || d.command || diff || changes || Object.keys(tool.parameters ?? {}).length);

  return (
    <div className="not-prose my-0.5">
      <button
        type="button"
        onClick={() => hasDetails && setOpen(o => !o)}
        className={cn('group/tool flex w-full min-w-0 items-center gap-2 rounded py-0.5 text-left text-[12.5px] transition-colors', hasDetails && 'cursor-pointer')}
      >
        {/* status dot: pulsing while running, red on failure */}
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            running ? 'animate-pulse bg-foreground' : failed ? 'bg-destructive' : 'bg-foreground/35'
          )}
        />
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          {running ? (
            <Shimmer as="span" duration={1.4} className="shrink-0 font-medium">{d.running}</Shimmer>
          ) : (
            <span className={cn('shrink-0 font-medium', failed ? 'text-destructive/90' : 'text-foreground/75')}>{d.done}</span>
          )}
          {d.target && (
            <span className={cn('truncate text-foreground/45', d.mono && 'font-mono text-[11.5px]')} title={d.target}>
              {d.target}
            </span>
          )}
          {diff && (added > 0 || removed > 0) && (
            <span className="shrink-0 font-mono text-[11px]">
              {added > 0 && <span className="text-emerald-400/80">+{added}</span>}
              {added > 0 && removed > 0 && ' '}
              {removed > 0 && <span className="text-red-400/80">−{removed}</span>}
            </span>
          )}
          {failed && <span className="shrink-0 text-[11px] text-destructive/70">failed</span>}
        </span>
        {hasDetails && (
          <ChevronRight className={cn('size-3 shrink-0 text-foreground/30 opacity-0 transition-all group-hover/tool:opacity-100', open && 'rotate-90 opacity-100')} />
        )}
      </button>

      {/* Always visible, like the CLIs: the plan checklist and any images */}
      {todos && <TodoList todos={todos} />}
      {!!tool.images?.length && <ImageStrip images={tool.images} className="mb-1 ml-3.5 mt-1" />}

      {open && (
        <div className="mb-1.5 ml-3.5 mt-1 space-y-2 border-l border-border pl-3">
          {d.command !== undefined ? (
            <Terminal output={`$ ${d.command}\n${output}`} isStreaming={running} className="max-h-72" />
          ) : diff ? (
            <>
              <DiffView lines={diff} />
              {failed && output && <pre className="whitespace-pre-wrap font-mono text-[11px] text-destructive/80">{output}</pre>}
            </>
          ) : changes ? (
            <ul className="py-1 font-mono text-[11px] text-foreground/60">
              {changes.map((c, i) => (
                <li key={i}>
                  <span className={cn('mr-2 inline-block w-3', c.kind === 'add' ? 'text-emerald-400/80' : c.kind === 'delete' ? 'text-red-400/80' : 'text-foreground/40')}>
                    {c.kind === 'add' ? 'A' : c.kind === 'delete' ? 'D' : 'M'}
                  </span>
                  {c.path}
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-2 py-1">
              {Object.keys(tool.parameters ?? {}).length > 0 && (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/50">
                  {JSON.stringify(tool.parameters, null, 2)}
                </pre>
              )}
              {output && (
                <pre
                  className={cn(
                    'max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed',
                    failed ? 'text-destructive/80' : 'text-foreground/65'
                  )}
                >
                  {output}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
