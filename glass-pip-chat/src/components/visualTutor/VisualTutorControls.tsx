import { Lasso, PencilLine, X } from 'lucide-react';
import type { useVisualTutor } from '@/hooks/useVisualTutor';

/** Drawings start in Circle; these controls exist only during an active lesson. */
export default function VisualTutorControls({ tutor, disabled }: { tutor: ReturnType<typeof useVisualTutor>; disabled: boolean }) {
  if (!tutor.board && !tutor.busy && !tutor.error) return null;
  return <section className="mx-2 my-1 rounded-lg text-[11px] text-foreground/65" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} aria-label="Drawing explanation">
    {(tutor.board || tutor.busy) && <div className="flex min-h-8 items-center gap-2">
      <PencilLine className="size-3.5" /><span className="flex-1">{tutor.busy ? 'Preparing drawings…' : 'Drawing explanation'}</span>
      {tutor.board && <><button type="button" aria-label="Circle another area" title="Circle another area to explain" disabled={disabled || tutor.busy} className="p-1 hover:text-foreground disabled:opacity-40" onClick={() => void window.pip?.circle.start()}><Lasso className="size-3.5" /></button><button type="button" aria-label="End drawing explanation" className="p-1 hover:text-foreground" onClick={tutor.end}><X className="size-3.5" /></button></>}
    </div>}
    {tutor.error && <p role="alert" className="pb-2 text-[11px] text-amber-200">{tutor.error}</p>}
  </section>;
}
