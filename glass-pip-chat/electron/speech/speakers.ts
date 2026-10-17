export interface SpeakerSegment { speaker: string; text: string }
/** Google labels are local to one recognition call, never persistent identities. */
export function speakerSegments(results: readonly { alternatives?: readonly { words?: readonly { word?: string | null; speakerLabel?: string | null }[] | null }[] | null }[]): SpeakerSegment[] {
  const segments: SpeakerSegment[] = [];
  for (const result of results) for (const word of result.alternatives?.[0]?.words ?? []) {
    if (!word.word?.trim()) continue;
    const raw = word.speakerLabel;
    const speaker = typeof raw === 'string' && /^\d{1,3}$/.test(raw) ? `Speaker ${Number(raw) + 1}` : 'Unassigned speaker';
    const previous = segments.at(-1);
    if (previous?.speaker === speaker) previous.text += ` ${word.word}`;
    else segments.push({ speaker, text: word.word });
  }
  return segments;
}
