import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Claude resolves UUID resumes in the launch project's store, not across projects.
 * A session can keep that store after its working folder moves into a subfolder.
 * Launch from its exact ancestor store and retain the requested working folder
 * in the system context. Never copy transcripts or manufacture a new session.
 */
export function claudeResumeLaunch(cwd: string, sessionId?: string, projects = path.join(os.homedir(), '.claude', 'projects')): { cwd: string; context?: string } {
  if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) return { cwd };
  let candidate = path.resolve(cwd);
  for (;;) {
    const project = candidate.normalize('NFC').replace(/[^a-zA-Z0-9]/g, '-');
    const transcript = path.join(projects, project, `${sessionId}.jsonl`);
    try {
      if (fs.statSync(transcript).isFile()) return candidate === path.resolve(cwd) ? { cwd } : {
        cwd: candidate,
        context: `This conversation's current working folder is ${JSON.stringify(path.resolve(cwd))}. The process starts in its parent only to resume the original conversation from its existing project store. Work from the current working folder, using explicit paths or changing directory for commands.`,
      };
    } catch { /* Continue through ancestors; the CLI handles unknown/external sessions. */ }
    const parent = path.dirname(candidate);
    if (parent === candidate) return { cwd };
    candidate = parent;
  }
}
