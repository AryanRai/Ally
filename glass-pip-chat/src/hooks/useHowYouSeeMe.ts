/**
 * useHowYouSeeMe — React hook for HowYouSeeMe robot perception integration.
 *
 * When robot mode is active this hook:
 *  - Polls the MCP server every 10s for a status summary
 *  - Exposes a tool executor the chat loop can call
 *  - Provides a context string to prepend to the robot system prompt
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  pingHowYouSeeMe,
  getRobotStatus,
  getRobotContext,
  executeRobotTool,
  RobotStatus,
} from '../services/howYouSeeMeService';

export interface HowYouSeeMeState {
  available: boolean;
  checking: boolean;
  status: RobotStatus | null;
  /** Live context string to inject into the robot system prompt */
  liveContext: string;
}

export interface HowYouSeeMeActions {
  /** Execute any HowYouSeeMe tool by name */
  executeTool: (toolName: string, args: Record<string, unknown>) => Promise<string>;
  /** Force a status refresh */
  refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 10_000;

export function useHowYouSeeMe(robotModeActive: boolean): HowYouSeeMeState & HowYouSeeMeActions {
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [liveContext, setLiveContext] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!robotModeActive) return;
    setChecking(true);
    try {
      const reachable = await pingHowYouSeeMe();
      setAvailable(reachable);

      if (reachable) {
        const [s, ctx] = await Promise.all([getRobotStatus(), getRobotContext()]);
        setStatus(s);
        if (ctx) {
          setLiveContext(`\n\n--- LIVE ROBOT STATE ---\n${s.summary}\n${ctx}`);
        } else {
          setLiveContext(`\n\n--- LIVE ROBOT STATE ---\n${s.summary}`);
        }
      } else {
        setStatus({ summary: 'HowYouSeeMe offline', available: false });
        setLiveContext('\n\n--- ROBOT STATE ---\nHowYouSeeMe perception system is offline.');
      }
    } catch {
      setAvailable(false);
      setLiveContext('');
    } finally {
      setChecking(false);
    }
  }, [robotModeActive]);

  // Start/stop polling when robot mode toggles
  useEffect(() => {
    if (robotModeActive) {
      refresh();
      pollRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setAvailable(false);
      setStatus(null);
      setLiveContext('');
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [robotModeActive, refresh]);

  const executeTool = useCallback(
    (toolName: string, args: Record<string, unknown>) => executeRobotTool(toolName, args),
    []
  );

  return { available, checking, status, liveContext, executeTool, refresh };
}
