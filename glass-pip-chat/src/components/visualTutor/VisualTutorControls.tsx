import { ArrowLeft, ArrowRight, Check, Eye, Lasso, Layers, Pencil, PencilLine, Undo2, X } from 'lucide-react';
import type { useVisualTutor } from '@/hooks/useVisualTutor';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Drawings start in Circle; these controls exist only during an active lesson. */
export default function VisualTutorControls({ tutor, disabled, compact = false }: { tutor: ReturnType<typeof useVisualTutor>; disabled: boolean; compact?: boolean }) {
  if (!tutor.board && !tutor.busy && !tutor.error) return null;
  if (compact) return <DrawingChip tutor={tutor} disabled={disabled} />;
  const board = tutor.board, step = board?.steps?.[board.selected];
  const tool = 'grid size-7 shrink-0 place-items-center rounded-[8px] text-foreground/55 transition-colors hover:bg-white/8 hover:text-foreground disabled:opacity-40';
  return <section className="mx-2 my-1 rounded-lg text-[11px] text-foreground/65" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} aria-label="Drawing explanation">
    {(tutor.board || tutor.busy) && <div className="flex min-h-8 items-center gap-2">
      <PencilLine className="size-3.5 shrink-0" />
      <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-foreground" disabled={!board?.steps?.length} onClick={board?.visible ? tutor.hide : tutor.show} title={board?.visible ? 'Minimise drawing' : 'View drawings'}>{tutor.busy ? 'Preparing selection…' : board?.steps?.length ? `Drawing · ${board.selected + 1} / ${board.steps.length}` : 'Selection attached · ask Ally'}</button>
      {board && <><button type="button" aria-label="Circle another area" title="Circle another area to explain" disabled={disabled || tutor.busy} className={tool} onClick={() => void window.pip?.circle.start()}><Lasso className="size-3.5" /></button><button type="button" aria-label="End drawing explanation" className={tool} onClick={tutor.end}><X className="size-3.5" /></button></>}
    </div>}
    {!!board?.steps?.length && <>
      <div className="flex flex-wrap items-center gap-1 pb-1">
        <button className={tool} aria-label="Previous drawing step" disabled={board.selected === 0} onClick={() => tutor.action('previous')}><ArrowLeft className="size-3.5" /></button>
        <button className={tool} aria-label="Next drawing step" disabled={board.selected >= board.steps.length - 1} onClick={() => tutor.action('next')}><ArrowRight className="size-3.5" /></button>
        {!board.following && <button className="px-1 text-[10px]" onClick={() => tutor.action('latest')}>Latest</button>}
        <button className={tool} aria-label="Freeze drawing snapshot" aria-pressed={board.frozen} onClick={() => tutor.action('freeze')}>{board.frozen ? <Layers className="size-3.5" /> : <Eye className="size-3.5" />}</button>
        <button className={tool} aria-label="Sketch on drawing" aria-pressed={board.sketching} onClick={() => { if (!board.visible) tutor.show(); tutor.action('sketch'); }}>{board.sketching ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}</button>
        <button className={tool} aria-label="Undo drawing sketch" disabled={!board.sketches.length} onClick={() => tutor.action('undo')}><Undo2 className="size-3.5" /></button>
        <span className="ml-auto text-[10px] text-foreground/40">Snapshot {new Date(board.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      {step && <details className="mb-1 text-[11px]"><summary className="cursor-pointer truncate text-foreground/65">{step.title}</summary><p className="max-h-24 overflow-y-auto whitespace-pre-wrap py-1 font-light leading-relaxed">{step.explanation}</p></details>}
    </>}
    {tutor.error && <p role="alert" className="pb-2 text-[11px] text-amber-200">{tutor.error}</p>}
  </section>;
}

function DrawingChip({ tutor, disabled }: { tutor: ReturnType<typeof useVisualTutor>; disabled: boolean }) {
  const button = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, width: 240 });
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const bounds = button.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.max(100, Math.min(240, window.innerWidth - 24));
      const height = menu.current?.offsetHeight ?? 220;
      setPosition({ left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)), top: Math.max(12, Math.min(bounds.top - height - 6, window.innerHeight - height - 12)), width });
    };
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { drag.current = null; setOpen(false); button.current?.focus(); } };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true); window.addEventListener('pointerdown', outside); window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape); };
  }, [open]);
  return <><button ref={button} type="button" aria-expanded={open} aria-label="Drawing controls" title="Click for controls · drag out onto the screen to reopen drawing" className="flex h-6 shrink-0 touch-none items-center gap-1 rounded-md px-1.5 text-[10px] text-foreground/55 hover:bg-white/5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setOpen(value => !value); }}
    onPointerDown={event => { if (event.button !== 0 || !tutor.board?.steps?.length) return; drag.current = { x: event.screenX, y: event.screenY, moved: false }; suppressClick.current = false; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => { const current = drag.current; if (current && Math.hypot(event.screenX - current.x, event.screenY - current.y) > 8) { current.moved = true; setOpen(false); } }}
    onPointerUp={event => {
      const current = drag.current; drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (!current?.moved) return;
      suppressClick.current = true;
      if (event.clientX < 0 || event.clientY < 0 || event.clientX > window.innerWidth || event.clientY > window.innerHeight) tutor.showAt({ x: event.screenX, y: event.screenY });
    }}
    onPointerCancel={() => { drag.current = null; suppressClick.current = true; }} onLostPointerCapture={() => { drag.current = null; }} onKeyDown={event => { if (event.key === 'Escape') { drag.current = null; setOpen(false); } }}>
    <PencilLine className="size-3" />{tutor.busy ? 'Selecting…' : tutor.board?.steps?.length ? `Drawing · ${tutor.board.steps.length}` : 'Selection'}
  </button>{open && createPortal(<div ref={menu} role="dialog" aria-label="Drawing tools" className="fixed z-[1000] max-h-[calc(100vh-24px)] overflow-y-auto rounded-lg border border-white/10 bg-black/60 p-1 text-foreground shadow-xl backdrop-blur-xl" style={position}><VisualTutorControls tutor={tutor} disabled={disabled} /></div>, document.body)}</>;
}
