import type { AnalysisSettings, GameAnalysisDetails } from 'my-chess-opening-core';

import {
	StockfishUciClient,
	getStockfishEngineStatus,
	type StockfishFenEvaluation,
} from '../stockfish';

import { loadAnalysisSettings, serializeAnalysisSettingsSnapshot } from './analysisSettings';

import { GameAnalysisServiceError, toGameAnalysisServiceError } from './analysisErrors';

import {
	createGameMoveAnalysisAndUpdateProgress,
	createRunningGameAnalysis,
	findLatestCompatibleCompletedGameAnalysis,
	loadGameAnalysisById,
	loadGameForAnalysis,
	loadLatestGameAnalysisByGameId,
	markGameAnalysisCancelled,
	markGameAnalysisCompleted,
	markGameAnalysisFailed,
	type GameForAnalysis,
	type GameMoveForAnalysis,
} from './gameAnalysisRepository';

import { mapGameAnalysisToDetails, type GameAnalysisRecordForMapping } from './gameAnalysisMapper';

interface RunningGameAnalysisContext {
	analysisId: string;
	client: StockfishUciClient;
	cancelRequested: boolean;
}

let runningGameAnalysis: RunningGameAnalysisContext | null = null;

/**
 * Analyze one imported database game with Stockfish.
 *
 * V1.15 scope:
 * - one analysis at a time
 * - one database game at a time
 * - fixed local settings snapshot
 * - no batch queue yet
 */
export async function analyzeGameById(
	gameId: string,
	options: { force?: boolean } = {},
): Promise<GameAnalysisDetails> {
	const normalizedGameId = normalizeRequiredId(gameId, 'gameId');

	if (runningGameAnalysis) {
		throw new GameAnalysisServiceError(
			'ANALYSIS_ALREADY_RUNNING',
			'Another game analysis is already running.',
		);
	}

	const settings = loadAnalysisSettings();
	const configSnapshotJson = serializeAnalysisSettingsSnapshot(settings);

	if (!options.force) {
		const reusableAnalysis = await findLatestCompatibleCompletedGameAnalysis(
			normalizedGameId,
			configSnapshotJson,
		);

		if (reusableAnalysis) {
			return mapGameAnalysisToDetails(reusableAnalysis);
		}
	}

	const engineStatus = getStockfishEngineStatus();

	if (!engineStatus.available) {
		throw new GameAnalysisServiceError('ENGINE_NOT_AVAILABLE', engineStatus.message);
	}

	const game = await loadGameForAnalysis(normalizedGameId);

	if (!game) {
		throw new GameAnalysisServiceError('GAME_NOT_FOUND', `Game not found: ${normalizedGameId}`);
	}

	validateGameMovesForAnalysis(game);

	const client = new StockfishUciClient();

	let createdAnalysis: GameAnalysisRecordForMapping | null = null;

	try {
		await client.initialize();
		await client.newGame();

		const engineName = client.getDetectedEngineName();
		const engineVersion = client.getDetectedEngineVersion();

		createdAnalysis = await createRunningGameAnalysis({
			gameId: game.id,
			engineName,
			engineVersion,
			settings,
			configSnapshotJson,
			totalPlies: game.moves.length,
		});

		runningGameAnalysis = {
			analysisId: createdAnalysis.id,
			client,
			cancelRequested: false,
		};

		await analyzeGameMoves({
			game,
			analysisId: createdAnalysis.id,
			settings,
			client,
		});

		throwIfCancellationRequested();

		await markGameAnalysisCompleted(createdAnalysis.id);

		const completedAnalysis = await loadGameAnalysisById(createdAnalysis.id);

		if (!completedAnalysis) {
			throw new GameAnalysisServiceError(
				'DATABASE_ERROR',
				`Completed analysis could not be loaded: ${createdAnalysis.id}`,
			);
		}

		return mapGameAnalysisToDetails(completedAnalysis);
	} catch (error) {
		const mappedError = mapRunningAnalysisError(error);

		if (createdAnalysis) {
			if (mappedError.code === 'ANALYSIS_CANCELLED') {
				await markGameAnalysisCancelled(createdAnalysis.id);
			} else {
				await markGameAnalysisFailed(createdAnalysis.id, mappedError.message);
			}
		}

		throw mappedError;
	} finally {
		client.dispose();

		if (runningGameAnalysis?.client === client) {
			runningGameAnalysis = null;
		}
	}
}

/**
 * Load the latest persisted analysis for one game.
 */
export async function getLatestGameAnalysisByGameId(
	gameId: string,
): Promise<GameAnalysisDetails | null> {
	const normalizedGameId = normalizeRequiredId(gameId, 'gameId');
	const analysis = await loadLatestGameAnalysisByGameId(normalizedGameId);

	return analysis ? mapGameAnalysisToDetails(analysis) : null;
}

/**
 * Cancel the currently running game analysis.
 *
 * This is already implemented for the future IPC endpoint, even if the UI is
 * not wired yet in V1.15.6.
 */
export async function cancelCurrentGameAnalysis(): Promise<boolean> {
	const running = runningGameAnalysis;

	if (!running) {
		return false;
	}

	running.cancelRequested = true;

	try {
		await running.client.stop();
	} finally {
		running.client.dispose();
		await markGameAnalysisCancelled(running.analysisId);
		runningGameAnalysis = null;
	}

	return true;
}

async function analyzeGameMoves(input: {
	game: GameForAnalysis;
	analysisId: string;
	settings: AnalysisSettings;
	client: StockfishUciClient;
}): Promise<void> {
	if (input.game.moves.length === 0) {
		return;
	}

	const firstMove = input.game.moves[0];
	const firstFenBefore = normalizeRequiredFen(firstMove.fenBefore, firstMove.ply, 'fenBefore');

	let evaluationBefore = await input.client.evaluateFen({
		fen: firstFenBefore,
		settings: input.settings,
	});

	for (const move of input.game.moves) {
		throwIfCancellationRequested();

		const fenBefore = normalizeRequiredFen(move.fenBefore, move.ply, 'fenBefore');
		const fenAfter = normalizeRequiredFen(move.fen, move.ply, 'fenAfter');

		// The previous after-evaluation should normally match the current before
		// position. If FEN data is inconsistent, evaluate the explicit before FEN.
		if (evaluationBefore.fen !== fenBefore) {
			evaluationBefore = await input.client.evaluateFen({
				fen: fenBefore,
				settings: input.settings,
			});
		}

		const evaluationAfter = await input.client.evaluateFen({
			fen: fenAfter,
			settings: input.settings,
		});

		await createGameMoveAnalysisAndUpdateProgress({
			gameAnalysisId: input.analysisId,
			gameId: input.game.id,
			ply: move.ply,
			moveNumber: getMoveNumberFromPly(move.ply),
			playedBy: getPlayedByFromPly(move.ply),
			fenBefore,
			fenAfter,
			positionHashBefore: move.positionHashBefore || null,
			positionHashAfter: move.positionHash || null,
			moveSan: move.san,
			moveUci: move.uci,
			bestMoveUci: evaluationBefore.bestMoveUci,
			evalBeforeCp: evaluationBefore.evaluation?.cp ?? null,
			evalBeforeMate: evaluationBefore.evaluation?.mate ?? null,
			evalAfterCp: evaluationAfter.evaluation?.cp ?? null,
			evalAfterMate: evaluationAfter.evaluation?.mate ?? null,
			depthReached: evaluationBefore.depthReached,
			timeMs: evaluationBefore.timeMs,
			principalVariationUci: evaluationBefore.principalVariationUci,
		});

		evaluationBefore = evaluationAfter;
	}
}

function validateGameMovesForAnalysis(game: GameForAnalysis): void {
	for (const move of game.moves) {
		normalizeRequiredFen(move.fenBefore, move.ply, 'fenBefore');
		normalizeRequiredFen(move.fen, move.ply, 'fenAfter');
	}
}

function normalizeRequiredId(value: unknown, label: string): string {
	if (typeof value !== 'string') {
		throw new GameAnalysisServiceError('INVALID_INPUT', `${label} must be a string.`);
	}

	const normalized = value.trim();

	if (normalized.length === 0) {
		throw new GameAnalysisServiceError('INVALID_INPUT', `${label} is required.`);
	}

	return normalized;
}

function normalizeRequiredFen(value: string | null, ply: number, fieldName: string): string {
	if (typeof value !== 'string') {
		throw new GameAnalysisServiceError('INVALID_INPUT', `Move ${ply} is missing ${fieldName}.`);
	}

	const normalized = value.trim();

	if (normalized.length === 0) {
		throw new GameAnalysisServiceError(
			'INVALID_INPUT',
			`Move ${ply} has an empty ${fieldName}.`,
		);
	}

	return normalized;
}

function getMoveNumberFromPly(ply: number): number {
	return Math.floor((ply + 1) / 2);
}

function getPlayedByFromPly(ply: number): 'WHITE' | 'BLACK' {
	return ply % 2 === 1 ? 'WHITE' : 'BLACK';
}

function throwIfCancellationRequested(): void {
	if (!runningGameAnalysis?.cancelRequested) {
		return;
	}

	throw new GameAnalysisServiceError('ANALYSIS_CANCELLED', 'Analysis was cancelled.');
}

function mapRunningAnalysisError(error: unknown): GameAnalysisServiceError {
	const mappedError = toGameAnalysisServiceError(error);

	if (runningGameAnalysis?.cancelRequested) {
		return new GameAnalysisServiceError('ANALYSIS_CANCELLED', 'Analysis was cancelled.', error);
	}

	if (mappedError.code === 'UNEXPECTED_ERROR') {
		return new GameAnalysisServiceError('ENGINE_ERROR', mappedError.message, error);
	}

	return mappedError;
}
