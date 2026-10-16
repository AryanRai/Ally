/** Quick actions offered after circling something; each becomes the agent prompt. */
export interface CircleAction {
  id: string;
  label: string;
  emoji: string;
  prompt: string;
}

export const CIRCLE_ACTIONS: CircleAction[] = [
  { id: 'ask', label: 'Ask', emoji: '💬', prompt: 'What is this? Explain briefly.' },
  {
    id: 'search',
    label: 'Search web',
    emoji: '🔎',
    prompt: 'Identify what is in this image, then search the web for it and give me the most useful results with links.',
  },
  { id: 'explain', label: 'Explain', emoji: '🧠', prompt: 'Explain what this shows. If it is technical, go step by step.' },
  {
    id: 'fix',
    label: 'Fix this',
    emoji: '🛠️',
    prompt: 'This is a screenshot from my screen. Diagnose the problem or error shown and tell me how to fix it. If it relates to files in the working folder, look at them.',
  },
  { id: 'text', label: 'Copy text', emoji: '📋', prompt: 'Extract all the text in this image exactly. Reply with only the text, in a code block.' },
  { id: 'translate', label: 'Translate', emoji: '🌐', prompt: 'Translate the text in this image into English.' },
];

/** Typed text is the question; a chosen action adds its instruction. */
export function buildCirclePrompt(action: CircleAction | null, typed: string): string {
  const question = typed.trim();
  if (!action) return question || CIRCLE_ACTIONS[0].prompt;
  return question ? `${action.prompt}\n\nAlso: ${question}` : action.prompt;
}
