import fs from 'node:fs';

export function imageMimeType(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a/.test(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return undefined;
}

/** Only paths explicitly supplied by native image items, never a device's download request. */
export function localImageDataUrl(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024 || !stat.size) return;
    const bytes = fs.readFileSync(file); const mime = imageMimeType(bytes);
    if (mime) return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch { /* Native image references can outlive their temporary files. */ }
  return undefined;
}
