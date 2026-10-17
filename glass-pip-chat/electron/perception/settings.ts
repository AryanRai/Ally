// Perception settings, in Ally's user data. The TypeSafe key lives only here
// (or TYPESAFE_API_KEY); the renderer only ever learns whether one is set.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_THRESHOLDS } from './relevance.js';
import type { CaptureToggles, PerceptionMode, RelevanceThresholds } from './types.js';

export interface PerceptionSettings {
  jevEnabled: boolean;
  jevApiKey?: string;
  jevModel: string;
  thresholds: RelevanceThresholds;
  /** Display to observe; primary when unset */
  displayId?: string;
  defaultMode: PerceptionMode;
  defaultCapture: CaptureToggles;
  quiet: boolean;
}

/** What the renderer may see. */
export type PublicPerceptionSettings = Omit<PerceptionSettings, 'jevApiKey'> & { jevKeySet: boolean };

const DEFAULTS: PerceptionSettings = {
  jevEnabled: true,
  jevModel: 'jev-latest',
  thresholds: DEFAULT_THRESHOLDS,
  defaultMode: 'general',
  defaultCapture: { microphone: false, systemAudio: true, screen: true },
  quiet: false,
};

const file = () => path.join(app.getPath('userData'), 'perception-settings.json');

export function loadPerceptionSettings(): PerceptionSettings {
  try {
    const saved = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return { ...DEFAULTS, ...saved, thresholds: { ...DEFAULT_THRESHOLDS, ...saved.thresholds }, defaultCapture: { ...DEFAULTS.defaultCapture, ...saved.defaultCapture } };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePerceptionSettings(patch: Partial<PerceptionSettings>): PerceptionSettings {
  const next = { ...loadPerceptionSettings(), ...patch };
  if (patch.jevApiKey === '') delete next.jevApiKey;
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2));
  return next;
}

export function publicSettings(s: PerceptionSettings): PublicPerceptionSettings {
  const { jevApiKey, ...rest } = s;
  return { ...rest, jevKeySet: !!(jevApiKey || process.env.TYPESAFE_API_KEY) };
}
