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
export const MAX_DIAGRAM_IMAGE_UNITS = 4 * 1024 * 1024;
export const MAX_DIAGRAM_IMAGES = 8;
export const MAX_DIAGRAM_HEIGHT = 1200;
export interface StudyClip {jobId:string;state:'queued'|'rendering'|'ready'|'error'|'cancelled';src?:string;duration?:number;error?:string}
export interface TutorStep { id: string; title: string; explanation: string; marks: TutorMark[]; lesson?:import('./lesson.js').LessonBeat; clip?:StudyClip; diagram?: { html: string; height: number; images?: Record<string, string>; runtime?: 'three' | 'mermaid' }; panel?: { x: number; y: number; width: number; transparent?: boolean } }
export interface TutorBoard {
  bookmarks?:Record<string,import('./playback.js').PlaybackBookmark>;
  mediaToken?:string;
  presentationBounds?: { x:number;y:number;width:number;height:number };
  playback?: import('./playback.js').PlaybackCommand;
  id: string;
  chatId: string;
  /** One Study lesson across local pill IDs and the native canonical chat ID. */
  sessionKey?: string;
  presentation?: 'study';
  screenPixels?: { width: number; height: number };
  /** Physical desktop monitor rectangle, separate from Electron's DIP bounds. */
  screenBounds?: { x: number; y: number; width: number; height: number };
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
  panelAnchor?: { x: number; y: number; sequence: number };
}
export interface TutorCapture { board: TutorBoard; imagePath: string; thumbnail: string }
export type TutorAction = 'previous' | 'next' | 'latest' | 'sketch' | 'undo' | 'freeze' | 'chat' | 'close';
export interface VisualTutorApi {
  review?: (boardId:string,stepId:string)=>Promise<void>;
  controlPlayback?: (command:import('./playback.js').PlaybackCommand)=>Promise<import('./playback.js').PlaybackState>;
  loadNarration?: (boardId:string,key:string)=>Promise<Uint8Array>;
  mediaState?: (state:import('./lesson.js').MediaObservation)=>void;
  playbackAck?: (command:import('./playback.js').PlaybackCommand,state:import('./playback.js').PlaybackState)=>Promise<void>;
  loadClip?: (boardId: string, src: string) => Promise<Uint8Array>;
  cancelRender?: (boardId:string,jobId:string)=>Promise<void>;
  study: (id: string, words: string) => Promise<void>;
  onPillBounds?: (callback: (bounds: { x: number; y: number; width: number; height: number }) => void) => () => void;
  show: (id: string, point?: TutorPoint) => Promise<void>;
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
