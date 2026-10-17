import { ipcMain, type WebContents } from 'electron';
import { recognizeLive, synthesizeLive, type Recognition, type SpeechEvent } from './streaming.js';
import { speechSettings, saveSpeechSettings } from './settings.js';

export function registerLiveSpeechIpc(): void {
  const captures = new Map<string, Recognition>();
  const audio = new Map<number, AbortController>();
  const registered = new Set<number>();
  const watch = (sender: WebContents) => {
    if (registered.has(sender.id)) return;
    registered.add(sender.id);
    sender.once('destroyed', () => {
      for (const [key, capture] of captures) if (key.startsWith(`${sender.id}:`)) { capture.cancel(); captures.delete(key); }
      audio.get(sender.id)?.abort(); audio.delete(sender.id); registered.delete(sender.id);
    });
  };
  ipcMain.handle('speech:settings', () => speechSettings());
  ipcMain.handle('speech:saveSettings', (_, patch) => saveSpeechSettings(patch ?? {}));
  ipcMain.on('speech:liveStart', ({ sender }, id: string) => {
    if (typeof id !== 'string' || id.length > 80) return;
    watch(sender);
    const key = `${sender.id}:${id}`;
    const send = (event: Omit<SpeechEvent, 'id'>) => { if (!sender.isDestroyed()) sender.send('speech:liveEvent', { ...event, id }); };
    if (captures.has(key) || [...captures.keys()].filter(k => k.startsWith(`${sender.id}:`)).length >= 3) { send({ type: 'error', error: 'Finish the previous recording first.' }); return; }
    try { captures.set(key, recognizeLive(speechSettings(), event => { send(event); if (event.type === 'complete' || event.type === 'error') captures.delete(key); })); }
    catch (error) { send({ type: 'error', error: (error as Error).message }); }
  });
  ipcMain.on('speech:liveAudio', ({ sender }, id: string, bytes: Uint8Array) => { if (bytes instanceof Uint8Array) captures.get(`${sender.id}:${id}`)?.write(bytes); });
  ipcMain.on('speech:liveEnd', ({ sender }, id: string, cancel: boolean) => {
    const key = `${sender.id}:${id}`;
    if (cancel) { captures.get(key)?.cancel(); captures.delete(key); } else captures.get(key)?.end();
  });
  ipcMain.handle('speech:streamVoice', async ({ sender }, id: string, text: string, name?: string) => {
    watch(sender); audio.get(sender.id)?.abort();
    const controller = new AbortController(); audio.set(sender.id, controller);
    try {
      const settings = speechSettings();
      await synthesizeLive(settings, text, name || settings.voice, bytes => {
        if (!sender.isDestroyed()) sender.send('speech:liveEvent', { id, type: 'audio', audio: bytes.toString('base64') });
      }, controller.signal);
      return { success: true };
    } catch (error) { return { success: false, error: (error as Error).message }; }
    finally { if (audio.get(sender.id) === controller) audio.delete(sender.id); }
  });
  ipcMain.on('speech:streamCancel', ({ sender }) => audio.get(sender.id)?.abort());
}
