import type { AnalysisEngineStatus } from 'my-chess-opening-core';

import { resolveStockfishExecutable, STOCKFISH_ENGINE_NAME } from './stockfishEnginePaths';

/**
 * Build a UI-ready Stockfish status object.
 *
 * Engine version detection is intentionally left to the UCI layer.
 * It will be added when the engine process can answer the `uci` command.
 */
export function getStockfishEngineStatus(): AnalysisEngineStatus {
	const resolution = resolveStockfishExecutable();

	if (!resolution.available) {
		return {
			available: false,
			engineName: STOCKFISH_ENGINE_NAME,
			engineVersion: null,
			executablePath: null,
			platform: process.platform,
			message: resolution.reason ?? 'Stockfish engine is not available.',
		};
	}

	return {
		available: true,
		engineName: STOCKFISH_ENGINE_NAME,
		engineVersion: null,
		executablePath: resolution.executablePath,
		platform: process.platform,
		message:
			resolution.source === 'environment'
				? 'Stockfish engine is available from environment override.'
				: 'Bundled Stockfish engine is available.',
	};
}
