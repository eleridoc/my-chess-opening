import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const runtimeDir = path.join(rootDir, '.runtime');

await rm(runtimeDir, { recursive: true, force: true });

console.log('[clean:runtime] Removed .runtime');
