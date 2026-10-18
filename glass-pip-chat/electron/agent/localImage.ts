import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Read raster previews only; never expose general files or network shares to Markdown. */
export async function localImage(source: string): Promise<string> {
  if (typeof source !== 'string' || source.length > 4096) throw Error('Invalid image path');
  const file = source.startsWith('file:') ? fileURLToPath(source) : source;
  if (!path.isAbsolute(file) || /^[\\/]{2}/.test(file) || !/\.(png|jpe?g|gif|webp)$/i.test(file)) throw Error('Unsupported image path');
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw Error('Image is too large');
    const data = await handle.readFile();
    const mime = data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
      : data[0] === 255 && data[1] === 216 && data[2] === 255 ? 'jpeg'
      : /^GIF8[79]a$/.test(data.toString('ascii', 0, 6)) ? 'gif'
      : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : undefined;
    if (!mime) throw Error('Unsupported image content');
    return `data:image/${mime};base64,${data.toString('base64')}`;
  } finally { await handle.close(); }
}
