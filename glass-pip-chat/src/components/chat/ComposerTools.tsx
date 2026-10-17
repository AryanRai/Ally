import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComposerTool {
  id: string;
  icon: ReactNode;
  label: string;
  /** Right-aligned detail in the expanded row (folder name, permission level…) */
  detail?: string;
  active?: boolean;
  /** Draws the row in the destructive colour (e.g. full-access permission) */
  danger?: boolean;
  hidden?: boolean;
  onClick: () => void;
}

/**
 * Composer tool strip in the style of Orbit's map "Spatial markers" card:
 * icon-only while collapsed; hovering the chevron grows the card (upwards, since it
 * sits at the bottom) into labelled rows, and leaving it collapses again.
 */
export default function ComposerTools({ tools }: { tools: ComposerTool[] }) {
  const [expanded, setExpanded] = useState(false);
  const [anchor, setAnchor] = useState({ left: 0, bottom: 0 });
  const stripRef = useRef<HTMLDivElement>(null);
  const visible = tools.filter(t => !t.hidden);

  // The card lives in a portal (the streaming transcript otherwise paints over it),
  // so place it just above the strip whenever it opens
  useLayoutEffect(() => {
    if (!expanded || !stripRef.current) return;
    const r = stripRef.current.getBoundingClientRect();
    setAnchor({ left: r.left, bottom: window.innerHeight - r.top + 6 });
  }, [expanded]);

  return (
    <div className="relative min-w-0" onMouseLeave={() => setExpanded(false)}>
      {/* Expanded card: labelled rows, grows up out of the strip.
          React treats portal children as part of this tree, so hovering the card keeps it open. */}
      {createPortal(
      <div
        className={cn(
          'fixed z-[1000] grid w-56 border border-white/10 bg-[rgb(14,14,14)]/95 shadow-[0_12px_38px_rgba(0,0,0,0.58)] transition-[grid-template-rows,opacity] duration-200 ease-out',
          expanded ? 'pointer-events-auto grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'
        )}
        style={{ borderRadius: 12, left: anchor.left, bottom: anchor.bottom }}
      >
        <div className="overflow-hidden">
          <div className="p-1">
            <p className="px-label px-2.5 pb-1 pt-1.5">Tools</p>
            {visible.map(tool => (
              <button
                key={tool.id}
                type="button"
                onClick={tool.onClick}
                className={cn(
                  'flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors',
                  tool.active ? 'bg-white/10 text-foreground' : 'text-foreground/65 hover:bg-white/5 hover:text-foreground',
                  tool.danger && 'text-destructive/90'
                )}
              >
                <span className="flex shrink-0 items-center [&>svg]:size-3.5">{tool.icon}</span>
                <span className="flex-1 truncate">{tool.label}</span>
                {tool.detail && <span className="max-w-24 truncate font-mono text-[10px] text-foreground/35">{tool.detail}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>,
      document.body
      )}

      {/* Collapsed strip: icon-only tools + chevron */}
      <div ref={stripRef} className="flex items-center gap-0.5 rounded-[10px] border border-white/10 bg-[rgba(12,12,12,0.55)] p-0.5">
        {visible.map(tool => (
          <button
            key={tool.id}
            type="button"
            title={tool.detail ? `${tool.label} · ${tool.detail}` : tool.label}
            onClick={tool.onClick}
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-[7px] transition-colors [&>svg]:size-3.5',
              tool.active ? 'bg-white/12 text-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.14)]' : 'text-foreground/55 hover:bg-white/6 hover:text-foreground',
              tool.danger && 'text-destructive/90'
            )}
          >
            {tool.icon}
          </button>
        ))}
        <button
          type="button"
          title="Show tool labels"
          aria-expanded={expanded}
          onMouseEnter={() => setExpanded(true)}
          onClick={() => setExpanded(e => !e)}
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-[7px] transition-[background,color,transform] duration-150',
            expanded ? 'bg-white/8 text-foreground' : 'text-foreground/40 hover:bg-white/8 hover:text-foreground'
          )}
        >
          <ChevronUp className={cn('size-3.5 transition-transform duration-150', expanded && 'rotate-180')} />
        </button>
      </div>
    </div>
  );
}
