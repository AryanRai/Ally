import { v2 } from '@google-cloud/speech';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
// Synthetic, billed Cloud speech diagnostic; no microphone input or private files.
const project = process.env.GOOGLE_CLOUD_PROJECT || 'orbit-494815';
const tts = new TextToSpeechClient({projectId:project,quotaProjectId:project});
const chunks = [];
for (const [name,text] of [['en-US-Neural2-F','Hello, I am discussing the project schedule. We should meet on Monday.'],['en-US-Neural2-D','Thanks, I will bring the new report. Tuesday would be better for me.'],['en-US-Neural2-F','Tuesday works. Let us review the design together.']]) {
 const [r]=await tts.synthesizeSpeech({input:{text},voice:{name,languageCode:'en-US'},audioConfig:{audioEncoding:'LINEAR16',sampleRateHertz:16000}});
 const b=Buffer.from(r.audioContent); let off=12; while(off+8<b.length && b.toString('ascii',off,off+4)!=='data') off+=8+b.readUInt32LE(off+4); chunks.push(b.subarray(off+8),Buffer.alloc(12000));
}
const stt = new v2.SpeechClient({projectId:project,quotaProjectId:project,apiEndpoint:'us-speech.googleapis.com'});
try { const [r]=await stt.recognize({recognizer:`projects/${project}/locations/us/recognizers/_`,content:Buffer.concat(chunks),config:{explicitDecodingConfig:{encoding:'LINEAR16',sampleRateHertz:16000,audioChannelCount:1},languageCodes:['en-US'],model:'chirp_3',features:{diarizationConfig:{}}}},{timeout:45000}); const words=r.results.flatMap(x=>x.alternatives?.[0]?.words??[]); console.log(JSON.stringify({results:r.results.length,wordCount:words.length,speakerLabels:[...new Set(words.map(w=>w.speakerLabel).filter(Boolean))]})); }
catch(e){console.log(JSON.stringify({code:e.code,details:e.details}));process.exitCode=1;}
finally{await tts.close();await stt.close();}
