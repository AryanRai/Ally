import fs from 'node:fs';
import path from 'node:path';

const routes = [
  ['GET', /^\/v1\/(status|read-states|running|chats|usage|greeting)$/],
  ['GET', /^\/v1\/(chats|turns)\/[^/]+$/],
  ['POST', /^\/v1\/(chats|messages|read-state)$/],
  ['POST', /^\/v1\/attachments$/],
  ['GET', /^\/v1\/attachments\/[a-f0-9]{64}$/],
  ['POST', /^\/v1\/(chats|turns)\/[^/]+\/(stop|input)$/],
  ['POST', /^\/v1\/turns\/[^/]+\/approvals\/[^/]+$/],
];
export function allowedBridgeRoute(method, pathname) {
  return routes.some(([verb, pattern]) => verb === method && pattern.test(pathname));
}
const json = (res, status, data) => {
  res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
};

export function createNotchHandler({root, capability, configFile, selection, fetchImpl = fetch}) {
  let directory='notch-dist';
  const manifest=path.join(root,'notch-build.json');
  if(fs.existsSync(manifest))directory=JSON.parse(fs.readFileSync(manifest,'utf8')).assetDirectory || directory;
  const assets = path.resolve(root, directory);
  if(!assets.startsWith(path.resolve(root)+path.sep))throw Error('Invalid notch asset directory');
  return async (req, res, url) => {
    if (url.pathname.startsWith('/notch-api/')) {
      if (req.headers.authorization !== `Bearer ${capability}`) {
        json(res, 401, {error:'Reopen Chat from Ally Study to reconnect.'}); return true;
      }
      if(url.pathname==='/notch-api/v1/selection') {
        if(req.method==='GET') {
          try {json(res,200,await selection.refresh());}
          catch(error){json(res,503,{error:error.status===404?'Ally desktop needs the updated build for shared notch chats.':error.message});}
        }
        else if(req.method==='POST') {
          try {const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2048)throw Error('Selection is too large.');chunks.push(chunk);}
            json(res,200,await selection.select(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
          } catch(error) {json(res,400,{error:error.message});}
        } else json(res,405,{error:'Unsupported selection action.'});
        return true;
      }
      const route = url.pathname.slice('/notch-api'.length);
      if (!allowedBridgeRoute(req.method, route)) {
        json(res, 404, {error:'This action is unavailable in the notch.'}); return true;
      }
      try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        if (!config.enabled || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535 || !config.token) {
          throw Error('Open Ally with its local bridge enabled to connect chats.');
        }
        let body;
        const upload = req.method === 'POST' && route === '/v1/attachments';
        if (req.method === 'POST') {
          const chunks = []; let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > (upload ? 20*1024*1024 : 64000)) {json(res, 413, {error:upload?'Attachments must be under 20 MB.':'Message is too large.'}); return true;}
            chunks.push(chunk);
          }
          body = Buffer.concat(chunks);
        }
        // Keep Ally's bridge credential server-side, and retain its own
        // browser-Origin rejection. Only the explicit routes above are proxied.
        const response = await fetchImpl(`http://127.0.0.1:${config.port}${route}${url.search}`, {
          method:req.method, headers:{Authorization:`Bearer ${config.token}`, 'Content-Type':upload?(req.headers['content-type'] || 'application/octet-stream'):'application/json',
            ...(upload?{'x-ally-filename':String(req.headers['x-ally-filename'] || 'Attachment').slice(0,600)}:{})},
          body, redirect:'error', signal:AbortSignal.timeout(90000),
        });
        res.writeHead(response.status, {'Content-Type':response.headers.get('content-type') || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        json(res, 503, {error:'Ally’s local chat bridge is unavailable. Open Ally, then retry; your draft is kept.'});
      }
      return true;
    }
    if (url.pathname === '/usage/' || url.pathname === '/usage/usage.js') {
      if(req.method !== 'GET') {json(res,405,{error:'Read only asset route.'});return true;}
      const script=url.pathname.endsWith('.js');
      res.writeHead(200, {'Content-Type':script?'text/javascript; charset=utf-8':'text/html; charset=utf-8', 'Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});
      res.end(fs.readFileSync(path.join(root,'usage',script?'usage.js':'index.html')));return true;
    }
    if (!url.pathname.startsWith('/notch/')) return false;
    if (req.method !== 'GET') {json(res, 405, {error:'Read only asset route.'}); return true;}
    let relative;
    try {relative = decodeURIComponent(url.pathname.slice('/notch/'.length)) || 'index.html';}
    catch {json(res, 400, {error:'Invalid path.'}); return true;}
    const file = path.resolve(assets, relative);
    if (!file.startsWith(assets + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      json(res, 404, {error:'Embedded Ally UI has not been built.'}); return true;
    }
    const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.svg':'image/svg+xml'};
    res.writeHead(200, {
      'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    });
    res.end(fs.readFileSync(file)); return true;
  };
}
