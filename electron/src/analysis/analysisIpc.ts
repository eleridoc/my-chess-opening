import { ipcMain } from 'electron';

import type {
	AnalysisError,
	AnalyzeGameInput,
	AnalyzeGameResult,
	GetGameAnalysisInput,
	GetGameAnalysisResult,
	CancelCurrentAnalysisResult,
} from 'my-chess-opening-core';

import { getStockfishEngineStatus } from '../stockfish';
import { loadAnalysisSettings } from './analysisSettings';
import {
	analyzeGameById,
	cancelCurrentGameAnalysis,
	getLatestGameAnalysisByGameId,
} from './gameAnalysisService';
import { GameAnalysisServiceError } from './analysisErrors';

/**
 * Register IPC handlers for Stockfish game analysis.
 *
 * V1.15.7 scope:
 * - expose engine status
 * - expose active analysis settings
 * - expose single-game analysis
 * - expose latest analysis lookup
 * - expose cancellation
 *
 * The renderer is not trusted, so every input is normalized here before it
 * reaches the analysis service.
 */
export function registerAnalysisIpc(): void {
	ipcMain.handle('analysis:getEngineStatus', async () => {
		return getStockfishEngineStatus();
	});

	ipcMain.handle('analysis:getSettings', async () => {
		return loadAnalysisSettings();
	});

	ipcMain.handle(
		'analysis:analyzeGame',
		async (_event, input?: AnalyzeGameInput): Promise<AnalyzeGameResult> => {
			try {
				const normalizedInput = normalizeAnalyzeGameInput(input);
				const analysis = await analyzeGameById(normalizedInput.gameId, {
					force: normalizedInput.force,
				});

				return {
					ok: true,
					analysis,
				};
			} catch (error) {
				return {
					ok: false,
					error: mapAnalysisIpcError(error),
				};
			}
		},
	);

	ipcMain.handle(
		'analysis:getLatestGameAnalysis',
		async (_event, input?: GetGameAnalysisInput): Promise<GetGameAnalysisResult> => {
			try {
				const normalizedInput = normalizeGetGameAnalysisInput(input);
				const analysis = await getLatestGameAnalysisByGameId(normalizedInput.gameId);

				return {
					ok: true,
					analysis,
				};
			} catch (error) {
				return {
					ok: false,
					error: mapAnalysisIpcError(error),
				};
			}
		},
	);

	ipcMain.handle(
		'analysis:cancelCurrentAnalysis',
		async (): Promise<CancelCurrentAnalysisResult> => {
			try {
				const cancelled = await cancelCurrentGameAnalysis();

				return {
					ok: true,
					cancelled,
				};
			} catch (error) {
				return {
					ok: false,
					error: mapAnalysisIpcError(error),
				};
			}
		},
	);
}

function normalizeAnalyzeGameInput(input: AnalyzeGameInput | undefined): AnalyzeGameInput {
	if (!input) {
		throw new GameAnalysisServiceError('INVALID_INPUT', 'Analysis input is required.');
	}

	return {
		gameId: normalizeRequiredText(input.gameId, 'gameId'),
		force: input.force === true,
	};
}

function normalizeGetGameAnalysisInput(
	input: GetGameAnalysisInput | undefined,
): GetGameAnalysisInput {
	if (!input) {
		throw new GameAnalysisServiceError('INVALID_INPUT', 'Analysis input is required.');
	}

	return {
		gameId: normalizeRequiredText(input.gameId, 'gameId'),
	};
}

function normalizeRequiredText(value: unknown, label: string): string {
	if (typeof value !== 'string') {
		throw new GameAnalysisServiceError('INVALID_INPUT', `${label} must be a string.`);
	}

	const normalized = value.trim();

	if (normalized.length === 0) {
		throw new GameAnalysisServiceError('INVALID_INPUT', `${label} is required.`);
	}

	return normalized;
}

function mapAnalysisIpcError(error: unknown): AnalysisError {
	if (error instanceof GameAnalysisServiceError) {
		return {
			code: error.code,
			message: error.message,
		};
	}

	if (error instanceof Error) {
		return {
			code: 'UNEXPECTED_ERROR',
			message: error.message,
		};
	}

	return {
		code: 'UNEXPECTED_ERROR',
		message: String(error),
	};
}
