import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const pathsToClean = ['core/dist', 'electron/dist', 'ui/angular/dist', 'release'];

for (const relativePath of pathsToClean) {
	const absolutePath = path.join(rootDir, relativePath);

	await rm(absolutePath, { recursive: true, force: true });
	console.log(`[clean:dist] Removed ${relativePath}`);
}
