export interface StudySessionInput { chatId: string; sessionKey: string; context: string; imagePath?: string }
let prepare: ((input: StudySessionInput) => Promise<string>) | undefined;
export function registerStudySession(handler: (input: StudySessionInput) => Promise<string>) { prepare = handler; return () => { if (prepare === handler) prepare = undefined; }; }
export const prepareStudySession = (input: StudySessionInput) => prepare?.(input) ?? Promise.resolve('');

const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Cards follow actual native speech captions, rather than model/tool completion. */
export class StudyCues {
  private caption = '';
  private cues = new Map<string, string>();
  reset() { this.caption = ''; this.cues.clear(); }
  stage(id: string, cue: string) { this.cues.set(id, normalize(cue)); return this.match(); }
  hear(caption: string) { this.caption = normalize(caption); return this.match(); }
  private match() {
    if (!this.caption) return;
    for (const [id, cue] of [...this.cues].reverse()) if (cue && (this.caption === cue || (cue.length >= 8 && this.caption.includes(cue)))) return id;
  }
}
