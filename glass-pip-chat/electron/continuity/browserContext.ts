import {randomUUID} from 'node:crypto';
import {youtubeVideoId, youtubeTimestamp, youtubeContinuationUrl} from './youtubeContext.js';
const unavailable=(reason:string)=>({status:'unavailable' as const,reason});
const available=(value:unknown,source:string)=>({status:'available' as const,value,source});
const safeURL=(value:unknown)=>{try{if(typeof value!=='string'||value.length>8000)return;const u=new URL(value);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)return u.href;}catch{}};
/** Formats an existing authorized observation. No page read, file access, playback or agent turn. */
export function browserContinuity(snapshot:Record<string,unknown>,backend:'chrome'|'ally'){
 const url=safeURL(snapshot.url),title=typeof snapshot.title==='string'?snapshot.title.slice(0,500):undefined;
 const media=backend==='ally'&&Array.isArray(snapshot.media)?snapshot.media.filter(m=>m&&typeof m==='object'&&['video','audio'].includes(m.kind)):[];
 const active=media.length===1?media[0]:undefined;
 const position=active&&typeof active.positionMs==='number'&&Number.isFinite(active.positionMs)&&active.positionMs>=0?Math.floor(active.positionMs):undefined;
 const ytTs=url?youtubeTimestamp(url,position):undefined;
 const ytUrl=url&&ytTs!==undefined?youtubeContinuationUrl(url,ytTs.seconds):undefined;
 return {version:1,id:randomUUID(),origin:'explicit_browser_snapshot',observedAt:Date.now(),
  activeApp:available(backend==='chrome'?'Chrome':'Ally browser','selected_browser_backend'),
  originalUrl:url?available(url,'authorized_tab_snapshot'):unavailable('No supported original HTTP(S) URL reported'),
  sourceUri:unavailable('Browser observation does not grant document bytes'),
  document:unavailable('No original file attached; use explicit document sharing or file picker'),
  pageTitle:title?available(title,'document.title'):unavailable('Page title not reported'),
  currentPage:unavailable('Browser adapter does not report the PDF viewer current page'),
  mediaTitle:unavailable('Page title is not asserted to be the media title'),
  positionMs:position!==undefined?available(position,'single_visible_html_media_element'):unavailable(media.length>1?'Multiple media elements; choose a source explicitly':'No supported playback position reported'),
  mediaSource:active&&safeURL(active.source)?available(safeURL(active.source),'html_media_currentSrc'):unavailable('No portable media source URL reported'),
  youtubeContinuation:ytUrl?available(ytUrl,ytTs!.source):unavailable(url&&youtubeVideoId(url)?'YouTube page visible but no authoritative position supplied':'Not a YouTube page'),
  transcript:unavailable('No supported transcript supplied'),
  screenImage:unavailable('No screen image captured by this context envelope')};
}
