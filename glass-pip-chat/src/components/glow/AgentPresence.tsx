import { useEffect, useState } from 'react';
import { useLook } from '@/lib/look';
import { cn } from '@/lib/utils';
import type { OrbMood } from './EnergyOrb';
import LiveOrb from './LiveOrb';
import RobotAvatar, { type RobotPulse, type RobotStatus } from './RobotAvatar';

interface AgentPresenceProps {
  size: number;
  mood: OrbMood;
  /** Ally is seeing or hearing (screen capture, voice, perception tools): show the robot */
  sensing: boolean;
  robotStatus?: RobotStatus;
  pulse?: RobotPulse | null;
  amplitude?: number;
  /** Always show the robot (e.g. the collapsed pill while the cursor is near) */
  forceRobot?: boolean;
  trackGlobalCursor?: boolean;
  className?: string;
}

/**
 * The agent's face: Mary's orb while you talk to it, morphing into the robot
 * whenever Ally sees or hears (Settings › Look › Morph into robot).
 */
export default function AgentPresence({ size, mood, sensing, robotStatus, pulse, amplitude, forceRobot, trackGlobalCursor = true, className }: AgentPresenceProps) {
  const { look, colors } = useLook();
  const robot = forceRobot || (look.morphToRobot && sensing);
  const morph = 'transition-[opacity,transform,filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]';
  const [robotPainted, setRobotPainted] = useState(robot);
  useEffect(() => {
    if (robot) { setRobotPainted(true); return; }
    // Opacity alone leaves the custom avatar drawing and forcing SVG layout.
    // Its ResizeObserver pauses frames without losing state when layout is zero.
    // Retain layout until the existing fade completes, and restore it immediately
    // if the morph reverses while that fade is still in progress.
    const timer = setTimeout(() => setRobotPainted(false), 500);
    return () => clearTimeout(timer);
  }, [robot]);

  return (
    <div className={cn('relative grid place-items-center', className)} style={{ width: size, height: size }}>
      <div
        className={cn('absolute inset-0 grid place-items-center', morph)}
        style={{ opacity: robot ? 0 : 1, transform: robot ? 'scale(0.4) rotate(-40deg)' : 'scale(1)', filter: robot ? 'blur(6px)' : 'none' }}
      >
        <LiveOrb style={look.orbStyle} colors={colors} size={size} mood={mood} amplitude={amplitude} />
      </div>
      <div
        className={cn('absolute inset-0 grid place-items-center', morph, !robot && 'pointer-events-none')}
        style={{ display: robot || robotPainted ? undefined : 'none', opacity: robot ? 1 : 0, transform: robot ? 'scale(1)' : 'scale(1.6)', filter: robot ? 'none' : 'blur(6px)' }}
      >
        <RobotAvatar size={Math.round(size * 1.15)} status={robot ? robotStatus ?? (sensing ? 'seeing' : 'idle') : 'idle'} pulse={pulse} trackGlobalCursor={trackGlobalCursor && !!robot} />
      </div>
    </div>
  );
}
