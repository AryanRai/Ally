// Interruption manager: decides whether (and where) an agent note surfaces.
// Not every useful answer should interrupt: priority follows the relevance
// outcome, quiet mode caps it, repeats are dropped, dismissals cool a topic.
import type { AssistCard, CardPriority, PerceptionMode, RelevanceOutcome } from './types.js';

const RANK: CardPriority[] = ['silent', 'passive', 'desktop', 'phone', 'watch'];
const DUPLICATE_WINDOW_MS = 10 * 60_000;
const DISMISS_COOLDOWN_MS = 15 * 60_000;

export function priorityFor(outcome: RelevanceOutcome | 'EXPLICIT', mode: PerceptionMode, quiet: boolean): CardPriority {
  let p: CardPriority =
    outcome === 'EXPLICIT' ? 'desktop'
      : outcome === 'HIGH_PRIORITY_TRIGGER' ? (mode === 'general' ? 'desktop' : 'watch')
        : outcome === 'INVOKE_CODEX' ? 'desktop'
          : outcome === 'INVOKE_CODEX_QUIETLY' ? 'passive'
            : 'silent';
  if (quiet && outcome !== 'EXPLICIT' && RANK.indexOf(p) > RANK.indexOf('passive')) p = 'passive';
  return p;
}

export class CardManager {
  private history: AssistCard[] = [];
  private dismissedTopics = new Map<string, number>();

  /** Returns the card to show, or null if it should be dropped (duplicate / dismissed topic). */
  admit(card: AssistCard, now = Date.now()): AssistCard | null {
    const norm = (s: string) => s.toLowerCase().replace(/\W+/g, ' ').trim();
    const dup = this.history.find(c => now - Date.parse(c.at) < DUPLICATE_WINDOW_MS && (norm(c.title) === norm(card.title) || (card.topic && c.topic === card.topic && norm(c.body) === norm(card.body))));
    if (dup) return null;
    const dismissedAt = card.topic ? this.dismissedTopics.get(card.topic) : undefined;
    if (dismissedAt != null && now - dismissedAt < DISMISS_COOLDOWN_MS && card.priority !== 'desktop') return null;
    this.history.push(card);
    this.history = this.history.slice(-50);
    return card;
  }

  /** The user waved it away: stop proactively raising that topic for a while. */
  dismiss(id: string, now = Date.now()): AssistCard | null {
    const card = this.history.find(c => c.id === id);
    if (!card) return null;
    card.dismissed = true;
    if (card.topic) this.dismissedTopics.set(card.topic, now);
    return card;
  }

  /** Recent note titles, so the relevance gate knows what was already said. */
  recentTitles(n = 5): string[] {
    return this.history.slice(-n).map(c => c.title);
  }

  all(): AssistCard[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
    this.dismissedTopics.clear();
  }
}
