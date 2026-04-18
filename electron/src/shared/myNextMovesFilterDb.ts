import type { Prisma } from '@prisma/client';
import { ExternalSite as PrismaExternalSite, GameSpeed as PrismaGameSpeed } from '@prisma/client';

import type {
	SharedGameFilterGameSpeed,
	SharedGameFilterPlatform,
	SharedGameFilterQuery,
	SharedGameFilterQueryPayload,
} from 'my-chess-opening-core';
import { buildSharedGameFilterQueryPayload } from 'my-chess-opening-core';

import { MY_NEXT_MOVES_SHARED_GAME_FILTER_CONTEXT_CONFIG } from './sharedGameFilterContextConfigs';

/**
 * Combined payload returned by the my-next-moves shared filter DB helper.
 *
 * It contains:
 * - the canonical filter actually applied by the backend
 * - the compact query-ready payload derived from the shared filter
 * - the Prisma `where` clause used by future DB aggregations
 */
export interface MyNextMovesFilterDbPayload extends SharedGameFilterQueryPayload {
	where: Prisma.GameWhereInput;
}

/**
 * Build the canonical my-next-moves filter payload and its Prisma `where` clause.
 *
 * Notes:
 * - Only the fields allowed by the my-next-moves backend context are applied.
 * - Unsupported fields are stripped before the DB query is built.
 * - This helper is intentionally scoped to the V1.9 my-next-moves feature.
 */
export function buildMyNextMovesFilterDbPayload(
	value: unknown,
	referenceDate?: Date | string,
): MyNextMovesFilterDbPayload {
	const payload = buildSharedGameFilterQueryPayload(
		value,
		MY_NEXT_MOVES_SHARED_GAME_FILTER_CONTEXT_CONFIG,
		referenceDate,
	);

	return {
		...payload,
		where: buildMyNextMovesWhere(payload.query),
	};
}

/**
 * Build the Prisma `where` clause for the my-next-moves feature.
 *
 * Supported query fields in V1.9.2:
 * - playedDateFromIso
 * - playedDateToIso
 * - playedColor
 * - playerResult
 * - gameSpeeds
 * - platforms
 * - playerRatingMin
 * - playerRatingMax
 *
 * Important:
 * - Owner-perspective fields are used where applicable:
 *   - myColor
 *   - myResultKey
 *   - myElo
 * - Fields intentionally not part of the my-next-moves context are ignored.
 */
export function buildMyNextMovesWhere(query: SharedGameFilterQuery): Prisma.GameWhereInput {
	const and: Prisma.GameWhereInput[] = [];

	if (query.playedDateFromIso) {
		const playedAtFrom = parseIsoDate(query.playedDateFromIso);
		if (playedAtFrom !== null) {
			and.push({ playedAt: { gte: playedAtFrom } });
		}
	}

	if (query.playedDateToIso) {
		const playedAtTo = parseIsoDate(query.playedDateToIso);
		if (playedAtTo !== null) {
			and.push({ playedAt: { lte: playedAtTo } });
		}
	}

	if (query.playedColor) {
		and.push({
			myColor: query.playedColor === 'white' ? 'WHITE' : 'BLACK',
		});
	}

	if (query.playerResult) {
		and.push({
			myResultKey: query.playerResult === 'win' ? 1 : query.playerResult === 'loss' ? -1 : 0,
		});
	}

	if (query.gameSpeeds && query.gameSpeeds.length > 0) {
		and.push({
			speed: {
				in: query.gameSpeeds.map(toPrismaGameSpeed),
			},
		});
	}

	if (query.platforms && query.platforms.length > 0) {
		const mappedSites = query.platforms
			.map((value) => toPrismaExternalSite(value))
			.filter((value): value is PrismaExternalSite => value !== null);

		/**
		 * Keep the restriction even when the mapped list is empty.
		 *
		 * Example:
		 * - platform = "other"
		 * - current DB only stores Lichess / Chess.com
		 *
		 * In that case, the query should correctly return no matches.
		 */
		and.push({
			site: {
				in: mappedSites,
			},
		});
	}

	if (query.playerRatingMin !== undefined) {
		and.push({
			myElo: { gte: query.playerRatingMin },
		});
	}

	if (query.playerRatingMax !== undefined) {
		and.push({
			myElo: { lte: query.playerRatingMax },
		});
	}

	return and.length > 0 ? { AND: and } : {};
}

/**
 * Merge a base game `where` clause with an additional clause.
 *
 * This small helper will be reused by future my-next-moves aggregation queries.
 */
export function mergeGameWhere(
	baseWhere: Prisma.GameWhereInput,
	additionalWhere: Prisma.GameWhereInput,
): Prisma.GameWhereInput {
	if (Object.keys(baseWhere).length === 0) {
		return additionalWhere;
	}

	return {
		AND: [baseWhere, additionalWhere],
	};
}

/**
 * Parse a raw ISO 8601 date string into a valid Date object.
 */
function parseIsoDate(value: string): Date | null {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Map shared filter platform values to the Prisma site enum.
 */
function toPrismaExternalSite(value: SharedGameFilterPlatform): PrismaExternalSite | null {
	switch (value) {
		case 'lichess':
			return 'LICHESS';
		case 'chessCom':
			return 'CHESSCOM';
		default:
			return null;
	}
}

/**
 * Map shared filter speed values to the Prisma speed enum.
 */
function toPrismaGameSpeed(value: SharedGameFilterGameSpeed): PrismaGameSpeed {
	switch (value) {
		case 'bullet':
			return 'BULLET';
		case 'blitz':
			return 'BLITZ';
		case 'rapid':
			return 'RAPID';
		default:
			// Defensive fallback.
			return 'RAPID';
	}
}
