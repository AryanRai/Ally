import type { AgentRunOptions } from '../agent/types.js';

/** No classifier request or model swap. Ambiguous work retains a smart baseline. */
export function studyReasoning(words: string, context = ''): AgentRunOptions['reasoningEffort'] {
  const request = words.trim();
  // Route the requested work, not a subject name or a formula left on the board.
  const technical = /\b(derive|derivation|prove|proof|solve|calculate|debug|diagnos\w*|fix|implement|design|optimi[sz]\w*|trade.?offs?|verify|check.*(?:correct|error))\b/i;
  if (technical.test(request) || /\b(step.by.step|compare|analyse|analyze)\b/i.test(request) || request.length > 700) return 'high';
  // Only explicit routine requests qualify for the fast path. A screenshot and
  // an underspecified "explain this" must never be mistaken for easy work.
  if (request.length < 160 && /^(?:hi|hello|hey|thanks|thank you)[!. ]*$/i.test(request)) return 'low';
  if (/^(?:yes|no|yeah|yep|nope|okay|ok|not sure|i (?:don['’]t|do not) know)[?.! ]*$/i.test(request)) return 'low';
  if (request.length < 200 && /^(?:read (?:this|that)(?: aloud)?|repeat (?:that|the last sentence)|what (?:is|does) (?:this|that) (?:say|button say)|zoom in|continue|next step)[?.! ]*$/i.test(request)) return 'low';
  // Only a current selected expression can escalate a deictic maths question.
  // Never scan serialized scene objects, old narration, receipts or file paths.
  let selected = '';
  try { const data = JSON.parse(context); if (typeof data.highlight?.text === 'string') selected = data.highlight.text.slice(0, 12000); } catch { /* Unknown context retains medium. */ }
  if (/[∫Σ∑∂∇]|\\(?:frac|int|sum|partial)|\b(?:fft|dft|ode|pde)\b/i.test(request)
    || (/\b(this|that|here|selected)\b/i.test(request) && /[∫Σ∑∂∇]|\\(?:frac|int|sum|partial)|\b(?:fft|dft|ode|pde)\b/i.test(selected))) return 'high';
  return 'medium';
}
