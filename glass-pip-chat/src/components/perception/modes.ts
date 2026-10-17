import type { PerceptionMode } from '@/types/perception';

export const MODES: { id: PerceptionMode; label: string; hint: string }[] = [
  { id: 'meeting', label: 'Meeting', hint: 'Recalls past decisions when they come up' },
  { id: 'lecture', label: 'Lecture', hint: 'Connects new material to your project' },
  { id: 'general', label: 'General', hint: 'Mostly quiet; speaks up when it clearly helps' },
];
