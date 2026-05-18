import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..');

const TARGETS = {
	'linux-x64': {
		url: 'https://github.com/official-stockfish/Stockfish/releases/latest/download/stockfish-ubuntu-x86-64.tar',
		archiveName: 'stockfish-linux-x64.tar',
		outputDir: join(PROJECT_ROOT, 'electron/assets/engines/stockfish/linux-x64'),
		outputFileName: 'stockfish',
		archiveType: 'tar',
	},
	'win-x64': {
		url: 'https://github.com/official-stockfish/Stockfish/releases/latest/download/stockfish-windows-x86-64.zip',
		archiveName: 'stockfish-win-x64.zip',
		outputDir: join(PROJECT_ROOT, 'electron/assets/engines/stockfish/win-x64'),
		outputFileName: 'stockfish.exe',
		archiveType: 'zip',
	},
};

const DOCUMENTATION_FILES = new Set([
	'AUTHORS',
	'CITATION.cff',
	'CONTRIBUTING.md',
	'Copying.txt',
	'README.md',
	'Top CPU Contributors.txt',
]);

function getCurrentTargetKey() {
	if (process.platform === 'linux' && process.arch === 'x64') {
		return 'linux-x64';
	}

	if (process.platform === 'win32' && process.arch === 'x64') {
		return 'win-x64';
	}

	throw new Error(`Unsupported Stockfish install platform: ${process.platform}-${process.arch}`);
}

function parseTargetKeys() {
	const targetArg = process.argv.find((arg) => arg.startsWith('--target='));

	if (process.argv.includes('--all')) {
		return Object.keys(TARGETS);
	}

	if (targetArg) {
		const targetKey = targetArg.slice('--target='.length);

		if (!TARGETS[targetKey]) {
			throw new Error(`Unknown Stockfish target: ${targetKey}`);
		}

		return [targetKey];
	}

	return [getCurrentTargetKey()];
}

async function downloadFile(url, outputPath) {
	console.info(`[stockfish] Downloading ${url}`);

	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	await writeFile(outputPath, Buffer.from(arrayBuffer));
}

function runCommand(command, args) {
	const result = spawnSync(command, args, {
		stdio: 'inherit',
		shell: process.platform === 'win32',
	});

	if (result.status !== 0) {
		throw new Error(`Command failed: ${command} ${args.join(' ')}`);
	}
}

function extractArchive(target, archivePath, extractDir) {
	console.info(`[stockfish] Extracting ${basename(archivePath)}`);

	if (target.archiveType === 'tar') {
		runCommand('tar', ['-xf', archivePath, '-C', extractDir]);
		return;
	}

	if (target.archiveType === 'zip') {
		if (process.platform === 'win32') {
			runCommand('powershell', [
				'-NoProfile',
				'-ExecutionPolicy',
				'Bypass',
				'-Command',
				`Expand-Archive -LiteralPath "${archivePath}" -DestinationPath "${extractDir}" -Force`,
			]);
			return;
		}

		runCommand('unzip', ['-q', archivePath, '-d', extractDir]);
		return;
	}

	throw new Error(`Unsupported archive type: ${target.archiveType}`);
}

function walkFiles(dir) {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);

		if (entry.isDirectory()) {
			files.push(...walkFiles(fullPath));
			continue;
		}

		if (entry.isFile()) {
			files.push(fullPath);
		}
	}

	return files;
}

function findStockfishExecutable(extractDir, outputFileName) {
	const files = walkFiles(extractDir);
	const lowerOutputFileName = outputFileName.toLowerCase();

	const exactMatch = files.find(
		(filePath) => basename(filePath).toLowerCase() === lowerOutputFileName,
	);

	if (exactMatch) {
		return exactMatch;
	}

	const candidates = files.filter((filePath) => {
		const fileName = basename(filePath).toLowerCase();

		if (!fileName.startsWith('stockfish')) {
			return false;
		}

		if (lowerOutputFileName.endsWith('.exe')) {
			return fileName.endsWith('.exe');
		}

		return (
			!fileName.endsWith('.txt') && !fileName.endsWith('.md') && !fileName.endsWith('.cff')
		);
	});

	if (candidates.length === 0) {
		throw new Error(`Unable to find Stockfish executable in extracted archive: ${extractDir}`);
	}

	candidates.sort((a, b) => statSync(b).size - statSync(a).size);

	return candidates[0];
}

function copyDocumentationFiles(extractDir, outputDir) {
	const files = walkFiles(extractDir);

	for (const filePath of files) {
		const fileName = basename(filePath);

		if (!DOCUMENTATION_FILES.has(fileName)) {
			continue;
		}

		copyFileSync(filePath, join(outputDir, fileName));
	}
}

async function installTarget(targetKey) {
	const target = TARGETS[targetKey];

	if (!target) {
		throw new Error(`Unknown Stockfish target: ${targetKey}`);
	}

	const tempDir = await mkdtemp(join(tmpdir(), `mco-stockfish-${targetKey}-`));
	const archivePath = join(tempDir, target.archiveName);
	const extractDir = join(tempDir, 'extract');

	try {
		mkdirSync(extractDir, { recursive: true });
		mkdirSync(target.outputDir, { recursive: true });

		await downloadFile(target.url, archivePath);
		extractArchive(target, archivePath, extractDir);

		const executablePath = findStockfishExecutable(extractDir, target.outputFileName);
		const outputPath = join(target.outputDir, target.outputFileName);

		copyFileSync(executablePath, outputPath);

		if (!target.outputFileName.endsWith('.exe')) {
			await chmod(outputPath, 0o755);
		}

		copyDocumentationFiles(extractDir, target.outputDir);

		console.info(`[stockfish] Installed ${targetKey} engine at ${outputPath}`);
	} finally {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	}
}

async function main() {
	const targetKeys = parseTargetKeys();

	for (const targetKey of targetKeys) {
		await installTarget(targetKey);
	}
}

main().catch((error) => {
	console.error('[stockfish] Install failed.');
	console.error(error);
	process.exit(1);
});
