import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');

const artifactExtensions = ['.AppImage', '.deb', '.exe'];
const aggregateFileName = 'SHA256SUMS';

async function main() {
	const entries = await readdir(releaseDir, { withFileTypes: true });

	await removePreviousChecksumFiles(entries);

	const artifacts = entries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.filter((fileName) => artifactExtensions.some((extension) => fileName.endsWith(extension)))
		.sort((a, b) => a.localeCompare(b));

	if (artifacts.length === 0) {
		throw new Error('[checksums] No release artifacts found.');
	}

	const checksumLines = [];

	for (const artifact of artifacts) {
		const artifactPath = path.join(releaseDir, artifact);
		const hash = await sha256File(artifactPath);
		const line = `${hash}  ${artifact}`;

		checksumLines.push(line);

		await writeFile(path.join(releaseDir, `${artifact}.sha256`), `${line}\n`, 'utf8');
		console.log(`[checksums] Wrote ${artifact}.sha256`);
	}

	await writeFile(
		path.join(releaseDir, aggregateFileName),
		`${checksumLines.join('\n')}\n`,
		'utf8',
	);
	console.log(`[checksums] Wrote ${aggregateFileName}`);
}

async function removePreviousChecksumFiles(entries) {
	const checksumFiles = entries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.filter((fileName) => fileName.endsWith('.sha256') || fileName === aggregateFileName);

	for (const fileName of checksumFiles) {
		await rm(path.join(releaseDir, fileName), { force: true });
		console.log(`[checksums] Removed stale ${fileName}`);
	}
}

function sha256File(filePath) {
	return new Promise((resolve, reject) => {
		const hash = createHash('sha256');
		const stream = createReadStream(filePath);

		stream.on('data', (chunk) => hash.update(chunk));
		stream.on('error', reject);
		stream.on('end', () => resolve(hash.digest('hex')));
	});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
