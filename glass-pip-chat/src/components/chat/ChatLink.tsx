import { useState, type ComponentProps } from 'react';

export const documentPrefix = '/__ally_document__/';
export default function ChatLink({ href, children, node: _node, ...props }: ComponentProps<'a'> & { node?: unknown }) {
  const [failed, setFailed] = useState(false);
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
