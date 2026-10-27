// @vitest-environment node
import { expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateUploadFiles } from './uploads';
import { operationArgs } from './policy';
it('requires an observed target and exact URL for uploads', () => {
  expect(() => operationArgs({operation:'upload',tabId:'12',ref:'e1',paths:['C:/photo.png']})).toThrow();
  expect(operationArgs({operation:'upload',tabId:'12',ref:'e1',paths:['C:/photo.png'],url:'https://web.whatsapp.com/'})).toMatchObject({operation:'upload',ref:'e1'});
});
it('checks regular files, content fingerprints, duplicates and network/device paths', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'ally-upload-test-'));
  try {
    const file = path.join(dir,'photo.txt'); await fs.writeFile(file,'test photo fixture');
    const [first] = await validateUploadFiles([file]); expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(validateUploadFiles([file,file])).rejects.toThrow('twice');
    await expect(validateUploadFiles([dir])).rejects.toThrow('regular file');
    await expect(validateUploadFiles(['\\\\server\\private\\file'])).rejects.toThrow('local file');
    await fs.writeFile(file,'changed'); const [second] = await validateUploadFiles([file]); expect(first.sha256).not.toBe(second.sha256);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
