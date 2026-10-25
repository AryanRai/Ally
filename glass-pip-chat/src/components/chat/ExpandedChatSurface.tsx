import { Activity, memo, startTransition, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';

export const CHAT_COLLAPSE_MS = 200;

// Keep the last visible tree unchanged during the exit fade and while dormant.
// In particular, a collapsed parent's empty timeline must not erase the cache.
const RetainedContent = memo(
  ({ children }: { children: ReactNode; frozen: boolean }) => children,
  (_previous, next) => next.frozen,
);

/** One retained expanded view. Activity suspends its effects when fully hidden. */
export default function ExpandedChatSurface({ collapsed, transcript, children }: { collapsed: boolean; transcript: ReactNode; children?: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  const opened = useRef(false);
  const transcriptOpened = useRef(false);
  if (!collapsed) opened.current = true;
  if (revealed) transcriptOpened.current = true;
  const [dormant, setDormant] = useState(true);

  useEffect(() => {
    if (!collapsed) return;
    const timer = setTimeout(() => { setDormant(true); setRevealed(false); }, CHAT_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [collapsed]);
  useEffect(() => {
    if (collapsed || !dormant) return;
    // Paint the new window/header/composer before mounting a long transcript
    // or reconnecting its effects. A reversal cancels both scheduled frames.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => startTransition(() => {
        setRevealed(true);
        setDormant(false);
      }));
    });
    return () => cancelAnimationFrame(frame);
  }, [collapsed, dormant]);

  // A pill that has never opened need not construct any transcript yet.
  if (!opened.current) return null;
  const waitingForReveal = !collapsed && dormant && !revealed;

  return (
    <motion.div
      className="flex flex-col h-[calc(100%-44px)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: collapsed ? 0 : 1 }}
      transition={{ duration: CHAT_COLLAPSE_MS / 1000 }}
      inert={collapsed}
      aria-hidden={collapsed || undefined}
      style={{ display: collapsed && dormant ? 'none' : undefined }}
    >
      <Activity mode={collapsed && dormant ? 'hidden' : 'visible'}>
        <motion.div
          className="relative flex min-h-0 flex-1 flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: waitingForReveal ? 0 : 1 }}
          transition={{ duration: CHAT_COLLAPSE_MS / 1000 }}
        >
          {transcriptOpened.current && <Activity mode={waitingForReveal ? 'hidden' : 'visible'}>
            <RetainedContent frozen={collapsed || waitingForReveal}>{transcript}</RetainedContent>
          </Activity>}
        </motion.div>
        <RetainedContent frozen={collapsed}>{children}</RetainedContent>
      </Activity>
    </motion.div>
  );
}
