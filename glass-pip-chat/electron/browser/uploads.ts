import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Explicit files only. Never traverse a directory or accept a network/device path. */
export async function validateUploadFiles(paths: string[]) {
  const files: Array<{ path: string; bytes: number; sha256: string }> = [];
  let total = 0;
  for (const name of paths) {
    if (!path.isAbsolute(name) || /^(?:\\\\|\/\/)/.test(name) || name.includes('\0') || (process.platform === 'win32' && (!/^[a-z]:[\\/]/i.test(name) || name.slice(2).includes(':')))) throw Error('Upload requires explicit absolute local file paths, without network paths or device streams.');
    const real = await fs.realpath(name);
    if (/^(?:\\\\|\/\/)/.test(real)) throw Error('Network attachment targets are not supported.');
    const handle = await fs.open(real, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > 20 * 1024 * 1024) throw Error('Each attachment must be a nonempty regular file under 20 MB.');
      total += stat.size;
      if (total > 40 * 1024 * 1024) throw Error('Attachments must total at most 40 MB.');
      const bytes = await handle.readFile();
      if (bytes.length !== stat.size) throw Error('Attachment changed while reading; inspect it before retrying.');
      files.push({ path: real, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    } finally { await handle.close(); }
  }
  if (new Set(files.map(f => process.platform === 'win32' ? f.path.toLowerCase() : f.path)).size !== files.length) throw Error('The same attachment was selected twice.');
  return files;
}
