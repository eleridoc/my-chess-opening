import { ipcMain } from 'electron';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { buildMyNextMovesFilterDbPayload, mergeGameWhere } from '../shared/myNextMovesFilterDb';

import type {
	MyNextMoveRow,
	MyNextMovesInput,
	MyNextMovesOutcomeStats,
	MyNextMovesPositionSummary,
	MyNextMovesResult,
} from 'my-chess-opening-core';

/**
 * Lightweight selected game snapshot used during in-memory aggregation.
 */
interface ReachedPositionGameSnapshot {
	resultKey: number;
	playedAt: Date;
}

/**
 * One canonical next-move occurrence retained per game.
 *
 * Rules:
 * - counts are based on distinct games
 * - if the same position appears multiple times in one game,
 *   only the earliest occurrence is retained
 */
interface CanonicalNextMoveOccurrence {
	gameId: string;
	moveSan: string;
	moveUci: string;
	resultKey: number;
	playedAt: Date;
}

/**
 * Internal mutable accumulator for White / Draw / Black counts.
 */
interface OutcomeCounters {
	whiteWinsCount: number;
	drawsCount: number;
	blackWinsCount: number;
}

/**
 * Internal mutable row accumulator before percentages are computed.
 */
interface MoveRowAccumulator extends OutcomeCounters {
	moveSan: string;
	moveUci: string;
	gamesCount: number;
	lastPlayedAt: Date | null;
}

/**
 * Register IPC handlers for Explorer "My next moves".
 *
 * V1.9.3 scope:
 * - compute aggregated next moves from the current position
 * - compute the bottom summary row for the current position itself
 * - rely on distinct games only
 */
export function registerMyNextMovesIpc(): void {
	ipcMain.handle(
		'myNextMoves:getMoves',
		async (_event, input: MyNextMovesInput): Promise<MyNextMovesResult> => {
			const payload = buildMyNextMovesFilterDbPayload(input?.filter ?? {});
			const positionKey = normalizeRequiredText(input?.positionKey);
			const normalizedFen = normalizeOptionalText(input?.normalizedFen);

			if (positionKey.length === 0) {
				return {
					appliedFilter: payload.filter,
					positionKey: '',
					normalizedFen,
					positionSummary: buildEmptyPositionSummary(),
					moves: [],
				};
			}

			const [positionGames, rawMoveOccurrences] = await Promise.all([
				loadReachedPositionGames(positionKey, payload.where),
				loadCanonicalNextMoveOccurrences(positionKey, payload.where),
			]);

			const positionSummary = buildPositionSummary(positionGames);
			const moves = buildNextMoveRows(rawMoveOccurrences, positionSummary.gamesCount);

			return {
				appliedFilter: payload.filter,
				positionKey,
				normalizedFen,
				positionSummary,
				moves,
			};
		},
	);
}

/**
 * Load distinct games that reached the current position.
 *
 * A game is considered to have reached the position when:
 * - it has at least one move played from this position (`positionHashBefore`)
 * - OR it has at least one move ending on this position (`positionHash`)
 *
 * The second clause is required so terminal positions still appear in the
 * bottom summary row even when no next move exists.
 */
async function loadReachedPositionGames(
	positionKey: string,
	baseWhere: Prisma.GameWhereInput,
): Promise<ReachedPositionGameSnapshot[]> {
	const where = mergeGameWhere(baseWhere ?? {}, {
		OR: [
			{ moves: { some: { positionHashBefore: positionKey } } },
			{ moves: { some: { positionHash: positionKey } } },
		],
	});

	return prisma.game.findMany({
		where,
		select: {
			resultKey: true,
			playedAt: true,
		},
	});
}

/**
 * Load raw next-move occurrences from the current position and reduce them to
 * one canonical occurrence per game.
 *
 * Canonicalization rule:
 * - keep the earliest ply for each game
 *
 * Why:
 * - the same position may appear multiple times in a single game
 * - V1.9 requires distinct-game statistics
 * - keeping one canonical occurrence per game preserves stable percentages
 */
async function loadCanonicalNextMoveOccurrences(
	positionKey: string,
	baseWhere: Prisma.GameWhereInput,
): Promise<CanonicalNextMoveOccurrence[]> {
	const rows = await prisma.gameMove.findMany({
		where: {
			positionHashBefore: positionKey,
			game: {
				is: baseWhere,
			},
		},
		orderBy: [{ gameId: 'asc' }, { ply: 'asc' }],
		select: {
			gameId: true,
			ply: true,
			san: true,
			uci: true,
			game: {
				select: {
					resultKey: true,
					playedAt: true,
				},
			},
		},
	});

	const firstOccurrenceByGame = new Map<string, CanonicalNextMoveOccurrence>();

	for (const row of rows) {
		if (firstOccurrenceByGame.has(row.gameId)) {
			continue;
		}

		firstOccurrenceByGame.set(row.gameId, {
			gameId: row.gameId,
			moveSan: row.san,
			moveUci: row.uci ?? '',
			resultKey: row.game.resultKey,
			playedAt: row.game.playedAt,
		});
	}

	return Array.from(firstOccurrenceByGame.values());
}

/**
 * Build the persistent bottom summary row for the current position.
 */
function buildPositionSummary(games: ReachedPositionGameSnapshot[]): MyNextMovesPositionSummary {
	const counters = createOutcomeCounters();

	let lastPlayedAt: Date | null = null;

	for (const game of games) {
		applyResultKeyToCounters(counters, game.resultKey);
		lastPlayedAt = maxDate(lastPlayedAt, game.playedAt);
	}

	const gamesCount = games.length;

	return {
		gamesCount,
		gamesPercent: gamesCount > 0 ? 100 : 0,
		outcomes: buildOutcomeStats(counters, gamesCount),
		lastPlayedAtIso: lastPlayedAt?.toISOString() ?? null,
	};
}

/**
 * Aggregate canonical next-move occurrences into UI rows.
 */
function buildNextMoveRows(
	occurrences: CanonicalNextMoveOccurrence[],
	positionGamesCount: number,
): MyNextMoveRow[] {
	const rowsByMoveKey = new Map<string, MoveRowAccumulator>();

	for (const occurrence of occurrences) {
		const moveKey = buildMoveAggregationKey(occurrence.moveSan, occurrence.moveUci);
		const existing = rowsByMoveKey.get(moveKey);

		if (existing) {
			existing.gamesCount += 1;
			applyResultKeyToCounters(existing, occurrence.resultKey);
			existing.lastPlayedAt = maxDate(existing.lastPlayedAt, occurrence.playedAt);
			continue;
		}

		const created: MoveRowAccumulator = {
			moveSan: occurrence.moveSan,
			moveUci: occurrence.moveUci,
			gamesCount: 1,
			lastPlayedAt: occurrence.playedAt,
			...createOutcomeCounters(),
		};

		applyResultKeyToCounters(created, occurrence.resultKey);
		rowsByMoveKey.set(moveKey, created);
	}

	return Array.from(rowsByMoveKey.values())
		.map(
			(row): MyNextMoveRow => ({
				moveSan: row.moveSan,
				moveUci: row.moveUci,
				gamesCount: row.gamesCount,
				gamesPercent: computePercent(row.gamesCount, positionGamesCount),
				outcomes: buildOutcomeStats(row, row.gamesCount),
				lastPlayedAtIso: row.lastPlayedAt?.toISOString() ?? null,
			}),
		)
		.sort(compareMoveRows);
}

/**
 * Return an empty summary row used for invalid / empty position keys.
 */
function buildEmptyPositionSummary(): MyNextMovesPositionSummary {
	return {
		gamesCount: 0,
		gamesPercent: 0,
		outcomes: buildOutcomeStats(createOutcomeCounters(), 0),
		lastPlayedAtIso: null,
	};
}

/**
 * Create empty White / Draw / Black counters.
 */
function createOutcomeCounters(): OutcomeCounters {
	return {
		whiteWinsCount: 0,
		drawsCount: 0,
		blackWinsCount: 0,
	};
}

/**
 * Apply one objective game result to White / Draw / Black counters.
 *
 * `resultKey` meaning:
 * -  1 => White win
 * -  0 => Draw
 * - -1 => Black win
 */
function applyResultKeyToCounters(counters: OutcomeCounters, resultKey: number): void {
	if (resultKey > 0) {
		counters.whiteWinsCount += 1;
		return;
	}

	if (resultKey < 0) {
		counters.blackWinsCount += 1;
		return;
	}

	counters.drawsCount += 1;
}

/**
 * Build immutable outcome stats with percentages.
 */
function buildOutcomeStats(counters: OutcomeCounters, totalGames: number): MyNextMovesOutcomeStats {
	return {
		whiteWinsCount: counters.whiteWinsCount,
		drawsCount: counters.drawsCount,
		blackWinsCount: counters.blackWinsCount,
		whiteWinsPercent: computePercent(counters.whiteWinsCount, totalGames),
		drawsPercent: computePercent(counters.drawsCount, totalGames),
		blackWinsPercent: computePercent(counters.blackWinsCount, totalGames),
	};
}

/**
 * Build a stable aggregation key for move rows.
 *
 * UCI is preferred for technical stability.
 * SAN is kept in the key as a defensive fallback.
 */
function buildMoveAggregationKey(moveSan: string, moveUci: string): string {
	return `${moveUci}::${moveSan}`;
}

/**
 * Compute a percentage in the range 0..100.
 */
function computePercent(value: number, total: number): number {
	if (total <= 0) {
		return 0;
	}

	return (value / total) * 100;
}

/**
 * Keep the latest non-null date.
 */
function maxDate(current: Date | null, candidate: Date): Date {
	if (current === null) {
		return candidate;
	}

	return candidate.getTime() > current.getTime() ? candidate : current;
}

/**
 * Normalize a required text field.
 */
function normalizeRequiredText(value: string | null | undefined): string {
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * Normalize an optional text field and preserve null semantics.
 */
function normalizeOptionalText(value: string | null | undefined): string | null {
	const normalized = normalizeRequiredText(value);
	return normalized.length > 0 ? normalized : null;
}

/**
 * Stable sort:
 * 1. most played move first
 * 2. then SAN ascending
 * 3. then UCI ascending
 */
function compareMoveRows(a: MyNextMoveRow, b: MyNextMoveRow): number {
	if (b.gamesCount !== a.gamesCount) {
		return b.gamesCount - a.gamesCount;
	}

	if (a.moveSan < b.moveSan) {
		return -1;
	}
	if (a.moveSan > b.moveSan) {
		return 1;
	}

	if (a.moveUci < b.moveUci) {
		return -1;
	}
	if (a.moveUci > b.moveUci) {
		return 1;
	}

	return 0;
}
