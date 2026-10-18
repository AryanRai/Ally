import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { shell } from 'electron';

/** Read only a bounded generated artifact, never arbitrary local HTML or a linked file outside its root. */
export async function readVisualization(value: unknown) {
  if (typeof value !== 'string' || /[\0\r\n]/.test(value) || !/\.html?$/i.test(value) || !/^(?:[a-z]:[\\/]|\/(?!\/))/i.test(value) || !path.isAbsolute(value)) throw Error('Invalid diagram');
  const root = await fs.realpath(path.join(os.homedir(), '.codex', 'visualizations'));
  const file = await fs.realpath(value);
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Diagram outside artifact folder');
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 1_000_000) throw Error('Diagram unavailable or too large');
    const buffer = Buffer.alloc(1_000_001);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 1_000_000) throw Error('Diagram too large');
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await handle.close(); }
}

/** Only a deliberate click opens a local regular document. Never execute an
 * arbitrary output file or resolve network/URL references as local files. */
export async function openLocalDocument(value: unknown) {
  if (typeof value !== 'string' || /[\0\r\n]/.test(value) || !/^(?:[a-z]:[\\/]|\/(?!\/))/i.test(value)) throw Error('Invalid local document');
  const file = path.resolve(value);
  if (!(await fs.stat(file)).isFile()) throw Error('Document unavailable');
  if (/\.(?:pdf|txt|md|csv|json|docx|xlsx|pptx|png|jpe?g|gif|webp|mp[34]|wav)$/i.test(file)) {
    const error = await shell.openPath(file);
    if (error) throw Error('Could not open document');
  } else shell.showItemInFolder(file);
}
