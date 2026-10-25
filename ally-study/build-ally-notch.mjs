import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
// Each build has its own assets; a running WebView keeps its complete old bundle.
const assetDirectory = path.join('notch-builds', crypto.randomUUID());
const output = path.join(root, assetDirectory);
const ally = fileURLToPath(new URL('../glass-pip-chat/', import.meta.url));
const require = createRequire(path.join(ally, 'package.json'));
const {build} = await import(pathToFileURL(path.join(path.dirname(require.resolve('vite')), 'dist/node/index.js')).href);
const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default;
const tailwind = (await import(pathToFileURL(require.resolve('@tailwindcss/postcss')).href)).default;
// Reuse Ally's source and dependencies directly; no copies of its components.
const dependencies = path.join(root, 'notch-ui', 'node_modules');
if (!fs.existsSync(dependencies)) fs.symlinkSync(path.join(ally,'node_modules'), dependencies, 'junction');
await build({
  configFile:false, root:path.join(root,'notch-ui'), base:'/notch/', logLevel:'warn',
  plugins:[react()], resolve:{alias:{'@':path.join(ally,'src')},dedupe:['react','react-dom']},
  define:{global:'globalThis'},
  css:{postcss:{plugins:[tailwind({base:ally})]}},
  build:{outDir:output,emptyOutDir:true, sourcemap:false,reportCompressedSize:false},
});
const hash = crypto.createHash('sha256');
function walk(dir) {for (const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
  const file=path.join(dir,entry.name); if(entry.isDirectory()) walk(file); else hash.update(path.relative(root,file)).update(fs.readFileSync(file));
}}
walk(output);
fs.writeFileSync(path.join(root,'notch-build.json.staged'),JSON.stringify({version:1,assetDirectory,sha256:hash.digest('hex'),allySource:ally},null,2)+'\n');
fs.renameSync(path.join(root,'notch-build.json.staged'),path.join(root,'notch-build.json'));
