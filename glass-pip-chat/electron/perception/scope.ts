// Compact description of the selected chat for the relevance gate. Built once
// per session from the chat's own history; no retrieval, embeddings or memory.
import type { AgentHistoryMessage } from '../agent/types.js';

const clip = (s: string, n: number) => {
  const flat = s.replace(/<[^>]+>/g, ' ').replace(/```[\s\S]*?```/g, ' [code] ').replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
};

export function buildScope(title: string, messages: AgentHistoryMessage[], maxChars = 1400): string {
  const users = messages.filter(m => m.role === 'user' && m.content.trim());
  const replies = messages.filter(m => m.role === 'assistant' && m.content.trim());
  const parts = [
    `Title: ${title}`,
    users[0] ? `Started with: ${clip(users[0].content, 260)}` : '',
    users.length > 1 ? `Recent asks: ${users.slice(-5).map(m => clip(m.content, 120)).join(' | ')}` : '',
    replies.at(-1) ? `Latest answer: ${clip(replies.at(-1)!.content, 360)}` : '',
  ].filter(Boolean);
  const text = parts.join('\n');
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}
