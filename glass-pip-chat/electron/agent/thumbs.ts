// Shrink images the agents return (screenshots, image reads) before they reach
// the renderer, so chats stay small enough to persist.
import { nativeImage } from 'electron';

const MAX_WIDTH = 640;
const MAX_IMAGES = 6;

export function thumbnail(dataUrl: string): string {
  try {
    let img = nativeImage.createFromDataURL(dataUrl);
    if (img.isEmpty()) return dataUrl;
    if (img.getSize().width > MAX_WIDTH) img = img.resize({ width: MAX_WIDTH, quality: 'good' });
    return `data:image/jpeg;base64,${img.toJPEG(72).toString('base64')}`;
  } catch {
    return dataUrl;
  }
}

export function thumbnails(images: string[] | undefined): string[] | undefined {
  return images?.length ? images.slice(0, MAX_IMAGES).map(thumbnail) : undefined;
}
