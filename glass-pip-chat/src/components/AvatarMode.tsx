import { useEffect, useRef } from 'react';
import 'agent-robot-avatar';
import type { AgentRobotAvatar } from 'agent-robot-avatar';

export type AvatarStatus = 'idle' | 'thinking' | 'tool' | 'listening';

/** A finished turn, so the robot can celebrate or wince once. */
export interface AvatarPulse {
  kind: 'success' | 'failure';
  at: number;
}

interface AvatarModeProps {
  status: AvatarStatus;
  pulse: AvatarPulse | null;
  /** Shown on hover: what the agent is up to */
  caption?: string;
  onExpand: () => void;
}

export const AVATAR_WINDOW = { width: 136, height: 144 };
const AVATAR_SIZE = 104;
const AUTO_SLEEP_MS = 3 * 60 * 1000;

/**
 * Collapsed Ally: a little robot (agent-robot-avatar) that floats on the desktop,
 * reacts to what the agent is doing, and watches the cursor anywhere on screen.
 */
export default function AvatarMode({ status, pulse, caption, onExpand }: AvatarModeProps) {
  const avatarRef = useRef<AgentRobotAvatar>(null);
  const previous = useRef<AvatarStatus>('idle');

  // The avatar only sees pointer events inside this tiny window, so replay the
  // global cursor as pointermoves. Far-away positions are pulled in along the
  // same direction to stay inside the avatar's attention radius.
  useEffect(() => {
    const pip = window.pip;
    if (!pip) return;
    pip.watchCursor(true);
    const unsubscribe = pip.onCursorMoved(({ x, y }) => {
      const el = avatarRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const reach = Math.max(r.width, r.height) * 1.4;
      const scale = dist > reach ? reach / dist : 1;
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + dx * scale, clientY: cy + dy * scale, pointerType: 'mouse' }));
    });
    return () => {
      unsubscribe();
      pip.watchCursor(false);
    };
  }, []);

  // Mirror the agent's state on the robot's face
  useEffect(() => {
    const el = avatarRef.current;
    if (!el) return;
    const was = previous.current;
    previous.current = status;
    if (was === status) return;
    if (was === 'thinking' || was === 'tool') el.stopWaiting();
    if (was === 'listening') el.input(false);
    if (status === 'thinking') void el.startWaiting();
    else if (status === 'tool') void el.play('inspect');
    else if (status === 'listening') void el.input(true);
  }, [status]);

  useEffect(() => {
    if (pulse) void avatarRef.current?.play(pulse.kind);
  }, [pulse]);

  return (
    <div
      className="w-full h-full flex items-center justify-center select-none"
      // The transparent margin moves the window; the robot itself stays interactive
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      title={caption ? `${caption}\nClick to open Ally` : 'Click to open Ally · drag the edge to move'}
    >
      <div
        // Soft halo keeps the dark robot visible on dark wallpapers
        style={{ WebkitAppRegion: 'no-drag', filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.45))' } as React.CSSProperties}
        onClick={onExpand}
      >
        <agent-robot-avatar ref={avatarRef} size={AVATAR_SIZE} auto-sleep={AUTO_SLEEP_MS} />
      </div>
    </div>
  );
}
