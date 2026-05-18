import type {
	AnalysisMode as PrismaAnalysisMode,
	AnalysisStatus as PrismaAnalysisStatus,
	PlayerColor as PrismaPlayerColor,
} from '@prisma/client';

import type { AnalysisSettings } from 'my-chess-opening-core';

import { prisma } from '../db/prisma';
import type {
	GameAnalysisRecordForMapping,
	GameMoveAnalysisRecordForMapping,
} from './gameAnalysisMapper';

export interface GameMoveForAnalysis {
	id: string;
	ply: number;
	san: string;
	uci: string | null;
	fen: string;
	fenBefore: string | null;
	positionHash: string;
	positionHashBefore: string;
}

export interface GameForAnalysis {
	id: string;
	moves: GameMoveForAnalysis[];
}

export interface CreateRunningGameAnalysisInput {
	gameId: string;
	engineName: string;
	engineVersion: string | null;
	settings: AnalysisSettings;
	configSnapshotJson: string;
	totalPlies: number;
}

export interface CreateGameMoveAnalysisInput {
	gameAnalysisId: string;
	gameId: string;
	ply: number;
	moveNumber: number;
	playedBy: PrismaPlayerColor;
	fenBefore: string;
	fenAfter: string;
	positionHashBefore: string | null;
	positionHashAfter: string | null;
	moveSan: string;
	moveUci: string | null;
	bestMoveUci: string | null;
	evalBeforeCp: number | null;
	evalBeforeMate: number | null;
	evalAfterCp: number | null;
	evalAfterMate: number | null;
	depthReached: number | null;
	timeMs: number | null;
	principalVariationUci: string[];
}

export async function loadGameForAnalysis(gameId: string): Promise<GameForAnalysis | null> {
	return await prisma.game.findUnique({
		where: {
			id: gameId,
		},
		select: {
			id: true,
			moves: {
				orderBy: {
					ply: 'asc',
				},
				select: {
					id: true,
					ply: true,
					san: true,
					uci: true,
					fen: true,
					fenBefore: true,
					positionHash: true,
					positionHashBefore: true,
				},
			},
		},
	});
}

export async function findLatestCompatibleCompletedGameAnalysis(
	gameId: string,
	configSnapshotJson: string,
): Promise<GameAnalysisRecordForMapping | null> {
	return await prisma.gameAnalysis.findFirst({
		where: {
			gameId,
			status: 'COMPLETED',
			configSnapshotJson,
		},
		orderBy: {
			createdAt: 'desc',
		},
		include: {
			moves: {
				orderBy: {
					ply: 'asc',
				},
			},
		},
	});
}

export async function loadLatestGameAnalysisByGameId(
	gameId: string,
): Promise<GameAnalysisRecordForMapping | null> {
	return await prisma.gameAnalysis.findFirst({
		where: {
			gameId,
		},
		orderBy: {
			createdAt: 'desc',
		},
		include: {
			moves: {
				orderBy: {
					ply: 'asc',
				},
			},
		},
	});
}

export async function loadGameAnalysisById(
	id: string,
): Promise<GameAnalysisRecordForMapping | null> {
	return await prisma.gameAnalysis.findUnique({
		where: {
			id,
		},
		include: {
			moves: {
				orderBy: {
					ply: 'asc',
				},
			},
		},
	});
}

export async function createRunningGameAnalysis(
	input: CreateRunningGameAnalysisInput,
): Promise<GameAnalysisRecordForMapping> {
	const now = new Date();

	return await prisma.gameAnalysis.create({
		data: {
			gameId: input.gameId,
			status: 'RUNNING',
			engineName: input.engineName,
			engineVersion: input.engineVersion,
			analysisMode: mapAnalysisModeToPrisma(input.settings.mode),
			depth: input.settings.depth,
			movetimeMs: input.settings.movetimeMs,
			threads: input.settings.threads,
			hashMb: input.settings.hashMb,
			multiPv: input.settings.multiPv,
			configSnapshotJson: input.configSnapshotJson,
			totalPlies: input.totalPlies,
			analyzedPlies: 0,
			startedAt: now,
			moves: {
				create: [],
			},
		},
		include: {
			moves: {
				orderBy: {
					ply: 'asc',
				},
			},
		},
	});
}

export async function createGameMoveAnalysisAndUpdateProgress(
	input: CreateGameMoveAnalysisInput,
): Promise<void> {
	await prisma.$transaction([
		prisma.gameMoveAnalysis.create({
			data: {
				gameAnalysisId: input.gameAnalysisId,
				gameId: input.gameId,
				ply: input.ply,
				moveNumber: input.moveNumber,
				playedBy: input.playedBy,
				fenBefore: input.fenBefore,
				fenAfter: input.fenAfter,
				positionHashBefore: input.positionHashBefore,
				positionHashAfter: input.positionHashAfter,
				moveSan: input.moveSan,
				moveUci: input.moveUci,
				bestMoveUci: input.bestMoveUci,
				evalBeforeCp: input.evalBeforeCp,
				evalBeforeMate: input.evalBeforeMate,
				evalAfterCp: input.evalAfterCp,
				evalAfterMate: input.evalAfterMate,
				depthReached: input.depthReached,
				timeMs: input.timeMs,
				principalVariationUciJson: JSON.stringify(input.principalVariationUci),
			},
		}),
		prisma.gameAnalysis.update({
			where: {
				id: input.gameAnalysisId,
			},
			data: {
				analyzedPlies: input.ply,
			},
		}),
	]);
}

export async function markGameAnalysisCompleted(id: string): Promise<void> {
	await updateGameAnalysisStatus(id, 'COMPLETED', {
		completedAt: new Date(),
	});
}

export async function markGameAnalysisFailed(id: string, errorMessage: string): Promise<void> {
	await updateGameAnalysisStatus(id, 'FAILED', {
		failedAt: new Date(),
		errorMessage,
	});
}

export async function markGameAnalysisCancelled(id: string): Promise<void> {
	await updateGameAnalysisStatus(id, 'CANCELLED', {
		cancelledAt: new Date(),
		errorMessage: 'Analysis was cancelled.',
	});
}

async function updateGameAnalysisStatus(
	id: string,
	status: PrismaAnalysisStatus,
	data: {
		completedAt?: Date;
		failedAt?: Date;
		cancelledAt?: Date;
		errorMessage?: string;
	},
): Promise<void> {
	await prisma.gameAnalysis.update({
		where: {
			id,
		},
		data: {
			status,
			...data,
		},
	});
}

function mapAnalysisModeToPrisma(mode: AnalysisSettings['mode']): PrismaAnalysisMode {
	return mode === 'depth' ? 'DEPTH' : 'MOVETIME';
}
