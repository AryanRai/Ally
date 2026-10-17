import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
export interface CloudVoice { name: string; languageCodes: string[] }
let catalog: { expires: number; voices: CloudVoice[] } | undefined;

/** ADC is resolved in Electron main; access tokens never cross IPC. */
export async function googleVoices(): Promise<CloudVoice[]> {
  if (catalog && catalog.expires > Date.now()) return catalog.voices;
  try {
    const client = await auth.getClient();
    const result = await client.request<{ voices?: CloudVoice[] }>({ url: 'https://texttospeech.googleapis.com/v1/voices', timeout: 15_000 });
    const voices = (result.data.voices ?? []).filter(voice => voice.name.includes('Chirp3-HD') && voice.languageCodes.some(code => code.startsWith('en-')));
    if (!voices.length) throw new Error();
    catalog = { expires: Date.now() + 300_000, voices };
    return voices;
  } catch { throw new Error('Google Cloud voices unavailable. Check Application Default Credentials and the Cloud Text-to-Speech API on your quota project.'); }
}

export async function googleSpeech(text: string, name: string, signal?: AbortSignal): Promise<string> {
  if (!text.trim() || Buffer.byteLength(text, 'utf8') > 4500) throw new Error('Google voice text exceeds the per-request limit.');
  const voices = await googleVoices();
  const voice = voices.find(voice => voice.name === name);
  if (!voice) throw new Error('Select an available Google Chirp 3 HD voice.');
  try {
    const client = await auth.getClient();
    const result = await client.request<{ audioContent?: string }>({
      url: 'https://texttospeech.googleapis.com/v1/text:synthesize', method: 'POST', timeout: 30_000, signal,
      data: { input: { text }, voice: { name: voice.name, languageCode: voice.languageCodes[0] }, audioConfig: { audioEncoding: 'LINEAR16' } },
    });
    if (!result.data.audioContent) throw new Error();
    return result.data.audioContent;
  } catch { throw new Error('Google Cloud voice generation failed. Check credentials, API access and quota.'); }
}
