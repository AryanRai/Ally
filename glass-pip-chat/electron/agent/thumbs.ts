// Shrink images the agents return (screenshots, image reads) before they reach
// the renderer, so chats stay small enough to persist.
import { nativeImage } from 'electron';

const MAX_WIDTH = 640;
const MAX_IMAGES = 6;
// Unread/history polling can request the same screenshots repeatedly. Bound
// both source keys and JPEG results so this cannot grow with chat history.
const CACHE_UNITS = 4 * 1024 * 1024; // UTF-16 code units, about 8 MiB.
const cache = new Map<string, string>();
let cacheUnits = 0;

export function thumbnail(dataUrl: string): string {
  const cached = cache.get(dataUrl);
  if (cached !== undefined) {
    cache.delete(dataUrl);
    cache.set(dataUrl, cached);
    return cached;
  }
  try {
    let img = nativeImage.createFromDataURL(dataUrl);
    if (img.isEmpty()) return dataUrl;
    if (img.getSize().width > MAX_WIDTH) img = img.resize({ width: MAX_WIDTH, quality: 'good' });
    const result = `data:image/jpeg;base64,${img.toJPEG(72).toString('base64')}`;
    const size = dataUrl.length + result.length;
    if (size <= CACHE_UNITS) {
      while (cache.size && (cache.size >= 32 || cacheUnits + size > CACHE_UNITS)) {
        const oldest = cache.keys().next().value!;
        cacheUnits -= oldest.length + cache.get(oldest)!.length;
        cache.delete(oldest);
      }
      cache.set(dataUrl, result);
      cacheUnits += size;
    }
    return result;
  } catch {
    return dataUrl;
  }
}

export function thumbnails(images: string[] | undefined): string[] | undefined {
  return images?.length ? images.slice(0, MAX_IMAGES).map(thumbnail) : undefined;
}
