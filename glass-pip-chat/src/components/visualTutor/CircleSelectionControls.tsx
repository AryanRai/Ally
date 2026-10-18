import { useEffect, useState } from 'react';
import { Lasso, RectangleHorizontal, X } from 'lucide-react';
import type { CircleSelectionState } from '../../../electron/capture/types';

/** Selection tools live in the real acrylic pill, above the frozen canvas. */
export default function CircleSelectionControls() {
  const [state, setState] = useState<CircleSelectionState>();
  useEffect(() => {
    const api = window.pip?.circle;
    if (!api?.onSelection) return;
    let alive = true, changed = false;
    const stop = api.onSelection(value => { changed = true; if (alive) setState(value); });
    void api.selectionState().then(value => { if (alive && !changed) setState(value); });
    return () => { alive = false; stop(); };
  }, []);
  if (!state?.active) return null;
  const action = (value: Parameters<typeof window.pip.circle.selectionAction>[0]) => void window.pip.circle.selectionAction(value);
  const button = 'flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-foreground/65 hover:bg-white/10 disabled:opacity-40';
  return <section aria-label="Ally screen selection" className="mx-1 my-1 min-w-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
    <div className="flex flex-wrap items-center gap-1">
      <button className={button} disabled={state.sending} aria-pressed={state.tool === 'freehand'} onClick={() => action('freehand')}><Lasso className="size-3" />Freehand</button>
      <button className={button} disabled={state.sending} aria-pressed={state.tool === 'rectangle'} onClick={() => action('rectangle')}><RectangleHorizontal className="size-3" />Rectangle</button>
      <button className={button} disabled={!state.ready || state.sending} onClick={() => action('whole')}>Whole screen</button>
      <button className={`${button} ml-auto`} aria-label="Cancel selection" onClick={() => action('cancel')}><X className="size-3" /></button>
    </div>
    <p className="px-2 text-[10px] text-foreground/40">{state.sending ? 'Attaching…' : state.ready ? 'Release to attach · ask in Ally · Esc cancels' : 'Choose a chat before selecting.'}</p>
    {state.error && <p role="alert" className="px-2 text-[11px] text-amber-200">{state.error}</p>}
  </section>;
}
