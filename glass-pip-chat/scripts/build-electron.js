import { execSync } from 'child_process';
import { copyFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

console.log('Building Electron files...');

// Ensure dist directory exists
mkdirSync(join(rootDir, 'dist', 'electron'), { recursive: true });

// Compile main process (ESNext modules)
execSync('npx tsc electron/main.ts --outDir dist --module esnext --target es2022 --moduleResolution node --esModuleInterop true', {
  cwd: rootDir,
  stdio: 'inherit'
});

// Compile preload script (CommonJS for Electron compatibility)  
execSync('npx tsc electron/preload.ts --outDir dist --module commonjs --target es2022 --moduleResolution node --esModuleInterop true', {
  cwd: rootDir,
  stdio: 'inherit'
});

// Move preload.js to the correct location (in the same directory as main.js)
const preloadSource = join(rootDir, 'dist', 'preload.js');
const preloadDest = join(rootDir, 'dist', 'electron', 'preload.js');

if (existsSync(preloadSource)) {
  renameSync(preloadSource, preloadDest);
}

console.log('Electron build completed!');