import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { claudeResumeLaunch } from './claudeResume';

const dirs: string[] = [];
const id = '60ce8fdb-d410-4e20-8e53-6a80107d3625';
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-resume-')); dirs.push(root);
  const cwd = path.join(root, 'Project', 'app'), projects = path.join(root, 'stores');
  fs.mkdirSync(cwd, { recursive: true });
  const save = (folder: string, session = id) => {
    const file = path.join(projects, folder.normalize('NFC').replace(/[^a-zA-Z0-9]/g, '-'), `${session}.jsonl`);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'original transcript'); return file;
  };
  return { cwd, projects, save };
}
describe('Claude project-scoped UUID resume', () => {
  it('resumes the original ancestor store without copying history or changing identity', () => {
    const { cwd, projects, save } = fixture(), parent = path.dirname(cwd), file = save(parent);
    const before = fs.readFileSync(file, 'utf8');
    expect(claudeResumeLaunch(cwd, id, projects)).toEqual({ cwd: parent, context: expect.stringContaining(JSON.stringify(cwd)) });
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    expect(fs.readdirSync(projects)).toHaveLength(1);
  });
  it('prefers the exact current store when both parent and child contain the UUID', () => {
    const { cwd, projects, save } = fixture(); save(cwd); save(path.dirname(cwd));
    expect(claudeResumeLaunch(cwd, id, projects)).toEqual({ cwd });
  });
  it('does not select a different UUID or an unrelated project', () => {
    const { cwd, projects, save } = fixture(); save(path.dirname(cwd), '11111111-1111-4111-8111-111111111111'); save(path.join(path.dirname(cwd), 'elsewhere'));
    expect(claudeResumeLaunch(cwd, id, projects)).toEqual({ cwd });
  });
  it('preserves fresh sessions and rejects path-like resume identities', () => {
    const { cwd, projects, save } = fixture(); save(path.dirname(cwd));
    expect(claudeResumeLaunch(cwd, undefined, projects)).toEqual({ cwd });
    expect(claudeResumeLaunch(cwd, '../escape', projects)).toEqual({ cwd });
  });
});
