/**
 * Ally Browser Bridge — Background Service Worker v1.3
 * Connects to Ally's WebSocket server on ws://localhost:9009
 * Uses chrome.alarms keepalive (MV3 workaround).
 */

const WS_URL = 'ws://localhost:9009';
const RECONNECT_DELAY_MS = 3000;
const KEEPALIVE_ALARM = 'ally-keepalive';

let ws = null;
let connected = false;
let reconnectTimer = null;

// ── Keepalive ─────────────────────────────────────────────────────────────────
chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return;
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    scheduleReconnect(0);
  } else if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ type: 'ping' })); } catch (_) {}
  }
});

// ── Connection ────────────────────────────────────────────────────────────────
function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  console.log('[Ally] Connecting to', WS_URL);
  try { ws = new WebSocket(WS_URL); } catch (_) {
    scheduleReconnect(RECONNECT_DELAY_MS); return;
  }
  ws.onopen = () => {
    connected = true;
    console.log('[Ally] Connected');
    ws.send(JSON.stringify({ type: 'register', client: 'ally-browser-extension', version: '1.3.0' }));
    chrome.runtime.sendMessage({ type: 'status', connected: true }).catch(() => {});
  };
  ws.onmessage = async (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'pong' || msg.type === 'ping') return;
    if (msg.type !== 'command') return;
    const result = await handleCommand(msg.tool, msg.params || {});
    try { ws.send(JSON.stringify({ type: 'result', id: msg.id, ...result })); } catch (_) {}
  };
  ws.onclose = () => {
    connected = false;
    chrome.runtime.sendMessage({ type: 'status', connected: false }).catch(() => {});
    scheduleReconnect(RECONNECT_DELAY_MS);
  };
  ws.onerror = () => {};
}

function scheduleReconnect(delayMs) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delayMs);
}

connect();
self.addEventListener('activate', () => { connect(); });

// ── Popup messages ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'get_status') { sendResponse({ connected, wsState: ws?.readyState ?? -1 }); return true; }
  if (msg.type === 'reconnect') { ws?.close(); ws = null; connect(); sendResponse({ ok: true }); return true; }
});

// ── Command dispatcher ────────────────────────────────────────────────────────
async function handleCommand(tool, params) {
  try {
    switch (tool) {
      case 'browser_navigate':        return await cmdNavigate(params);
      case 'browser_click':           return await cmdClick(params);
      case 'browser_type':            return await cmdType(params);
      case 'browser_read_page':       return await cmdReadPage(params);
      case 'browser_screenshot':      return await cmdScreenshot(params);
      case 'browser_eval':            return await cmdEval(params);
      case 'browser_find_element':    return await cmdFindElement(params);
      case 'browser_scroll':          return await cmdScroll(params);
      case 'browser_get_tabs':        return await cmdGetTabs(params);
      case 'browser_switch_tab':      return await cmdSwitchTab(params);
      case 'browser_go_back':         return await cmdGoBack(params);
      case 'browser_go_forward':      return await cmdGoForward(params);
      case 'browser_wait_for':        return await cmdWaitFor(params);
      case 'browser_get_url':         return await cmdGetUrl(params);
      case 'browser_press_key':       return await cmdPressKey(params);
      case 'browser_new_tab':         return await cmdNewTab(params);
      case 'browser_close_tab':       return await cmdCloseTab(params);
      default: return { success: false, error: `Unknown tool: ${tool}` };
    }
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

// ── Generic helpers ───────────────────────────────────────────────────────────
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) throw new Error('No active tab found');
  return tab;
}

async function injectAndRun(tabId, func, args = []) {
  const results = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return results[0]?.result;
}

async function waitForTabLoad(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const deadline = setTimeout(resolve, timeoutMs);
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(deadline);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 800);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ── Generic browser tools ─────────────────────────────────────────────────────

async function cmdNavigate({ url }) {
  if (!url) return { success: false, error: 'url required' };
  const tab = await getActiveTab();
  await chrome.tabs.update(tab.id, { url });
  await waitForTabLoad(tab.id);
  const updated = await chrome.tabs.get(tab.id);
  return { success: true, url: updated.url, title: updated.title };
}

async function cmdNewTab({ url }) {
  const tab = await chrome.tabs.create({ url: url || 'about:blank', active: true });
  if (url) await waitForTabLoad(tab.id);
  return { success: true, tabId: tab.id, url: tab.url };
}

async function cmdCloseTab({ tabId }) {
  const tab = tabId ? await chrome.tabs.get(tabId) : await getActiveTab();
  await chrome.tabs.remove(tab.id);
  return { success: true };
}

async function cmdClick({ selector, text, index }) {
  const tab = await getActiveTab();
  const result = await injectAndRun(tab.id, (sel, txt, idx) => {
    let candidates = [];
    if (sel) {
      candidates = Array.from(document.querySelectorAll(sel));
    } else if (txt) {
      const all = document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"], span, div, p, li, [contenteditable]');
      for (const e of all) {
        if (e.textContent.trim().toLowerCase().includes(txt.toLowerCase())) candidates.push(e);
      }
    }
    const el = candidates[idx || 0];
    if (!el) return { success: false, error: `Element not found: ${sel || txt}` };
    el.scrollIntoView({ block: 'center' });
    el.click();
    return { success: true, tag: el.tagName, text: el.textContent.trim().slice(0, 100) };
  }, [selector || null, text || null, index || 0]);
  return result || { success: false, error: 'Script returned null' };
}

async function cmdType({ selector, text, append, pressEnter }) {
  const tab = await getActiveTab();
  const result = await injectAndRun(tab.id, (sel, txt, app, enter) => {
    const el = document.querySelector(sel);
    if (!el) return { success: false, error: `Element not found: ${sel}` };
    el.focus();
    if (el.isContentEditable) {
      if (!app) { el.innerHTML = ''; document.execCommand('selectAll', false, null); document.execCommand('delete', false, null); }
      document.execCommand('insertText', false, txt);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      const newVal = app ? (el.value + txt) : txt;
      if (setter) { setter.call(el, newVal); } else { el.value = newVal; }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (enter) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    }
    return { success: true };
  }, [selector, text, append || false, pressEnter || false]);
  return result || { success: false, error: 'Script returned null' };
}

async function cmdPressKey({ key, selector }) {
  const tab = await getActiveTab();
  const result = await injectAndRun(tab.id, (k, sel) => {
    const el = sel ? document.querySelector(sel) : document.activeElement;
    if (!el) return { success: false, error: 'No element' };
    const opts = { key: k, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    el.dispatchEvent(new KeyboardEvent('keypress', opts));
    el.dispatchEvent(new KeyboardEvent('keyup', opts));
    return { success: true };
  }, [key, selector || null]);
  return result || { success: false, error: 'Script returned null' };
}

async function cmdReadPage({ includeLinks, includeHtml, selector }) {
  const tab = await getActiveTab();
  const result = await injectAndRun(tab.id, (links, html, sel) => {
    const root = sel ? document.querySelector(sel) : document.body;
    return {
      success: true, title: document.title, url: location.href,
      text: (root?.innerText || '').slice(0, 10000),
      links: links ? Array.from(document.querySelectorAll('a[href]')).slice(0, 100).map(a => ({ text: a.textContent.trim().slice(0, 80), href: a.href })) : [],
      html: html ? (root?.outerHTML || '').slice(0, 30000) : null,
    };
  }, [includeLinks || false, includeHtml || false, selector || null]);
  return result || { success: false, error: 'Could not read page' };
}

async function cmdScreenshot() {
  const tab = await getActiveTab();
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  return { success: true, dataUrl };
}

async function cmdEval({ code }) {
  if (!code) return { success: false, error: 'code required' };
  const tab = await getActiveTab();
  const result = await injectAndRun(tab.id, (c) => {
    try { const r = eval(c); return { success: true, result: typeof r === 'object' ? JSON.stringify(r) : String(r ?? '') }; }
    catch (e) { return { success: false, error: e.message }; }
  }, [code]);
  return result || { success: false, error: 'Script returned null' };
}

async function cmdFindElement({ selector, text }) {
  const tab = await getActiveTab();
  const result = await injectAndRun(tab.id, (sel, txt) => {
    let el = sel ? document.querySelector(sel) : null;
    if (!el && txt) {
      for (const e of document.querySelectorAll('*')) {
        if (e.children.length === 0 && e.textContent.trim().toLowerCase().includes(txt.toLowerCase())) { el = e; break; }
      }
    }
    if (!el) return { success: false, error: 'Not found' };
    const rect = el.getBoundingClientRect();
    return { success: true, tag: el.tagName, id: el.id, className: el.className, text: el.textContent.trim().slice(0, 200), visible: rect.width > 0 && rect.height > 0, rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } };
  }, [selector || null, text || null]);
  return result || { success: false, error: 'Script returned null' };
}

async function cmdScroll({ x, y, selector }) {
  const tab = await getActiveTab();
  const result = await injectAndRun(tab.id, (sx, sy, sel) => {
    if (sel) { const el = document.querySelector(sel); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return { success: true }; } }
    window.scrollBy(sx || 0, sy || 300);
    return { success: true };
  }, [x || 0, y || 0, selector || null]);
  return result || { success: true };
}

async function cmdGetTabs() {
  const tabs = await chrome.tabs.query({});
  return { success: true, tabs: tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active, windowId: t.windowId })) };
}

async function cmdSwitchTab({ url, title, tabId }) {
  let tab;
  if (tabId) { tab = await chrome.tabs.get(tabId); }
  else {
    const all = await chrome.tabs.query({});
    tab = all.find(t => (url && t.url?.toLowerCase().includes(url.toLowerCase())) || (title && t.title?.toLowerCase().includes(title.toLowerCase())));
  }
  if (!tab) return { success: false, error: 'Tab not found' };
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  return { success: true, tab: { id: tab.id, title: tab.title, url: tab.url } };
}

async function cmdGoBack()    { const tab = await getActiveTab(); await chrome.tabs.goBack(tab.id);    return { success: true }; }
async function cmdGoForward() { const tab = await getActiveTab(); await chrome.tabs.goForward(tab.id); return { success: true }; }

async function cmdWaitFor({ selector, timeout }) {
  const tab = await getActiveTab();
  const result = await injectAndRun(tab.id, (sel, t) => {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        const el = document.querySelector(sel);
        if (el) return resolve({ success: true, found: true });
        if (Date.now() - start > t) return resolve({ success: false, error: 'Timeout: ' + sel });
        setTimeout(check, 200);
      };
      check();
    });
  }, [selector, timeout || 10000]);
  return result || { success: false, error: 'Script returned null' };
}

async function cmdGetUrl() {
  const tab = await getActiveTab();
  return { success: true, url: tab.url, title: tab.title };
}
