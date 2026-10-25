import fs from 'node:fs/promises';
import path from 'node:path';

// The native client nests its captures inside `turn` (CompanionSession.WriteTurnBody);
// top-level fields are accepted for older bodies.
export async function nativeImages(body, folder) {
  const turn=body.turn && typeof body.turn==='object' ? body.turn : {};
  const primary=turn.screenshot ?? body.screenshot ?? (typeof body.live_state==='object' ? body.live_state?.screenshot : undefined);
  const files=[];
  for(const item of [primary,...(turn.attached_images ?? body.attached_images ?? []),...(turn.other_screens ?? body.other_screens ?? [])]) {
    if(item==null)continue;
    if(typeof item.base64!=='string' || !item.base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.base64) || item.base64.length%4!==0)throw Error('The screen image could not be read. Capture it again.');
    if(!['image/png','image/jpeg'].includes(item.mimeType))throw Error('Unsupported screen image format.');
    const file=path.join(folder,`image-${files.length}${item.mimeType==='image/png'?'.png':'.jpg'}`);
    await fs.writeFile(file,Buffer.from(item.base64,'base64'));files.push(file);
  }
  return files;
}

/** Images reach the agent as files; never as base64 or data URLs inside the prompt text. */
export const withoutImages=(key,value)=>key==='base64'?undefined:typeof value==='string' && /^data:image\//.test(value)?'[image]':value;

export function nativeContext(body) {
  const clean=JSON.stringify({turn:body.turn,live_state:body.live_state,screenshot:body.screenshot,thread:body.thread},withoutImages);
  if(!clean)return '{}';
  if(clean.length<=30000)return clean;
  return JSON.stringify({contextExcerpt:clean.slice(0,12000)+'\n…\n'+clean.slice(-14000),contextTruncated:true});
}

export function nativeReplyProgram(text, parse, spokenProgram) {
  const match=/^\s*```(?:javascript|js)\s*\n([\s\S]*?)\n```\s*$/i.exec(text);
  if(!match)return spokenProgram(text);
  // Syntax validation only; the native drawing interpreter owns rendering.
  // Never execute model output in the connector.
  parse(match[1],{ecmaVersion:'latest'});
  return text.trim();
}
