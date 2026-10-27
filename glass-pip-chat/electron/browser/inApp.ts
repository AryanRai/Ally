import { app, BrowserWindow, WebContentsView, ipcMain, session } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webURL } from './policy.js';
import { chromiumUserAgent } from './userAgent.js';

type Page = { id: string; owner: string; window: BrowserWindow; view: WebContentsView; revision: string; refs: Map<string, { x: number; y: number; editable: boolean }>; observedURL?: string; busy: boolean };
const directory = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = `(() => {
 const visible = e => { const r=e.getBoundingClientRect(),s=getComputedStyle(e); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
 const nodes=[...document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]')].filter(visible).slice(0,300);
 const elements=nodes.map((e,i)=>{ const ref='e'+i; e.setAttribute('data-ally-browser-ref',ref); const r=e.getBoundingClientRect(); return {ref,role:e.getAttribute('role')||e.tagName.toLowerCase(),label:(e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.innerText||e.getAttribute('title')||'').slice(0,240),value:e.type==='password'?'[password]':String(e.value||'').slice(0,500),password:e.type==='password',disabled:!!e.disabled,editable:e.isContentEditable||['INPUT','TEXTAREA'].includes(e.tagName),x:r.x+r.width/2,y:r.y+r.height/2}; });
 const media=[...document.querySelectorAll('video,audio')].filter(visible).slice(0,8).map(e=>({kind:e.tagName.toLowerCase(),positionMs:Number.isFinite(e.currentTime)?Math.floor(e.currentTime*1000):null,source:e.currentSrc||null,paused:e.paused}));
 return {url:location.href,title:document.title,text:(document.body?.innerText||'').slice(0,24000),elements,media};
})()`;

/** A visible Ally browser with its own cookie partition, never Node/preload on web pages. */
export class InAppBrowser {
  private pages = new Map<string, Page>();
  private partition = 'persist:ally-browser';
  constructor() {
    const isolated = session.fromPartition(this.partition);
    isolated.setUserAgent(chromiumUserAgent(isolated.getUserAgent(), app.getName()));
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.on('will-download', event => event.preventDefault());
    ipcMain.handle('ally-browser:toolbar', (event, action: string, url?: unknown) => {
      const page = [...this.pages.values()].find(page => page.window.webContents === event.sender);
      if (!page || event.senderFrame !== page.window.webContents.mainFrame) return;
      if (action === 'go') return this.navigate(page, webURL(url));
      if (action === 'back' && page.view.webContents.canGoBack()) page.view.webContents.goBack();
      if (action === 'reload') page.view.webContents.reload();
      if (action === 'stop') page.view.webContents.stop();
    });
  }
  private get(id: unknown, owner: string) {
    const page = typeof id === 'string' ? this.pages.get(id) : undefined;
    if (!page || page.owner !== owner || page.window.isDestroyed()) throw Error('This browser tab is unavailable or belongs to another chat.');
    return page;
  }
  list(owner: string) { return [...this.pages.values()].filter(page => page.owner === owner).map(page => ({ tabId: page.id, title: page.view.webContents.getTitle(), url: page.view.webContents.getURL() })); }
  private invalidate(page: Page) { page.revision = randomUUID(); page.refs.clear(); page.observedURL = undefined; }
  private async navigate(page: Page, url: string) {
    this.invalidate(page);
    // loadURL can wait on a slow server. The caller gets a loading page instead
    // of interpreting a deadline as permission to repeat navigation.
    const loading = page.view.webContents.loadURL(url).catch(error => { if (!String(error).includes('ERR_ABORTED')) throw error; });
    await Promise.race([loading, new Promise<void>(resolve => { const timer = setTimeout(resolve, 8000); timer.unref(); })]);
  }
  async open(owner: string, url: string) {
    if (this.pages.size >= 12) throw Error('Close an Ally browser window before opening another.');
    const window = new BrowserWindow({ width: 1120, height: 800, title: 'Ally Browser', show: false, webPreferences: { preload: path.join(directory, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    const view = new WebContentsView({ webPreferences: { partition: this.partition, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false } });
    const page: Page = { id: randomUUID(), owner, window, view, revision: randomUUID(), refs: new Map(), busy: false };
    this.pages.set(page.id, page); window.contentView.addChildView(view);
    const layout = () => { const [width, height] = window.getContentSize(); view.setBounds({ x: 0, y: 52, width, height: Math.max(1, height - 52) }); };
    window.on('resize', layout); layout();
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    view.webContents.setWindowOpenHandler(details => {
      try { void this.open(owner, webURL(details.url)).catch(() => {}); } catch {}
      return { action: 'deny' };
    });
    const guard = (event: Electron.Event, target: string) => { try { webURL(target); } catch { event.preventDefault(); } };
    view.webContents.on('will-navigate', guard); view.webContents.on('will-redirect', guard);
    view.webContents.on('did-start-navigation', (_event, _url, _inPlace, mainFrame) => { if (mainFrame) this.invalidate(page); });
    const status = () => {
      if (window.isDestroyed()) return;
      window.setTitle(`${view.webContents.getTitle() || 'New page'} — Ally Browser`);
      window.webContents.send('ally-browser:state', { url: view.webContents.getURL(), loading: view.webContents.isLoading() });
    };
    view.webContents.on('did-navigate', status); view.webContents.on('did-navigate-in-page', status); view.webContents.on('did-stop-loading', status);
    window.on('closed', () => { this.pages.delete(page.id); if (!view.webContents.isDestroyed()) view.webContents.close(); });
    await window.loadFile(path.join(directory, 'toolbar.html')); window.show();
    await this.navigate(page, url); status();
    return this.observe(page.id, owner);
  }
  async observe(id: unknown, owner: string, screenshot = false) {
    const page = this.get(id, owner), contents = page.view.webContents;
    webURL(contents.getURL());
    if (screenshot) {
      const image = await contents.capturePage();
      return { tabId: page.id, url: contents.getURL(), revision: page.revision, image: image.resize({ width: Math.min(1280, image.getSize().width) }).toPNG().toString('base64') };
    }
    const snapshot = await contents.executeJavaScript(SNAPSHOT, false);
    if (snapshot.url !== contents.getURL()) throw Error('Page changed during observation. Observe again.');
    this.invalidate(page); page.observedURL = snapshot.url;
    for (const element of snapshot.elements) page.refs.set(element.ref, element);
    return { tabId: page.id, revision: page.revision, ...snapshot, untrustedPageData: true };
  }
  async action(owner: string, args: Record<string, unknown>, revision?: unknown) {
    const page = this.get(args.tabId, owner), contents = page.view.webContents;
    if (page.busy) throw Error('This browser tab already has an active action.');
    if (revision !== page.revision || page.observedURL !== contents.getURL()) throw Error('Page changed or was not observed. Take a fresh snapshot.');
    page.busy = true;
    try {
      webURL(contents.getURL());
      if (args.operation === 'close') { page.window.close(); return { closed: true }; }
      if (args.operation === 'open') { await this.navigate(page, webURL(args.url)); return await this.observe(page.id, owner); }
      if (args.operation === 'back') { if (!contents.canGoBack()) throw Error('No earlier page.'); contents.goBack(); }
      else if (args.operation === 'scroll') await contents.executeJavaScript(`window.scrollBy(0,${args.direction === 'up' ? -550 : 550})`, true);
      else if (args.operation === 'press') contents.sendInputEvent({ type: 'keyDown', keyCode: String(args.key) });
      else if (args.operation === 'click' || args.operation === 'fill') {
        if (!page.refs.has(String(args.ref))) throw Error('Unknown element ref. Observe again.');
        // Re-resolve the ref and verify its live geometry/visibility. Never click
        // an old coordinate after a layout shift or silently fall through a page.
        const ref = JSON.stringify(String(args.ref));
        const target = await contents.executeJavaScript(`(() => { const e=document.querySelector('[data-ally-browser-ref='+${ref}+']'); if(!e)return null; const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,password:e.type==='password',editable:e.isContentEditable||['INPUT','TEXTAREA'].includes(e.tagName),disabled:!!e.disabled}; })()`);
        if (revision !== page.revision || page.observedURL !== contents.getURL()) throw Error('Page changed during target resolution. Observe again.');
        const before = page.refs.get(String(args.ref))!;
        if (!target || target.width <= 0 || target.height <= 0 || target.disabled || Math.abs(target.x - before.x) > 2 || Math.abs(target.y - before.y) > 2) throw Error('Element moved. Observe again.');
        if (args.operation === 'fill' && (target.password || !target.editable)) throw Error('Fill requires a non-password editable field. Enter credentials yourself in the browser.');
        contents.sendInputEvent({ type: 'mouseDown', x: Math.round(target.x), y: Math.round(target.y), button: 'left', clickCount: 1 });
        contents.sendInputEvent({ type: 'mouseUp', x: Math.round(target.x), y: Math.round(target.y), button: 'left', clickCount: 1 });
        if (args.operation === 'fill') {
          await contents.executeJavaScript(`(() => { const e=document.querySelector('[data-ally-browser-ref='+${ref}+']'); e.focus(); if(e.select)e.select(); else { const range=document.createRange();range.selectNodeContents(e);const selection=getSelection();selection.removeAllRanges();selection.addRange(range); } })()`, true);
          contents.insertText(String(args.text));
        }
      }
      if (args.operation === 'press') contents.sendInputEvent({ type: 'keyUp', keyCode: String(args.key) });
      await new Promise(resolve => setTimeout(resolve, 150));
      this.invalidate(page);
      return await this.observe(page.id, owner);
    } finally { page.busy = false; }
  }
  close() { for (const page of this.pages.values()) page.window.destroy(); this.pages.clear(); ipcMain.removeHandler('ally-browser:toolbar'); }
}
