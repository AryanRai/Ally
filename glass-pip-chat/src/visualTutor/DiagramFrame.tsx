import { useMemo, useState } from 'react';
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
      if (/^on/i.test(attribute.name) || ['src', 'srcset', 'action', 'formaction', 'target', 'download'].includes(attribute.name.toLowerCase())) element.removeAttribute(attribute.name);
      if (['href', 'xlink:href'].includes(attribute.name.toLowerCase()) && !attribute.value.startsWith('#')) element.removeAttribute(attribute.name);
    }
    if (element.tagName.toLowerCase() === 'script') element.setAttribute('nonce', nonce);
  }
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${DIAGRAM_CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{color-scheme:dark}body{margin:0;padding:10px;box-sizing:border-box;font:13px system-ui;color:#e8edf2;background:#151820}svg{max-width:100%;height:auto}button,input,select{font:inherit}*{box-sizing:border-box}</style>${doc.head.innerHTML}</head><body>${doc.body.innerHTML}</body></html>`;
}
export default function DiagramFrame({ diagram, title }: { diagram: NonNullable<TutorStep['diagram']>; title: string }) {
  const [playing, setPlaying] = useState(true);
  const document = useMemo(() => diagramDocument(diagram.html), [diagram.html]);
  return <div className="tutor-diagram">
    <button type="button" className="tutor-diagram-toggle" onClick={() => setPlaying(value => !value)}>{playing ? 'Hide diagram' : 'Show diagram'}</button>
    {playing && <iframe title={`Diagram: ${title}`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={document} style={{ height: diagram.height, width: '100%', border: 0 }} />}
  </div>;
}
