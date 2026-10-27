import fs from 'node:fs/promises';
import path from 'node:path';
import { nativeImage } from 'electron';
import { MAX_DIAGRAM_IMAGES, MAX_DIAGRAM_IMAGE_UNITS } from './types.js';

/** Explicit agent-supplied local raster files; opaque frames never read files. */
export async function prepareDiagramImages(value: unknown): Promise<Record<string, string> | undefined> {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_DIAGRAM_IMAGES) throw Error(`Use up to ${MAX_DIAGRAM_IMAGES} local image assets.`);
  const images: Record<string, string> = Object.create(null);
  let units = 0;
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[a-z\d_-]{1,40}$/i.test(item.id) || Object.hasOwn(images, item.id)
      || typeof item.path !== 'string' || !path.isAbsolute(item.path) || /^[/\\]{2}/.test(item.path) || !/\.(?:png|jpe?g|webp|gif)$/i.test(item.path)) throw Error('Image assets require unique IDs and absolute local PNG/JPEG/WebP/GIF paths.');
    const stat = await fs.stat(item.path);
    if (!stat.isFile() || stat.size > 24 * 1024 * 1024) throw Error('Use a page/image preview under 24 MB.');
    let image = nativeImage.createFromBuffer(await fs.readFile(item.path));
    if (image.isEmpty()) throw Error(`Could not decode image asset ${item.id}.`);
    const { width, height } = image.getSize();
    if (!width || !height || width * height > 64_000_000) throw Error('Use an image preview up to 64 megapixels.');
    const longest = Math.max(width, height);
    if (longest > 1800) image = image.resize(width >= height ? { width: 1800, quality: 'good' } : { height: 1800, quality: 'good' });
    const data = 'data:image/jpeg;base64,' + image.toJPEG(85).toString('base64');
    units += data.length;
    if (units > MAX_DIAGRAM_IMAGE_UNITS) throw Error('Image assets exceed the card preview budget. Use fewer images or lower-resolution previews.');
    images[item.id] = data;
  }
  return images;
}
