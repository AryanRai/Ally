import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface SpeechSettings { cloud: boolean; project: string; voice: string; notifications: boolean; diarization?: boolean }
export function speechSettings(): SpeechSettings {
  try { return { cloud: false, project: '', voice: 'en-AU-Chirp3-HD-Aoede', notifications: true, ...JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'speech-settings.json'), 'utf8')) }; }
  catch { return { cloud: false, project: '', voice: 'en-AU-Chirp3-HD-Aoede', notifications: true }; }
}
export function saveSpeechSettings(patch: Partial<SpeechSettings>): SpeechSettings {
  const next = { ...speechSettings() };
  if (typeof patch.cloud === 'boolean') next.cloud = patch.cloud;
  if (typeof patch.notifications === 'boolean') next.notifications = patch.notifications;
  if (typeof patch.diarization === 'boolean') next.diarization = patch.diarization;
  if (typeof patch.project === 'string' && /^[a-z][a-z0-9-]{4,62}$/.test(patch.project)) next.project = patch.project;
  if (typeof patch.voice === 'string' && /^[a-z]{2}-[A-Z]{2}-Chirp3-HD-[A-Za-z]+$/.test(patch.voice)) next.voice = patch.voice;
  fs.writeFileSync(path.join(app.getPath('userData'), 'speech-settings.json'), JSON.stringify(next, null, 2));
  return next;
}
