import http from 'node:http';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
/** Only generated registered MP4s; clients cannot nominate a filesystem path. */
export class ManimMedia {
  private token=randomBytes(32).toString('hex');
  private files=new Map<string,{file:string;board:string}>();
  private server?:http.Server;
  private port=0;
  private closed=false;
  async start(){
    if(this.closed)throw Error('Manim media service closed');
    if(this.server)return;
    const server=http.createServer((req,res)=>{
      const match=new RegExp('^/'+this.token+'/([a-f0-9]{32})\\.mp4$').exec(req.url??'');
      const file=match?this.files.get(match[1]):undefined;
      if(!file||!['GET','HEAD'].includes(req.method??'')){res.writeHead(404).end();return;}
      let size:number;try{size=fs.statSync(file.file).size;}catch{res.writeHead(404).end();return;}
      let start=0,end=size-1;const range=req.headers.range;
      if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}}
      res.writeHead(range?206:200,{'Content-Type':'video/mp4','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
      if(req.method==='HEAD'){res.end();return;}
      const stream=fs.createReadStream(file.file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    });
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});
    if(this.closed){server.close();throw Error('Manim media service closed');}
    this.server=server;this.port=(server.address() as {port:number}).port;
  }
  async register(file:string,board:string){await this.start();const key=randomBytes(16).toString('hex');this.files.set(key,{file,board});return `http://127.0.0.1:${this.port}/${this.token}/${key}.mp4`;}
  /** The sandboxed file-origin renderer receives only this board's registered media,
   * never a path or an arbitrary network fetch. Blob playback avoids Chromium's
   * file-to-loopback URL safety rejection and provides native seeking. */
  async read(url: unknown, board: string): Promise<Uint8Array> {
    const prefix = `http://127.0.0.1:${this.port}/${this.token}/`;
    if (typeof url !== 'string' || !url.startsWith(prefix)) throw Error('Unknown Study clip');
    const key = /^([a-f0-9]{32})\.mp4$/.exec(url.slice(prefix.length))?.[1];
    const entry = key ? this.files.get(key) : undefined;
    if (!entry || entry.board !== board || this.closed) throw Error('This Study clip is no longer available on this board');
    const handle = await fs.promises.open(entry.file, 'r');
    try {
      const size = (await handle.stat()).size;
      if (!size || size > 64 * 1024 * 1024) throw Error('Study clip exceeds the 64 MB playback limit');
      const bytes = Buffer.alloc(size);
      let offset = 0;
      while (offset < size) {
        const { bytesRead } = await handle.read(bytes, offset, size - offset, offset);
        if (!bytesRead) throw Error('Study clip is incomplete');
        offset += bytesRead;
      }
      if (this.closed || this.files.get(key!) !== entry) throw Error('Study clip was closed while loading');
      return bytes;
    } finally { await handle.close(); }
  }
  revoke(board:string){for(const [key,value]of this.files)if(value.board===board)this.files.delete(key);}
  close(){this.closed=true;this.files.clear();this.server?.closeAllConnections();this.server?.close();this.server=undefined;}
}
export const isManimClipUrl=(value:unknown):value is string=>typeof value==='string'&&/^http:\/\/127\.0\.0\.1:\d{1,5}\/[a-f0-9]{64}\/[a-f0-9]{32}\.mp4$/.test(value);
