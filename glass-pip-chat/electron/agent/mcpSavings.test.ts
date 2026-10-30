import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = vi.fn((cwd?: string) => cwd ? `http://127.0.0.1:1/codegraph/x/${path.basename(cwd)}` : undefined);
vi.mock('./codegraphPool.js', () => ({ currentCodegraphPool: () => ({ url }) }));
const { codexMcpOverrides, configureMcpSavings, hasKicadProject, SHARED_CODEGRAPH } = await import('./mcpSavings');

const dirs: string[] = [];
afterEach(() => { dirs.splice(0).forEach(d => fs.rmSync(d, { recursive: true, force: true })); configureMcpSavings({}); });
function folder(files: string[] = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-mcp-')); dirs.push(dir);
  for (const file of files) { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), ''); }
  return dir;
}
const both = new Set(['codegraph', 'kicad', 'ally_chats']);

describe('per-turn MCP servers', () => {
  it('switches KiCAD off outside KiCad projects and shares CodeGraph under its own name', () => {
    const dir = folder(['notes.md']);
    expect(codexMcpOverrides(dir, both)).toEqual({ kicad: { enabled: false }, codegraph: { enabled: false }, [SHARED_CODEGRAPH]: { url: url(dir) } });
  });

  it('keeps KiCAD in a KiCad project folder, or one level down, or when enabled everywhere', () => {
    expect(hasKicadProject(folder(['board.kicad_pro']))).toBe(true);
    expect(hasKicadProject(folder(['pcb/board.kicad_pro']))).toBe(true);
    expect(hasKicadProject(folder(['node_modules/x/board.kicad_pro']))).toBe(false);
    expect(codexMcpOverrides(folder(['board.kicad_pro']), both)).not.toHaveProperty('kicad');
    configureMcpSavings({ kicadEverywhere: true });
    expect(codexMcpOverrides(folder(), both)).not.toHaveProperty('kicad');
  });

  it('starts mcp-unreal only in an Unreal project folder and never the robot servers outside robot mode', () => {
    const all = new Set(['mcp-unreal', 'howyouseeme', 'droidcore']);
    expect(codexMcpOverrides(folder(['lecture.pdf']), all)).toEqual({ 'mcp-unreal': { enabled: false }, howyouseeme: { enabled: false }, droidcore: { enabled: false } });
    expect(codexMcpOverrides(folder(['UE5Project/OrbitSim.uproject']), all)).not.toHaveProperty('mcp-unreal');
  });

  it('only switches off servers the user configured', () => {
    expect(codexMcpOverrides(folder(), new Set(['ally_chats']))).toEqual({});
  });
});
