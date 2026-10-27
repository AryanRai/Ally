import fs from 'node:fs/promises';
import path from 'node:path';

/** Consume only desktop-issued selections. Their target cannot drift on navigation. */
export async function nativeSelectionInput(body, root, now=Date.now()) {
  const trigger=body.trigger ?? body.turn?.trigger;
  if(typeof trigger!=='string'||!trigger.startsWith('ally-selection:'))return null;
  const id=trigger.slice(15);
  if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid Study selection.');
  const directory=path.join(root,'profile','study-inputs'), file=path.join(directory,id+'.json'), consumed=file+'.consuming';
  try{await fs.rename(file,consumed);}catch{throw Error('This selection expired or was already submitted. Check the chat before retrying.');}
  try {
    const value=JSON.parse(await fs.readFile(consumed,'utf8'));
    if(value.id!==id||!Number.isFinite(value.expires)||value.expires<now||typeof value.words!=='string'||!value.words.trim()||value.words.length>12000||typeof value.imagePath!=='string'||!value.selected?.chatId||!['codex','claude'].includes(value.selected.provider)||!['full','edit','readonly'].includes(value.selected.permission))throw Error('This selection expired. Select the area again.');
    if(value.imagePath)await fs.access(value.imagePath);
    return value;
  } finally {await fs.rm(consumed,{force:true});await fs.rm(path.join(directory,id+'.input'),{force:true});}
}

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

// A selected real chat already owns its history. Only send current visual data;
// native live_state contains hosted HeyClicky tools/plans, not screen context.
function selectedContext(body) {
  const turn=body.turn && typeof body.turn==='object' ? body.turn : {};
  const context={};
  for(const key of ['front_app','highlight','fact','drawing_on_screen','page']) {
    const value=turn[key] ?? body[key];
    if(value!==undefined)context[key]=value;
  }
  const dimensions=image=>image && typeof image==='object'
    ? Object.fromEntries(['widthInPixels','heightInPixels'].filter(key=>Number.isFinite(image[key]) && image[key]>0).map(key=>[key,image[key]])) : undefined;
  context.screenshot=dimensions(turn.screenshot ?? body.screenshot ?? body.live_state?.screenshot);
  for(const key of ['attached_images','other_screens'])context[key]=(turn[key] ?? body[key] ?? []).map(dimensions);
  const compact=(_key,value)=>{
    value=withoutImages(_key,value);
    if(value===null || value===undefined || value==='' || (typeof value==='object' && Object.keys(value).length===0))return undefined;
    return value;
  };
  return JSON.stringify(context,compact);
}

export function nativeContext(body,{includeHistory=true}={}) {
  const clean=includeHistory
    ? JSON.stringify({turn:body.turn,live_state:body.live_state,screenshot:body.screenshot,thread:body.thread},withoutImages)
    : selectedContext(body);
  if(!clean)return '{}';
  if(clean.length<=30000)return clean;
  // Keep the editable native scene as one data object: slicing through its JSON
  // loses ownership/revision and can make follow-up edits guess at stale marks.
  if(!includeHistory) {
    const context=JSON.parse(clean), drawing=context.drawing_on_screen;
    if(typeof drawing==='string') {
      const marker='Editable native scene (data): ', at=drawing.lastIndexOf(marker);
      if(at>=0) {
        try {
          const scene=JSON.parse(drawing.slice(at+marker.length));
          if(scene?.version===1 && JSON.stringify(scene).length<=24000) {
            return JSON.stringify({native_scene:scene,drawing_on_screen:drawing.slice(0,Math.min(at,1200)),
              screenshot:context.screenshot,front_app:context.front_app,contextTruncated:true});
          }
        } catch { /* Never interpret a partial or invalid scene as an editable state. */ }
      }
    }
  }
  return JSON.stringify({contextExcerpt:clean.slice(0,12000)+'\n…\n'+clean.slice(-14000),contextTruncated:true});
}

/** The native frame owns drawing dimensions; the desktop image is only a crop. */
export function nativeSelectionContext(body,input) {
  const native=JSON.parse(nativeContext(body,{includeHistory:false}));
  if(!input)return JSON.stringify(native);
  const {screenshot:_sourceDimensions,...selectionContext}=input.context??{};
  const context={...native,...selectionContext};
  const focus=context.selection?.focus, size=native.screenshot;
  if(input.imagePath && (!size?.widthInPixels || !size?.heightInPixels))throw Error('The drawing canvas is unavailable. Select the area again.');
  if(focus && size)context.selection={...context.selection,canvasBounds:{
    x:focus.x*size.widthInPixels/1000,y:focus.y*size.heightInPixels/1000,
    width:focus.width*size.widthInPixels/1000,height:focus.height*size.heightInPixels/1000,
  }};
  return JSON.stringify(context);
}

/** Extract cumulative drawing blocks without streaming prose or Markdown fences as code. */
export function nativeProgramCode(text) {
  text=text.trimStart();
  const opening=/^```(?:javascript|js)[ \t]*\r?\n/gim;
  let code='',found=false,match;
  while((match=opening.exec(text))) {
    found=true;
    const start=opening.lastIndex,closing=/^```[ \t]*(?:\r?\n|$)/gm;
    closing.lastIndex=start;
    const end=closing.exec(text);
    if(end) {code+=text.slice(start,end.index);opening.lastIndex=closing.lastIndex;}
    else {
      // A fence can arrive one backtick at a time. Hold that partial line so
      // previously emitted code never has to be retracted on the next chunk.
      code+=text.slice(start).replace(/(^|\n)`{1,3}[ \t]*$/, '$1');
      break;
    }
  }
  return {found,code};
}

export function nativeReplyProgram(text, parse, spokenProgram) {
  const {found,code}=nativeProgramCode(text);
  if(!found)return spokenProgram(text);
  // Syntax validation only; the native drawing interpreter owns rendering.
  // Never execute model output in the connector.
  parse(code,{ecmaVersion:'latest'});
  return '```javascript\n'+code+(code.endsWith('\n')?'':'\n')+'```';
}
