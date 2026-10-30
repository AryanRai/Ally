import fs from 'node:fs';
import path from 'node:path';
import { sharedCodexHome } from './codexAccounts.js';
import { currentCodegraphPool } from './codegraphPool.js';

/**
 * Fewer MCP servers for the turns Ally starts. Codex otherwise starts every configured server for
 * each turn. KiCAD (with its Python bridge) only starts in a KiCad project folder unless enabled
 * everywhere, and CodeGraph is shared per folder (codegraphPool) instead of started per turn.
 * The Codex and Claude apps' own settings are never changed.
 */

let kicadEverywhere = false;
export function configureMcpSavings(options: { kicadEverywhere?: boolean }) { kicadEverywhere = options.kicadEverywhere === true; }

/** Name of the shared CodeGraph server in a turn; the configured `codegraph` is switched off. */
export const SHARED_CODEGRAPH = 'codegraph_shared';

let configured: { mtimeMs: number; servers: Set<string> } | undefined;
/** Server names in the user's Codex config; a server can only be switched off if it exists there. */
function configuredServers(home = sharedCodexHome()): Set<string> {
  const file = path.join(home, 'config.toml');
  try {
    const { mtimeMs } = fs.statSync(file);
    if (configured?.mtimeMs !== mtimeMs) {
      const names = [...fs.readFileSync(file, 'utf8').matchAll(/^\s*\[mcp_servers\.(?:"([^"]+)"|'([^']+)'|([\w-]+))\]\s*$/gm)].map(m => m[1] ?? m[2] ?? m[3]);
      configured = { mtimeMs, servers: new Set(names) };
    }
    return configured.servers;
  } catch { return new Set(); }
}

/** A project file with this extension in the folder itself or one level down. */
function hasProject(cwd: string | undefined, extension: string): boolean {
  if (!cwd) return false;
  const found = (dir: string) => { try { return fs.readdirSync(dir).some(name => name.toLowerCase().endsWith(extension)); } catch { return false; } };
  if (found(cwd)) return true;
  try {
    return fs.readdirSync(cwd, { withFileTypes: true }).some(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules' && found(path.join(cwd, entry.name)));
  } catch { return false; }
}
export const hasKicadProject = (cwd: string | undefined) => hasProject(cwd, '.kicad_pro');
export const hasUnrealProject = (cwd: string | undefined) => hasProject(cwd, '.uproject');

/** Robot servers: Ally adds these itself in robot mode, so they are switched off elsewhere. */
const ROBOT_SERVERS = ['howyouseeme', 'droidcore'];

/** MCP overrides for one Codex turn, merged into its `mcp_servers` config. */
export function codexMcpOverrides(cwd: string | undefined, servers = configuredServers()): Record<string, Record<string, unknown>> {
  const overrides: Record<string, Record<string, unknown>> = {};
  if (servers.has('kicad') && !kicadEverywhere && !hasKicadProject(cwd)) overrides.kicad = { enabled: false };
  // mcp-unreal waits for the Unreal editor and holds every turn for its 120 s start timeout without it.
  if (servers.has('mcp-unreal') && !hasUnrealProject(cwd)) overrides['mcp-unreal'] = { enabled: false };
  // Nothing listens on these outside robot mode; each turn otherwise waits for them to fail.
  for (const name of ROBOT_SERVERS) if (servers.has(name)) overrides[name] = { enabled: false };
  const shared = servers.has('codegraph') ? currentCodegraphPool()?.url(cwd) : undefined;
  // Codex cannot turn a stdio server into a URL one, so the shared server joins under its own name.
  if (shared) { overrides.codegraph = { enabled: false }; overrides[SHARED_CODEGRAPH] = { url: shared }; }
  return overrides;
}
