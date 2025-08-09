import { execSync } from 'child_process';
import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

console.log('Building Electron files...');

// Ensure dist directory exists
mkdirSync(join(rootDir, 'dist', 'electron'), { recursive: true });

// Compile TypeScript files
execSync('tsc electron/main.ts electron/preload.ts --outDir dist/electron --module esnext --target es2022 --moduleResolution node --esModuleInterop true', {
  cwd: rootDir,
  stdio: 'inherit'
});

console.log('Electron build completed!');