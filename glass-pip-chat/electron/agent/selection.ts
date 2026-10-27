import { randomUUID } from 'node:crypto';
import type { AgentProvider, AgentPermission } from './types.js';

export interface SharedChatSelection {
  chatId: string;
  provider: AgentProvider;
  sessionId?: string;
  codexAccountId?: string;
  title: string;
  cwd?: string;
  permission: AgentPermission;
}
export interface SelectionSnapshot { version: string; selected: SharedChatSelection | null; origin: 'desktop' | 'notch' }

/** One authority for navigation. Version checks keep slow history reads from stealing newer navigation. */
export class ChatSelection {
  private state: SelectionSnapshot = { version: randomUUID(), selected: null, origin: 'desktop' };
  private listeners = new Set<(state: SelectionSnapshot) => void>();
  snapshot(): SelectionSnapshot { return structuredClone(this.state); }
  subscribe(listener: (state: SelectionSnapshot) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  set(selected: SharedChatSelection | null, version: string, origin: SelectionSnapshot['origin']) {
    if (selected && (!['codex', 'claude'].includes(selected.provider) || typeof selected.chatId !== 'string' || !/^[\w:-]{1,240}$/.test(selected.chatId)
      || (selected.sessionId !== undefined && (typeof selected.sessionId !== 'string' || !/^[\w-]{1,200}$/.test(selected.sessionId)))
      || (selected.codexAccountId !== undefined && (typeof selected.codexAccountId !== 'string' || !/^[\w-]{1,80}$/.test(selected.codexAccountId)))
      || typeof selected.title !== 'string' || selected.title.length > 2000 || !['readonly', 'edit', 'full'].includes(selected.permission)
      || (selected.cwd !== undefined && (typeof selected.cwd !== 'string' || selected.cwd.length > 32000)))) throw Error('Invalid chat selection');
    if (version !== this.state.version) return { accepted: false, ...this.snapshot() };
    if (JSON.stringify(selected) !== JSON.stringify(this.state.selected)) {
      this.state = { selected: selected && { ...selected }, version: randomUUID(), origin };
      for (const listener of this.listeners) listener(this.snapshot());
    }
    return { accepted: true, ...this.snapshot() };
  }
}
export const chatSelection = new ChatSelection();
