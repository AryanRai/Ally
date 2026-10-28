import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SharedChatSelection } from '../agent/selection.js';
import type { TutorBoard } from './types.js';

export const studyKey = (selection: SharedChatSelection) => selection.sessionId ? `${selection.provider}:${selection.sessionId}` : selection.chatId;

/** Finite, one-use desktop → native handoff. No question goes in a command line. */
export class StudyInputs {
  constructor(private root: string, private now = Date.now) {}
  private directory() { return path.join(this.root, 'profile', 'study-inputs'); }
  issue(board: TutorBoard, selected: SharedChatSelection, words: string, imagePath: string) {
    if (!words.trim() || words.length > 12000) throw Error('Add a Study question (up to 12000 characters).');
    if (board.sessionKey !== studyKey(selected)) throw Error('The selected chat changed. Select the area again.');
    if (imagePath && !fs.existsSync(imagePath)) throw Error('This selection expired. Select the area again.');
    const display = imagePath ? board.screenBounds : undefined;
    if (imagePath && (!display || ![display.x,display.y,display.width,display.height].every(Number.isFinite) || display.width <= 0 || display.height <= 0)) throw Error('This selection has no display geometry. Select the area again.');
    const id = randomUUID(), directory = this.directory();
    fs.mkdirSync(directory, { recursive: true });
    for (const name of fs.readdirSync(directory)) {
      if (!/^[a-f0-9-]+\.(json|input)$/.test(name)) continue;
      const file = path.join(directory, name);
      if (this.now() - fs.statSync(file).mtimeMs > 120000) fs.rmSync(file, { force: true });
    }
    const record = { id, expires: this.now() + 120000, selected, words, imagePath,
      context: { ...(imagePath ? { selection: { bounds: board.bounds, sourcePixels: board.screenPixels, focus: board.focus, capturedAt: board.capturedAt } } : {}), diagramBoardId: board.id } };
    const json = path.join(directory, `${id}.json`);
    fs.writeFileSync(json + '.staged', JSON.stringify(record)); fs.renameSync(json + '.staged', json);
    // Bind the drawing to the captured monitor even if the cursor moves to the pill.
    const geometry = display ? [display.x, display.y, display.width, display.height].join(',') : '';
    fs.writeFileSync(path.join(directory, `${id}.input`), [words, imagePath, geometry].map(value => Buffer.from(value).toString('base64')).join('\n') + '\n');
    return id;
  }
  discard(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) return;
    for (const extension of ['json', 'input']) fs.rmSync(path.join(this.directory(), `${id}.${extension}`), { force: true });
  }
}
