// Jev (TypeSafe "System One") client: fast typed judgments about a state.
// https://docs.typesafe.ai/introduction/quickstart: POST /v1/systemone with
// `state` + typed `questions` (noul / score / choice). The key stays in the main
// process (config or TYPESAFE_API_KEY), never in the renderer.
import type { RelevanceCategory, RelevanceScores } from './types.js';

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

const CATEGORIES: Record<RelevanceCategory, string> = {
  irrelevant: 'Small talk, noise or unrelated content',
  technical_question: 'Someone asks a technical question',
  relevant_discussion: 'Discussion related to the selected conversation',
  decision_detected: 'A decision is being made or announced',
  action_request: 'Someone asks for something to be done or remembered',
  concept_explanation: 'A concept is introduced that may need explaining',
  potential_reminder: 'Something the user may want to be reminded of later',
  important_screen_change: 'The screen now shows something important',
};

export const JEV_QUESTIONS = {
  relevant: { type: 'noul', instructions: 'The new observations relate to the topics of the selected conversation' },
  question: { type: 'noul', instructions: 'Someone in the new observations asks a substantive question' },
  new_topic: { type: 'noul', instructions: 'A new technical topic or decision is introduced in the new observations' },
  can_help: { type: 'noul', instructions: 'An assistant that knows the selected conversation could usefully explain or recall something here' },
  proactive: { type: 'noul', instructions: 'Showing the user a short note about this right now would help rather than distract' },
  interrupt: { type: 'noul', instructions: 'This is important enough to interrupt the user in the current mode' },
  urgency: { type: 'score', instructions: 'How soon the user needs help with this', criteria: ['Can wait until later', 'Useful within a few minutes', 'Needed right now'] },
  category: { type: 'choice', instructions: 'What kind of event the new observations are', criteria: CATEGORIES },
} as const;

export interface JevConfig {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

export class JevError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/** Map a Jev response onto Ally's scores. Exported for tests. */
export function scoresFromJev(answers: Record<string, any>): RelevanceScores {
  const noul = (k: string) => Number(answers[k]?.noul ?? 0);
  const urgency = answers.urgency;
  const levels = urgency?.legend ? Object.keys(urgency.legend).length : 3;
  const category = answers.category?.choice as RelevanceCategory | undefined;
  return {
    relevant: noul('relevant'),
    question: noul('question'),
    newTopic: noul('new_topic'),
    canHelp: noul('can_help'),
    proactiveUseful: noul('proactive'),
    interrupt: noul('interrupt'),
    urgency: Math.max(0, Math.min(1, Number(urgency?.score ?? 0) / Math.max(1, levels - 1))),
    category: category && category in CATEGORIES ? category : 'irrelevant',
    categoryConfidence: Number(answers.category?.confidence ?? 0),
  };
}

export async function askJev(state: string, cfg: JevConfig, fetchImpl: typeof fetch = fetch): Promise<RelevanceScores> {
  const key = cfg.apiKey || process.env.TYPESAFE_API_KEY;
  if (!key) throw new JevError('No TypeSafe API key configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 6000);
  try {
    const res = await fetchImpl(JEV_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, model: cfg.model || 'jev-latest', questions: JEV_QUESTIONS }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      throw new JevError(`Jev returned ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
    }
    const body = await res.json();
    if (!body?.answers) throw new JevError('Jev response had no answers');
    return scoresFromJev(body.answers);
  } catch (e) {
    if (e instanceof JevError) throw e;
    throw new JevError(controller.signal.aborted ? 'Jev timed out' : e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}
