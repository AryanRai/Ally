import { app, webContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const file = () => path.join(app.getPath('userData'), 'output-mute.json');
export function outputMute(): { muted: boolean } {
  try { return { muted: JSON.parse(fs.readFileSync(file(), 'utf8')).muted === true }; }
  catch { return { muted: false }; }
}
export function setOutputMute(muted: unknown) {
  if (typeof muted !== 'boolean') throw Error('Mute must be true or false.');
  fs.writeFileSync(file() + '.staged', JSON.stringify({ muted }));
  fs.renameSync(file() + '.staged', file());
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed()) { contents.setAudioMuted(muted); contents.send('speech:outputMute', { muted }); }
  }
  return { muted };
}
export function registerOutputMute() {
  for (const contents of webContents.getAllWebContents()) if (!contents.isDestroyed()) contents.setAudioMuted(outputMute().muted);
  app.on('web-contents-created', (_, contents) => contents.setAudioMuted(outputMute().muted));
}
