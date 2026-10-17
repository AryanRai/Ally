import { useEffect, useRef } from 'react';
import 'agent-robot-avatar';
import type { AgentRobotAvatar } from 'agent-robot-avatar';
import { useLook } from '@/lib/look';

export type RobotStatus = 'idle' | 'thinking' | 'tool' | 'listening' | 'seeing';

/** A finished turn, so the robot can celebrate or wince once. */
export interface RobotPulse {
  kind: 'success' | 'failure';
  at: number;
}

interface RobotAvatarProps {
  size: number;
  status?: RobotStatus;
  pulse?: RobotPulse | null;
  className?: string;
  trackGlobalCursor?: boolean;
}

/**
 * The agent-robot-avatar ("Grok bot") styled from Settings › Look. Its eyes
 * follow the cursor anywhere on screen, and its face mirrors the agent.
 */
export default function RobotAvatar({ size, status = 'idle', pulse, trackGlobalCursor = true, className }: RobotAvatarProps) {
  const ref = useRef<AgentRobotAvatar>(null);
  const previous = useRef<RobotStatus>('idle');
  const { look } = useLook();
  const robot = look.robot;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.setHeadRoundness?.(robot.headRoundness);
    el.setAntennaFlash?.(robot.antennaFlash);
    el.setPointerFollow?.(robot.followCursor);
  }, [robot.headRoundness, robot.antennaFlash, robot.followCursor]);

  // The avatar only sees pointer events inside this window, so replay the global
  // cursor as pointermoves, pulled in to stay inside its attention radius.
  useEffect(() => {
    const pip = window.pip;
    if (!pip || !robot.followCursor || !trackGlobalCursor) return;
    pip.watchCursor(true);
    const unsubscribe = pip.onCursorMoved(({ x, y }) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const reach = Math.max(r.width, r.height) * 1.4;
      const k = dist > reach ? reach / dist : 1;
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: cx + dx * k, clientY: cy + dy * k, pointerType: 'mouse' }));
    });
    return () => {
      unsubscribe();
      pip.watchCursor(false);
    };
  }, [robot.followCursor, trackGlobalCursor]);

  // Mirror the agent's state on the robot's face
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const was = previous.current;
    previous.current = status;
    if (was === status) return;
    if (was === 'thinking' || was === 'tool') el.stopWaiting();
    if (was === 'listening') el.input(false);
    if (status === 'thinking') void el.startWaiting();
    else if (status === 'tool') void el.play('inspect');
    else if (status === 'seeing') void el.play('surprise');
    else if (status === 'listening') void el.input(true);
  }, [status]);

  useEffect(() => {
    if (pulse) void ref.current?.play(pulse.kind);
  }, [pulse]);

  return (
    <agent-robot-avatar
      ref={ref}
      size={size}
      color={robot.color}
      auto-sleep={robot.autoSleepMinutes * 60_000}
      motion={robot.motion}
      className={className}
    />
  );
}
