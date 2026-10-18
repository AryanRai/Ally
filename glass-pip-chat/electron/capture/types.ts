export interface CircleRect { x: number; y: number; width: number; height: number }
export interface CircleSubmit {
  /** Selection in overlay CSS pixels; omitted = whole screen. */
  rect?: CircleRect;
  prompt: string;
  mode?: 'draw';
  attachOnly?: boolean;
}
export interface CircleAsk {
  imagePath: string;
  thumbnail: string;
  prompt: string;
  chatId?: string;
  tutorCaptureId?: string;
  attachOnly?: boolean;
}

export interface CircleContext { title: string; hasChat: boolean; display: { width: number; height: number }; anchor?: CircleRect }
