export interface StudySessionInput { chatId: string; sessionKey: string; context: string; imagePath?: string }
let prepare: ((input: StudySessionInput) => Promise<string>) | undefined;
export function registerStudySession(handler: (input: StudySessionInput) => Promise<string>) { prepare = handler; return () => { if (prepare === handler) prepare = undefined; }; }
export const prepareStudySession = (input: StudySessionInput) => prepare?.(input) ?? Promise.resolve('');
let control:((input:{sessionKey:string;words:string})=>Promise<string|undefined>)|undefined;
export function registerStudyControl(handler:NonNullable<typeof control>){control=handler;return()=>{if(control===handler)control=undefined;};}
export const handleStudyControl=(sessionKey:string,words:string)=>control?.({sessionKey,words})??Promise.resolve(undefined);

const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Cards follow actual native speech captions, rather than model/tool completion. */
export class StudyCues {
  private captions: string[] = [];
  private cues = new Map<string, string>();
  reset() { this.captions = []; this.cues.clear(); }
  stage(id: string, cue: string) {
    this.cues.set(id, normalize(cue));
    // Rendering can finish after speech has moved on. Only reconcile this
    // updated card, rather than advancing to another historical matching card.
    return this.matches(normalize(cue), this.captions) ? id : undefined;
  }
  hear(caption: string) {
    // ScreenDrawingCanvas.CaptionChanged forwards DrawingCaption's JSON,
    // including chips/header and JSON escapes, rather than a plain say string.
    if (caption.trimStart().startsWith('{')) {
      try { const data = JSON.parse(caption); caption = typeof data.text === 'string' ? data.text : ''; }
      catch { return; }
    }
    if (caption.length > 1200) return;
    const words = normalize(caption);
    if (words) this.captions = [...this.captions, words].slice(-128);
    for (const [id, cue] of [...this.cues].reverse()) if (this.matches(cue, [words])) return id;
  }
  private matches(cue: string, captions: string[]) {
    return !!cue && captions.some(caption => caption === cue || (cue.length >= 8 && caption.includes(cue)));
  }
}
