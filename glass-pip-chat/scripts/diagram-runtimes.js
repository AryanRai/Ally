import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/** Trusted libraries are bundled into the opaque frame, never fetched by it. */
export function diagramRuntimes() {
  let source;
  return {
    name: 'ally-diagram-runtimes',
    resolveId(id) { if (id === 'virtual:ally-diagram-runtimes') return '\0' + id; },
    load(id) {
      if (id !== '\0virtual:ally-diagram-runtimes') return;
      if (!source) {
        const require = createRequire(import.meta.url);
        const three = buildSync({ stdin: { contents: "import * as THREE from 'three'; import {OrbitControls} from 'three/addons/controls/OrbitControls.js'; window.THREE=THREE; window.OrbitControls=OrbitControls;", resolveDir: path.dirname(require.resolve('three')) }, bundle: true, write: false, format: 'iife', platform: 'browser', minify: true }).outputFiles[0].text;
        const mermaid = readFileSync(path.join(path.dirname(require.resolve('mermaid')), 'mermaid.min.js'), 'utf8');
        source = `export const three=${JSON.stringify(three)};export const mermaid=${JSON.stringify(mermaid)};`;
      }
      return source;
    },
  };
}
