import { useEffect, useState } from 'react';
import type { LiveStudyReply } from '../../electron/watch/liveStudyReply';

export function useLiveStudyReply(key?: string) {
  const [reply, setReply] = useState<LiveStudyReply | null>(null);
  useEffect(() => {
    setReply(null);
    const api = window.pip?.agent;
    if (!key || !api?.liveStudyReply) return;
    let alive = true, received = false;
    const off = api.onLiveStudyReply?.(value => { if (value.key === key) { received = true; setReply(value); } });
    void api.liveStudyReply(key).then(value => { if (alive && !received) setReply(value); }).catch(() => {});
    return () => { alive = false; off?.(); };
  }, [key]);
  // A selected chat never inherits a previous chat's in-flight frame.
  return reply?.key === key ? reply : null;
}
