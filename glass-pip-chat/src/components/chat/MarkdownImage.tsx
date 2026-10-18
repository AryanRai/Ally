import { useEffect, useState } from 'react';
import { defaultUrlTransform } from 'react-markdown';

export const isLocalImage = (url: string) => /^(?:[a-z]:[\\/]|\/(?!\/)|file:\/\/\/)/i.test(url);
const previewPrefix = '/__ally_local_preview__/';
/** Keep local raster references intact through Streamdown's URL sanitizer. */
export function remarkLocalImages() {
  type Node = { type: string; url?: string; children?: Node[] };
  return (tree: Node) => {
    const walk = (node: Node) => {
      if ((node.type === 'image' || node.type === 'definition') && node.url && isLocalImage(node.url)) node.url = previewPrefix + encodeURIComponent(node.url);
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}
export function chatUrlTransform(url: string, key: string) {
  if (key === 'src' && isLocalImage(url)) return url;
  return /^codex:\/\/threads\/[\da-f-]{36}$/i.test(url) ? url : defaultUrlTransform(url);
}

export default function MarkdownImage({ src, alt, title }: { src?: string; alt?: string; title?: string }) {
  if (src?.startsWith(previewPrefix)) { try { src = decodeURIComponent(src.slice(previewPrefix.length)); } catch { src = undefined; } }
  const [result, setResult] = useState<{ source: string; url?: string; failed?: boolean }>();
  const local = !!src && isLocalImage(src);
  useEffect(() => {
    if (!local || !src) return;
    let disposed = false;
    window.pip?.agent?.localImage(src).then(url => { if (!disposed) setResult({ source: src, url }); })
      .catch(() => { if (!disposed) setResult({ source: src, failed: true }); });
    return () => { disposed = true; };
  }, [src, local]);
  const current = result?.source === src ? result : undefined;
  const url = local ? current?.url : src;
  if (!url || current?.failed) return <span role="status" className="my-2 block rounded-xl border border-border p-3 text-xs text-muted-foreground">{alt || 'Image preview'} · {current?.failed ? 'Preview unavailable' : 'Loading preview…'}</span>;
  return <img src={url} alt={alt || 'Image preview'} title={title} loading="lazy" className="my-2 max-h-[32rem] max-w-full rounded-xl object-contain" onError={() => setResult({ source: src!, failed: true })} />;
}
