import type { AgentRunOptions } from '../agent/types.js';

/** No classifier request or model swap. Ambiguous work retains a smart baseline. */
export function studyReasoning(words: string, context = ''): AgentRunOptions['reasoningEffort'] {
  const request = words.trim();
  const technical = /\b(derive|derivation|prove|proof|solve|calculate|debug|diagnos\w*|fix|implement|design|optimi[sz]\w*|trade.?offs?|verify|check.*(?:correct|error)|fourier|integral|differential|eigen\w*|matrix|equation|circuit|mechanism)\b/i;
  if (technical.test(request) || /[∫Σ∑∂∇]|\\(?:frac|int|sum|partial)|\b(?:fft|dft|ode|pde)\b/i.test(request + ' ' + context)) return 'high';
  if (/\b(step.by.step|compare|analyse|analyze|why|how.*work)\b/i.test(request) || request.length > 700) return 'high';
  // Only explicit routine requests qualify for the fast path. A screenshot and
  // an underspecified "explain this" must never be mistaken for easy work.
  if (request.length < 160 && /^(?:hi|hello|hey|thanks|thank you)[!. ]*$/i.test(request)) return 'low';
  if (request.length < 200 && /^(?:read (?:this|that)(?: aloud)?|repeat (?:that|the last sentence)|what (?:is|does) (?:this|that) (?:say|button say)|zoom in|continue|next step)[?.! ]*$/i.test(request)) return 'low';
  return 'medium';
}
