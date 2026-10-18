import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { FittedDiagram } from '@/visualTutor/DiagramFrame';

export const documentPrefix = '/__ally_document__/';
export const visualizationPrefix = '/__ally_visualization__/';
export default function ChatLink({ href, children, node: _node, ...props }: ComponentProps<'a'> & { node?: unknown }) {
  const [failed, setFailed] = useState(false);
  const [diagram, setDiagram] = useState<string>();
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    request.current++; setDiagram(undefined); setFailed(false); setLoading(false);
    return () => { request.current++; };
  }, [href]);
  if (href?.startsWith(visualizationPrefix)) return <span className="block">
    <button type="button" className="text-foreground/65 underline hover:text-foreground" disabled={loading} onClick={() => {
      if (diagram) { setDiagram(undefined); return; }
      setFailed(false); setLoading(true);
      const revision = ++request.current;
      Promise.resolve().then(() => {
        if (!window.pip?.readVisualization) throw Error('Unavailable');
        return window.pip.readVisualization(decodeURIComponent(href.slice(visualizationPrefix.length)));
      }).then(html => { if (revision === request.current) setDiagram(html); }).catch(() => { if (revision === request.current) setFailed(true); }).finally(() => { if (revision === request.current) setLoading(false); });
    }}>{loading ? 'Loading diagram…' : diagram ? 'Hide diagram' : children}</button>
    {failed && <span role="status" className="ml-1 text-[11px] text-foreground/50">Diagram unavailable</span>}
    {diagram && <FittedDiagram title="Interactive diagram" html={diagram} className="mt-2 rounded-lg border border-white/10 bg-transparent" />}
  </span>;
  if (!href?.startsWith(documentPrefix)) return <a {...props} href={href} target="_blank" rel="noreferrer">{children}</a>;
  return <><a {...props} href={href} onClick={event => {
    event.preventDefault(); setFailed(false);
    try {
      const api = window.pip?.openLocalDocument;
      if (!api) { setFailed(true); return; }
      void api(decodeURIComponent(href.slice(documentPrefix.length))).catch(() => setFailed(true));
    } catch { setFailed(true); }
  }}>{children}</a>{failed && <span role="status" className="ml-1 text-[11px] text-foreground/50">File unavailable</span>}</>;
}
