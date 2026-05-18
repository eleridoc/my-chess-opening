import type {
	AnalysisEvaluation,
	AnalysisSettings,
	GameAnalysisDetails,
	GameAnalysisStatus,
} from 'my-chess-opening-core';

import type {
	AnalysisMode as PrismaAnalysisMode,
	AnalysisStatus as PrismaAnalysisStatus,
	PlayerColor as PrismaPlayerColor,
} from '@prisma/client';

export interface GameAnalysisRecordForMapping {
	id: string;
	gameId: string;
	status: PrismaAnalysisStatus;
	engineName: string;
	engineVersion: string | null;
	analysisMode: PrismaAnalysisMode;
	depth: number | null;
	movetimeMs: number | null;
	threads: number;
	hashMb: number;
	multiPv: number;
	totalPlies: number;
	analyzedPlies: number;
	startedAt: Date | null;
	completedAt: Date | null;
	failedAt: Date | null;
	errorMessage: string | null;
	createdAt: Date;
	updatedAt: Date;
	moves: GameMoveAnalysisRecordForMapping[];
}

export interface GameMoveAnalysisRecordForMapping {
	id: string;
	gameAnalysisId: string;
	gameId: string;
	ply: number;
	moveNumber: number;
	playedBy: PrismaPlayerColor;
	fenBefore: string;
	fenAfter: string;
	moveSan: string;
	moveUci: string | null;
	bestMoveUci: string | null;
	evalBeforeCp: number | null;
	evalBeforeMate: number | null;
	evalAfterCp: number | null;
	evalAfterMate: number | null;
	depthReached: number | null;
	timeMs: number | null;
	principalVariationUciJson: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export function mapGameAnalysisToDetails(
	analysis: GameAnalysisRecordForMapping,
): GameAnalysisDetails {
	return {
		summary: {
			id: analysis.id,
			gameId: analysis.gameId,
			status: mapPrismaAnalysisStatus(analysis.status),
			engineName: analysis.engineName,
			engineVersion: analysis.engineVersion,
			settings: mapAnalysisSettings(analysis),
			totalPlies: analysis.totalPlies,
			analyzedPlies: analysis.analyzedPlies,
			startedAtIso: toIsoOrNull(analysis.startedAt),
			completedAtIso: toIsoOrNull(analysis.completedAt),
			failedAtIso: toIsoOrNull(analysis.failedAt),
			errorMessage: analysis.errorMessage,
			createdAtIso: analysis.createdAt.toISOString(),
			updatedAtIso: analysis.updatedAt.toISOString(),
		},
		moves: analysis.moves
			.slice()
			.sort((a, b) => a.ply - b.ply)
			.map((move) => ({
				id: move.id,
				gameId: move.gameId,
				gameAnalysisId: move.gameAnalysisId,
				ply: move.ply,
				moveNumber: move.moveNumber,
				playedBy: move.playedBy === 'WHITE' ? 'white' : 'black',
				fenBefore: move.fenBefore,
				fenAfter: move.fenAfter,
				moveSan: move.moveSan,
				moveUci: move.moveUci ?? '',
				bestMoveUci: move.bestMoveUci,
				evalBefore: buildEvaluation(move.evalBeforeCp, move.evalBeforeMate),
				evalAfter: buildEvaluation(move.evalAfterCp, move.evalAfterMate),
				depthReached: move.depthReached,
				principalVariationUci: parsePrincipalVariation(move.principalVariationUciJson),
				timeMs: move.timeMs,
				createdAtIso: move.createdAt.toISOString(),
				updatedAtIso: move.updatedAt.toISOString(),
			})),
	};
}

function mapAnalysisSettings(analysis: GameAnalysisRecordForMapping): AnalysisSettings {
	return {
		version: 1,
		mode: analysis.analysisMode === 'DEPTH' ? 'depth' : 'movetime',
		movetimeMs: analysis.movetimeMs ?? 250,
		depth: analysis.depth ?? 12,
		threads: analysis.threads,
		hashMb: analysis.hashMb,
		multiPv: analysis.multiPv,
	};
}

function mapPrismaAnalysisStatus(status: PrismaAnalysisStatus): GameAnalysisStatus {
	return status;
}

function buildEvaluation(cp: number | null, mate: number | null): AnalysisEvaluation | null {
	if (cp === null && mate === null) {
		return null;
	}

	return {
		cp,
		mate,
	};
}

function parsePrincipalVariation(value: string | null): string[] {
	if (!value) {
		return [];
	}

	try {
		const parsed = JSON.parse(value) as unknown;

		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed.filter((item): item is string => typeof item === 'string');
	} catch {
		return [];
	}
}

function toIsoOrNull(value: Date | null): string | null {
	return value ? value.toISOString() : null;
}
