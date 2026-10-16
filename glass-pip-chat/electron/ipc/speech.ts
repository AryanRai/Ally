// Bridge between the renderer and the Python speech service (STT/TTS over WebSocket).
import { ipcMain } from 'electron';
import { getSpeechService } from '../speech/client.js';
import { sendToRenderer } from '../window.js';

const speechService = getSpeechService();

export function registerSpeechIpc(): void {
  ipcMain.handle('speech:connect', async () => {
    try {
      await speechService.connect();
      return { success: true };
    } catch (error: any) {
      console.error('Failed to connect to speech service:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('speech:disconnect', () => {
    speechService.disconnect();
    return { success: true };
  });

  ipcMain.handle('speech:isConnected', () => {
    return speechService.isServiceConnected();
  });

  ipcMain.handle('speech:startListening', () => {
    try {
      speechService.startListening();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('speech:stopListening', () => {
    try {
      speechService.stopListening();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('speech:synthesize', (_, text: string) => {
    try {
      speechService.synthesizeSpeech({ text });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('speech:synthesizeStreaming', (_, text: string) => {
    try {
      speechService.synthesizeSpeechStreaming({ text });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('speech:sendGGWave', (_, text: string) => {
    try {
      speechService.sendGGWave({ text });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('speech:getStatus', () => {
    try {
      speechService.getStatus();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('speech:clearTTSQueue', () => {
    try {
      speechService.clearTTSQueue();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('speech:getTTSQueueStatus', () => {
    try {
      const status = speechService.getTTSQueueStatus();
      return { success: true, data: status };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('speech:skipCurrentTTS', () => {
    try {
      speechService.skipCurrentTTS();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  forwardSpeechEvents();

  // Auto-connect (non-blocking); the service may simply not be running
  speechService.connect().catch(error => {
    console.warn('Speech service not available:', error?.message || error);
  });
}

// Setup speech service event forwarding to renderer
function forwardSpeechEvents() {
  // An EventEmitter 'error' with no listener throws, which crashed the app with a dialog
  // whenever speech-service wasn't running; the client already logs and reconnects
  speechService.on('error', () => {});

  speechService.on('connected', () => {
    sendToRenderer('speech:connected');
  });

  speechService.on('disconnected', () => {
    sendToRenderer('speech:disconnected');
  });

  speechService.on('speechRecognized', (result) => {
    sendToRenderer('speech:recognized', result);
  });

  speechService.on('speechInterim', (data) => {
    sendToRenderer('speech:interim', data);
  });

  speechService.on('speechInterrupted', () => {
    sendToRenderer('speech:interrupted');
  });

  speechService.on('speechGenerated', (data) => {
    sendToRenderer('speech:generated', data);
  });

  speechService.on('speechError', (error) => {
    sendToRenderer('speech:error', error);
  });

  speechService.on('ggwaveSent', (data) => {
    sendToRenderer('speech:ggwaveSent', data);
  });

  speechService.on('ggwaveError', (error) => {
    sendToRenderer('speech:ggwaveError', error);
  });

  speechService.on('statusUpdate', (status) => {
    sendToRenderer('speech:statusUpdate', status);
  });

  speechService.on('listeningStarted', () => {
    sendToRenderer('speech:listeningStarted');
  });

  speechService.on('listeningStopped', () => {
    sendToRenderer('speech:listeningStopped');
  });

  // Streaming TTS events
  speechService.on('ttsStreamStart', (data) => {
    sendToRenderer('speech:ttsStreamStart', data);
  });

  speechService.on('ttsStreamChunk', (data) => {
    sendToRenderer('speech:ttsStreamChunk', data);
  });

  speechService.on('ttsStreamComplete', (data) => {
    sendToRenderer('speech:ttsStreamComplete', data);
  });

  speechService.on('ttsStreamError', (error) => {
    sendToRenderer('speech:ttsStreamError', error);
  });
}

