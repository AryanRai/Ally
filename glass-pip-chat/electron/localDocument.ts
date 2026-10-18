import fs from 'node:fs/promises';
import path from 'node:path';
import { shell } from 'electron';

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
