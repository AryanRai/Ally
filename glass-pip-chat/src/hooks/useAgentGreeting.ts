import { useEffect, useState } from 'react';
import type { AgentProvider } from '@/types/agent';

export function useAgentGreeting(provider: AgentProvider, model: string) {
  const fallback = provider === 'codex' ? 'Ask Codex…' : 'Ask Claude Code…';
  const [value, setValue] = useState<{ key: string; text: string }>();
  const key = `${provider}:${model}`;
  useEffect(() => {
    let disposed = false;
    void window.pip?.agent?.greeting(provider, model).then(text => {
      if (!disposed) setValue({ key, text });
    }).catch(() => { /* Keep the neutral input hint when the agent is offline. */ });
    return () => { disposed = true; };
  }, [provider, model, key]);
  return value?.key === key ? value.text : fallback;
}
