import type { TutorBoard } from './types.js';

export function drawingOwner(caller?: string, requested?: unknown): string {
  if (caller && requested !== undefined && requested !== caller) throw Error('Drawing must stay in the originating chat.');
  const owner = caller ?? requested;
  if (typeof owner !== 'string' || !/^(codex|claude):[\w.-]{1,200}$/.test(owner)) throw Error('Supply the originating provider:sessionId as chatId.');
  return owner;
}
export function requireDrawingOwner(board: TutorBoard, caller?: string): TutorBoard {
  if (caller && caller !== (board.sessionKey ?? board.chatId)) throw Error('This drawing board belongs to another chat.');
  return board;
}
export interface DrawingReceipt { board: TutorBoard; image?: string }
/** Serializes opening/capture, and makes retries unable to recreate a dismissed board. */
export class DrawingOpener {
  private busy = false;
  private receipts = new Map<string, { signature: string; result: DrawingReceipt }>();
  constructor(private current: () => TutorBoard | null,
    private open: (owner: string, capture: boolean, displayId?: number) => Promise<DrawingReceipt>) {}
  async start(args: Record<string, unknown>, caller?: string): Promise<DrawingReceipt> {
    const owner = drawingOwner(caller, args.chatId);
    if (typeof args.requestId !== 'string' || !/^[\w.-]{1,80}$/.test(args.requestId)) throw Error('Supply a unique requestId; reuse it only to retry this request.');
    if (args.capture !== undefined && typeof args.capture !== 'boolean') throw Error('capture must be true or false.');
    if (args.displayId !== undefined && (typeof args.displayId !== 'number' || !Number.isInteger(args.displayId))) throw Error('Invalid displayId.');
    const signature = JSON.stringify([args.capture === true, args.displayId]);
    const key = owner + ':' + args.requestId, prior = this.receipts.get(key), board = this.current();
    if (prior) {
      if (prior.signature !== signature) throw Error('Use a new requestId for changed drawing options.');
      if (board?.id !== prior.result.board.id) throw Error('That drawing was closed. Use a new requestId to open a new board.');
      return { ...prior.result, board };
    }
    if (board) requireDrawingOwner(board, owner);
    if (board && args.displayId !== undefined && args.displayId !== board.displayId) throw Error('Close the current board before changing its display.');
    if (this.busy) throw Error('A drawing is opening. Retry the same requestId after it finishes.');
    this.busy = true;
    try {
      const result = await this.open(owner, args.capture === true, args.displayId as number | undefined);
      this.receipts.set(key, { signature, result });
      while (this.receipts.size > 8) this.receipts.delete(this.receipts.keys().next().value!);
      return result;
    } finally { this.busy = false; }
  }
}
