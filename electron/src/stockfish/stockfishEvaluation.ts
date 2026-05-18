import type { AnalysisEvaluation, AnalysisSettings } from 'my-chess-opening-core';

import type { StockfishUciScore } from './stockfishUciTypes';

function clampInteger(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) {
		return min;
	}

	return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function getFenSideToMove(fen: string): 'w' | 'b' {
	const sideToMove = fen.trim().split(/\s+/)[1];

	if (sideToMove !== 'w' && sideToMove !== 'b') {
		throw new Error(`Invalid FEN side to move: ${fen}`);
	}

	return sideToMove;
}

/**
 * Convert a UCI score to the app convention.
 *
 * App convention:
 * - positive score favors White
 * - negative score favors Black
 *
 * Stockfish UCI scores are interpreted from the side-to-move perspective,
 * so Black-to-move positions must be inverted.
 */
export function normalizeUciScoreToWhitePerspective(
	score: StockfishUciScore,
	fen: string,
): AnalysisEvaluation {
	const sideToMove = getFenSideToMove(fen);
	const multiplier = sideToMove === 'w' ? 1 : -1;

	return {
		cp: score.cp === null ? null : score.cp * multiplier,
		mate: score.mate === null ? null : score.mate * multiplier,
	};
}

/**
 * Keep settings within reasonable limits before sending them to Stockfish.
 *
 * This protects the app from invalid settings files and future UI mistakes.
 */
export function normalizeStockfishAnalysisSettings(settings: AnalysisSettings): AnalysisSettings {
	const mode = settings.mode === 'depth' ? 'depth' : 'movetime';

	return {
		version: settings.version,
		mode,
		movetimeMs: clampInteger(settings.movetimeMs, 50, 60_000),
		depth: clampInteger(settings.depth, 1, 40),
		threads: clampInteger(settings.threads, 1, 32),
		hashMb: clampInteger(settings.hashMb, 1, 4096),
		multiPv: clampInteger(settings.multiPv, 1, 10),
	};
}

export function buildStockfishGoCommand(settings: AnalysisSettings): string {
	const normalizedSettings = normalizeStockfishAnalysisSettings(settings);

	if (normalizedSettings.mode === 'depth') {
		return `go depth ${normalizedSettings.depth}`;
	}

	return `go movetime ${normalizedSettings.movetimeMs}`;
}

export function getStockfishEvaluationTimeoutMs(settings: AnalysisSettings): number {
	const normalizedSettings = normalizeStockfishAnalysisSettings(settings);

	if (normalizedSettings.mode === 'movetime') {
		return Math.max(15_000, normalizedSettings.movetimeMs + 10_000);
	}

	return Math.max(30_000, normalizedSettings.depth * 5_000);
}
