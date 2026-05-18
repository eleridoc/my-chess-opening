import * as fs from 'node:fs';
import * as path from 'node:path';

import { getEnginesDir } from '../system/paths';

export const STOCKFISH_ENGINE_NAME = 'Stockfish';
export const STOCKFISH_ENV_EXECUTABLE_PATH = 'MCO_STOCKFISH_EXECUTABLE_PATH';

export type StockfishBinaryPlatform = 'linux-x64' | 'win-x64';

export type StockfishExecutableSource = 'environment' | 'bundled';

export interface StockfishExecutableResolution {
	available: boolean;
	supported: boolean;
	source: StockfishExecutableSource | null;
	platformKey: StockfishBinaryPlatform | null;
	executablePath: string | null;
	expectedExecutablePath: string | null;
	reason: string | null;
}

/**
 * Resolve the Stockfish platform key supported by the current build.
 *
 * V1.15 targets the platforms currently packaged by the app:
 * - Linux x64
 * - Windows x64
 */
export function getStockfishBinaryPlatform(
	platform: NodeJS.Platform = process.platform,
	arch: NodeJS.Architecture = process.arch,
): StockfishBinaryPlatform | null {
	if (platform === 'linux' && arch === 'x64') {
		return 'linux-x64';
	}

	if (platform === 'win32' && arch === 'x64') {
		return 'win-x64';
	}

	return null;
}

function getStockfishExecutableFileName(platformKey: StockfishBinaryPlatform): string {
	return platformKey === 'win-x64' ? 'stockfish.exe' : 'stockfish';
}

export function getBundledStockfishExecutablePath(
	platformKey: StockfishBinaryPlatform | null = getStockfishBinaryPlatform(),
): string | null {
	if (!platformKey) {
		return null;
	}

	return path.join(
		getEnginesDir(),
		'stockfish',
		platformKey,
		getStockfishExecutableFileName(platformKey),
	);
}

function getEnvironmentStockfishExecutablePath(): string | null {
	const rawPath = process.env[STOCKFISH_ENV_EXECUTABLE_PATH]?.trim();

	if (!rawPath) {
		return null;
	}

	return path.resolve(rawPath);
}

function isFile(pathToCheck: string): boolean {
	try {
		return fs.statSync(pathToCheck).isFile();
	} catch {
		return false;
	}
}

function canExecute(pathToCheck: string): boolean {
	if (!isFile(pathToCheck)) {
		return false;
	}

	// Windows does not use POSIX executable bits in the same way.
	if (process.platform === 'win32') {
		return true;
	}

	try {
		fs.accessSync(pathToCheck, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * Resolve the Stockfish executable path.
 *
 * Resolution order:
 * 1. MCO_STOCKFISH_EXECUTABLE_PATH environment override
 * 2. Bundled binary from electron/assets/engines in dev
 * 3. Bundled binary from resources/assets/engines in packaged app
 */
export function resolveStockfishExecutable(): StockfishExecutableResolution {
	const environmentPath = getEnvironmentStockfishExecutablePath();

	if (environmentPath) {
		const available = canExecute(environmentPath);

		return {
			available,
			supported: true,
			source: 'environment',
			platformKey: null,
			executablePath: available ? environmentPath : null,
			expectedExecutablePath: environmentPath,
			reason: available
				? null
				: `Stockfish executable override is not available or not executable: ${environmentPath}`,
		};
	}

	const platformKey = getStockfishBinaryPlatform();

	if (!platformKey) {
		return {
			available: false,
			supported: false,
			source: null,
			platformKey: null,
			executablePath: null,
			expectedExecutablePath: null,
			reason: `Unsupported Stockfish platform: ${process.platform}-${process.arch}`,
		};
	}

	const bundledPath = getBundledStockfishExecutablePath(platformKey);

	if (!bundledPath) {
		return {
			available: false,
			supported: false,
			source: 'bundled',
			platformKey,
			executablePath: null,
			expectedExecutablePath: null,
			reason: `Unable to resolve bundled Stockfish path for platform: ${platformKey}`,
		};
	}

	const available = canExecute(bundledPath);

	return {
		available,
		supported: true,
		source: 'bundled',
		platformKey,
		executablePath: available ? bundledPath : null,
		expectedExecutablePath: bundledPath,
		reason: available
			? null
			: `Bundled Stockfish executable is missing or not executable: ${bundledPath}`,
	};
}
