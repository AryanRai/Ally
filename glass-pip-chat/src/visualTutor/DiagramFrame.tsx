import { useEffect, useMemo, useRef, useState } from 'react';
import type { TutorStep } from '../../electron/visualTutor/types';

const nonce = 'ally-local-diagram';
export const DIAGRAM_CSP = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
/** Runs only in an opaque-origin sandbox without preload, network, parent,
 * popups, downloads, storage or form/navigation capabilities. */
export function diagramDocument(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('base,meta,iframe,frame,object,embed,link').forEach(node => node.remove());
  for (const element of doc.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const localRaster = element.tagName.toLowerCase() === 'img' && attribute.name.toLowerCase() === 'src' && /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(attribute.value);
      if (/^on/i.test(attribute.name) || (!localRaster && ['src', 'srcset', 'action', 'formaction', 'target', 'download'].includes(attribute.name.toLowerCase()))) element.removeAttribute(attribute.name);
      if (['href', 'xlink:href'].includes(attribute.name.toLowerCase()) && !attribute.value.startsWith('#')) element.removeAttribute(attribute.name);
    }
    if (element.tagName.toLowerCase() === 'script') element.setAttribute('nonce', nonce);
  }
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${DIAGRAM_CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{color-scheme:dark;--foreground:rgba(255,255,255,.85);--muted-foreground:rgba(255,255,255,.55);--background:transparent;--border:rgba(255,255,255,.1);--viz-series-1:#8fe0be;--viz-series-2:#f5ca82;--viz-series-3:#c3b4ee;--viz-series-4:#efaaa4;--viz-series-5:#b9cfda;--viz-series-6:#ded6ac}body{margin:0;padding:10px;box-sizing:border-box;font:13px system-ui;color:rgba(255,255,255,.85);background:transparent}svg{max-width:100%;height:auto}button,input,select{font:inherit}*{box-sizing:border-box}</style>${doc.head.innerHTML}</head><body>${doc.body.innerHTML}<script nonce="${nonce}">(()=>{let queued=false;const report=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;parent.postMessage({type:"ally-diagram-size",height:Math.ceil(document.body.getBoundingClientRect().height)},"*")})};new ResizeObserver(report).observe(document.body);window.addEventListener("load",report);report()})()</script></body></html>`;
}
export default function DiagramFrame({ diagram, title, fill = false }: { diagram: NonNullable<TutorStep['diagram']>; title: string; fill?: boolean }) {
  const [playing, setPlaying] = useState(true);
  const [expanded, setExpanded] = useState(false);
  return <div className={`tutor-diagram${fill ? ' tutor-diagram-fill' : ''}`}>
    <button type="button" className="tutor-diagram-toggle" onClick={() => setPlaying(value => !value)}>{playing ? 'Hide diagram' : 'Show diagram'}</button>
    {playing && <>{!fill && <button type="button" className="tutor-diagram-toggle" onClick={() => setExpanded(value => !value)}>{expanded ? 'Compact diagram' : 'Expand diagram'}</button>}<FittedDiagram title={`Diagram: ${title}`} html={diagram.html} fill={fill} maxHeight={expanded ? Math.max(320, diagram.height) : Math.min(260, diagram.height)} /></>}
  </div>;
}

/** The opaque frame may report only its own bounded geometry, never tool requests. */
export function FittedDiagram({ html, title, maxHeight = 260, className, fill = false }: { html: string; title: string; maxHeight?: number; className?: string; fill?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [measured, setMeasured] = useState<number>();
  const document = useMemo(() => diagramDocument(html), [html]);
  useEffect(() => {
    setMeasured(undefined);
    const size = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== 'ally-diagram-size' || typeof event.data.height !== 'number' || !Number.isFinite(event.data.height)) return;
      setMeasured(Math.max(80, Math.min(600, Math.ceil(event.data.height))));
    };
    window.addEventListener('message', size);
    return () => window.removeEventListener('message', size);
  }, [html]);
  return <iframe ref={frame} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={document} className={className} style={{ display: 'block', height: fill ? '100%' : Math.min(maxHeight, measured ?? maxHeight), ...(fill ? { flex: '1 1 0', minHeight: 0 } : {}), width: '100%', border: 0, background: 'transparent' }} />;
}
