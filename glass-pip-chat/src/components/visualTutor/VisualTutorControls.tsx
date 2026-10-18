import { ArrowLeft, ArrowRight, Check, Eye, Lasso, Layers, Pencil, PencilLine, Undo2, X } from 'lucide-react';
import type { useVisualTutor } from '@/hooks/useVisualTutor';

/** Drawings start in Circle; these controls exist only during an active lesson. */
export default function VisualTutorControls({ tutor, disabled, compact = false }: { tutor: ReturnType<typeof useVisualTutor>; disabled: boolean; compact?: boolean }) {
  if (!tutor.board && !tutor.busy && !tutor.error) return null;
  if (compact) return <details className="relative min-w-0 text-[10px] text-foreground/55"><summary className="flex h-6 cursor-pointer list-none items-center gap-1 rounded-md px-1.5 hover:bg-white/5"><PencilLine className="size-3" />{tutor.busy ? 'Selecting…' : tutor.board?.steps?.length ? `Drawing · ${tutor.board.steps.length}` : 'Selection'}</summary><div className="mt-1 w-64 max-w-full rounded-xl border border-white/10 bg-white/[0.03] p-1"><VisualTutorControls tutor={tutor} disabled={disabled} /></div></details>;
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
