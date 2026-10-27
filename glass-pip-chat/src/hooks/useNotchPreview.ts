import { useEffect, useRef } from 'react';

type Preview = { question: string; answer: string; thinking: boolean; done: boolean };

const INTERVAL = 160;

/** Mirrors the pill's live reply and greeting into the docked native notch. */
export function useNotchPreview(enabled: boolean, working: boolean, question: string, answer: string, status: string, greeting: string) {
  const pending = useRef<Preview | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const last = useRef(0);
  const wasWorking = useRef(false);
  const finalAnswer = useRef('');
  if (working) finalAnswer.current = answer;

  useEffect(() => { if (enabled) window.pip?.surfacePreview?.({ greeting }); }, [enabled, greeting]);

  useEffect(() => {
    const send = (value: Preview | null) => {
      pending.current = value;
      if (timer.current) return;
      const flush = () => { timer.current = undefined; last.current = Date.now(); window.pip?.surfacePreview?.({ preview: pending.current }); };
      const wait = INTERVAL - (Date.now() - last.current);
      if (wait <= 0 || value === null || value.done) flush();
      else timer.current = setTimeout(flush, wait);
    };
    if (!enabled) { if (wasWorking.current) send(null); wasWorking.current = false; return; }
    if (working) send({ question, answer: answer || status, thinking: !answer, done: false });
    else if (wasWorking.current) {
      if (timer.current) { clearTimeout(timer.current); timer.current = undefined; }
      send(finalAnswer.current ? { question, answer: finalAnswer.current, thinking: false, done: true } : null);
    }
    wasWorking.current = working;
  }, [enabled, working, question, answer, status]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
}
