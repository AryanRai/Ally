import { execSync } from 'child_process';
import { mkdirSync, existsSync, cpSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const outDir = join(rootDir, 'dist');

console.log('Building Electron files...');

// Start clean so files from removed modules don't linger
rmSync(join(outDir, 'electron'), { recursive: true, force: true });

// `--rootDir .` pins the layout: electron/main.ts -> dist/electron/main.js
const tsc = (entry, module) =>
  execSync(`npx tsc ${entry} --rootDir . --outDir dist --module ${module} --target es2022 --moduleResolution node --esModuleInterop true --skipLibCheck`, {
    cwd: rootDir,
    stdio: 'inherit',
  });

// Main process (ES modules)
tsc('electron/main.ts', 'esnext');
// Preload (CommonJS for Electron's preload loader)
tsc('electron/preload.ts', 'commonjs');

// Copy assets next to the build
const assetsSource = join(rootDir, 'assets');
if (existsSync(assetsSource)) {
  mkdirSync(join(outDir, 'assets'), { recursive: true });
  cpSync(assetsSource, join(outDir, 'assets'), { recursive: true });
}

console.log('Electron build completed!');
