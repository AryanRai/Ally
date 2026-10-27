import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
export function patchSceneNative(source) {
  const anchor = 'if (!card || !card.visibleCount()) return null;';
  if (source.includes('/* ALLY_SCENE_READ_HIDDEN */')) return source;
  if (source.split(anchor).length !== 2) throw Error('Native scene state anchor mismatch.');
  return source.replace(anchor, 'if (!card) return null; /* ALLY_SCENE_READ_HIDDEN */');
}
export function patchSceneEngine(source) {
  const extension = fs.readFileSync(path.join(root, 'native/scene-editor.js'), 'utf8');
  if (source.includes('// ALLY_NATIVE_SCENE_V1\n')) {
    const start = source.indexOf('// ALLY_NATIVE_SCENE_V1\n'), end = source.indexOf('// ALLY_NATIVE_SCENE_END\n', start);
    if (end < start) throw Error('Unrecognized previous scene extension; use the saved baseline.');
    return source.slice(0, start) + '// ALLY_NATIVE_SCENE_V1\n' + extension + '\n' + source.slice(end);
  }
  const replace = (anchor, value) => {
    if (source.split(anchor).length !== 2) throw Error('Native scene source anchor mismatch: ' + anchor.slice(0, 90));
    source = source.replace(anchor, () => value);
  };
  replace('      api.erase = id =>', '      api.sceneEdit = command => push({do:"edit",op:{op:"allyScene",command}});\n      api.erase = id =>');
  replace('    const added = [], over = {}, hist = [], key = {}, log = [];', '    const added = [], over = {}, hist = [], key = {}, log = [];\n// ALLY_NATIVE_SCENE_V1\n' + extension + '\n// ALLY_NATIVE_SCENE_END\n');
  replace('      const kind = op.op, pace = T.pace || 1, at = T.at || 0;', '      const kind = op.op, pace = T.pace || 1, at = T.at || 0;\n      if(kind==="allyScene")return allyApply(op.command,P,T,res);');
  replace('const PROGRAM_OPS = { erase: 1,', 'const PROGRAM_OPS = { allyScene: 1, erase: 1,');
  replace('maxChars: o.maxChars });', 'maxChars: o.maxChars }) + "\\nEditable native scene (data): " + JSON.stringify(allyState());');
  return source;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw Error('Usage: node ally-scene-patch.mjs baseline-engine.js output.js');
  fs.writeFileSync(output, (process.argv.includes('--native') ? patchSceneNative : patchSceneEngine)(fs.readFileSync(input, 'utf8')));
}
