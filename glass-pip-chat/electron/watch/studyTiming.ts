/** Relative timings only: never logs prompts, scene data, paths or session IDs. */
export class StudyTiming {
  private start: number;
  private phases: Record<string, number> = {};
  private reported = false;
  constructor(private now = () => performance.now()) { this.start = now(); }
  mark(phase: 'historyReady' | 'boardReady' | 'accepted' | 'firstText') {
    this.phases[phase] ??= Math.round(this.now() - this.start);
  }
  finish(error: boolean) {
    if (this.reported) return;
    this.reported = true;
    return { ...this.phases, total: Math.round(this.now() - this.start), error };
  }
}
