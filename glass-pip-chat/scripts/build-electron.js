import { execSync } from 'child_process';
import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

console.log('Building Electron files...');

// Ensure dist directory exists
mkdirSync(join(rootDir, 'dist', 'electron'), { recursive: true });

// Compile main process (ESNext modules)
execSync('tsc electron/main.ts --outDir dist/electron --module esnext --target es2022 --moduleResolution node --esModuleInterop true', {
  cwd: rootDir,
  stdio: 'inherit'
});

// Compile preload script (CommonJS for Electron compatibility)
execSync('tsc electron/preload.ts --outDir dist/electron --module commonjs --target es2022 --moduleResolution node --esModuleInterop true', {
  cwd: rootDir,
  stdio: 'inherit'
});

console.log('Electron build completed!');