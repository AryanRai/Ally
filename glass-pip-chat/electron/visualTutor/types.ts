/** Screen-relative coordinates: (0,0) top left, (1000,1000) bottom right. */
export interface TutorPoint { x: number; y: number }
export const TUTOR_COLORS = ['mint', 'blue', 'amber', 'pink', 'white'] as const;
export type TutorColor = typeof TUTOR_COLORS[number];
export interface TutorMark {
  id: string;
  kind: 'arrow' | 'line' | 'rect' | 'ellipse' | 'polyline' | 'text';
  color: TutorColor;
  points: TutorPoint[];
  text?: string;
}
export interface TutorStep { id: string; title: string; explanation: string; marks: TutorMark[]; diagram?: { html: string; height: number } }
export interface TutorBoard {
  id: string;
  chatId: string;
  displayId: number;
  bounds: { x: number; y: number; width: number; height: number };
  capturedAt: number;
  /** Circled area in full-display 0–1000 coordinates; attached image is this crop. */
  focus?: { x: number; y: number; width: number; height: number };
  steps: TutorStep[];
  sketches: TutorMark[];
  selected: number;
  following: boolean;
  sketching: boolean;
  frozen: boolean;
  revision: number;
  /** Presentation only; reasoning remains in the originating chat. */
  visible?: boolean;
  pillBounds?: { x: number; y: number; width: number; height: number };
}
export interface TutorCapture { board: TutorBoard; imagePath: string; thumbnail: string }
export type TutorAction = 'previous' | 'next' | 'latest' | 'sketch' | 'undo' | 'freeze' | 'chat' | 'close';
export interface VisualTutorApi {
  onPillBounds?: (callback: (bounds: { x: number; y: number; width: number; height: number }) => void) => () => void;
  show: (id: string) => Promise<void>;
  start: (chatId: string, displayId?: number, circleCaptureId?: string) => Promise<TutorCapture>;
  displays: () => Promise<Array<{ id: number; label: string }>>;
  state: () => Promise<TutorBoard | null>;
  overlay: () => Promise<{ board: TutorBoard | null; screenshot: string }>;
  end: (id: string) => Promise<void>;
  action: (id: string, action: TutorAction) => Promise<void>;
  sketch: (id: string, points: TutorPoint[]) => Promise<void>;
  interactive: (on: boolean) => void;
  onChanged: (callback: (board: TutorBoard | null) => void) => () => void;
}
