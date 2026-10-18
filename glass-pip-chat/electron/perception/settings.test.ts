import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ dir: '' }));
vi.mock('electron', () => ({ app: { getPath: () => fixture.dir } }));
import { loadPerceptionSettings, publicSettings, savePerceptionSettings } from './settings';

beforeAll(() => { fixture.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-relevance-settings-')); });
afterAll(() => { fs.rmSync(fixture.dir, { recursive: true, force: true }); });

it('migrates existing Jev/capture settings and preserves them when selecting Orbit', () => {
  fs.writeFileSync(path.join(fixture.dir, 'perception-settings.json'), JSON.stringify({ jevEnabled: false, jevApiKey: 'private-test-key', quiet: true, defaultCapture: { microphone: false, systemAudio: false, screen: false }, thresholds: { invoke: 0.7 } }));
  const old = loadPerceptionSettings();
  expect(old).toMatchObject({ relevanceProvider: 'jev', jevEnabled: false, quiet: true, vertexLocation: 'global', thresholds: { invoke: 0.7 } });
  const next = savePerceptionSettings({ relevanceProvider: 'vertex', vertexProject: 'orbit-494815' });
  expect(next).toMatchObject({ relevanceProvider: 'vertex', vertexProject: 'orbit-494815', jevApiKey: 'private-test-key', quiet: true, defaultCapture: { microphone: false, systemAudio: false, screen: false }, thresholds: { invoke: 0.7 } });
  expect(publicSettings(next)).not.toHaveProperty('jevApiKey');
  expect(publicSettings(next).jevKeySet).toBe(true);
});
