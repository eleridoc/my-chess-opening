import type { Prisma } from '@prisma/client';
import {
	ExternalSite as PrismaExternalSite,
	GameSpeed as PrismaGameSpeed,
	PlayerColor as PrismaPlayerColor,
} from '@prisma/client';

import type {
	SharedGameFilterGameSpeed,
	SharedGameFilterPlatform,
	SharedGameFilterQuery,
	SharedGameFilterQueryPayload,
} from 'my-chess-opening-core';
import { buildSharedGameFilterQueryPayload } from 'my-chess-opening-core';

import { GAMES_SHARED_GAME_FILTER_CONTEXT_CONFIG } from '../shared/sharedGameFilterContextConfigs';

/**
 * Combined payload returned by the Games shared filter DB helper.
 *
 * It contains:
 * - the canonical filter actually applied by the backend
 * - the compact query-ready payload derived from the shared filter
 * - the Prisma `where` clause used by the Games list query
 */
export interface GamesFilterDbPayload extends SharedGameFilterQueryPayload {
	where: Prisma.GameWhereInput;
}

/**
 * Build the canonical Games filter payload and its Prisma `where` clause.
 *
 * Notes:
 * - Only the fields allowed by the Games backend context are applied.
 * - Unsupported fields are stripped before the DB query is built.
 * - This helper is intentionally scoped to the V1.13 Games page migration.
 */
export function buildGamesFilterDbPayload(
	value: unknown,
	referenceDate?: Date | string,
): GamesFilterDbPayload {
	const payload = buildSharedGameFilterQueryPayload(
		value,
		GAMES_SHARED_GAME_FILTER_CONTEXT_CONFIG,
		referenceDate,
	);

	return {
		...payload,
		where: buildGamesWhere(payload.query),
	};
}

/**
 * Build the Prisma `where` clause for the Games page.
 *
 * Supported shared-filter fields:
 * - playedDateFromIso
 * - playedDateToIso
 * - playedColor
 * - playerResult
 * - gameSpeeds
 * - ratedMode
 * - platforms
 * - ecoCodeExact
 * - openingNameContains
 * - gameIdExact
 * - playerRatingMin
 * - playerRatingMax
 * - opponentRatingMin
 * - opponentRatingMax
 * - playerTextSearch
 *
 * Intentionally not supported:
 * - ratingDiffMin
 * - ratingDiffMax
 *
 * Reason:
 * these fields mean playerRating - opponentRating, and the Games page
 * deliberately does not filter on this computed value.
 */
export function buildGamesWhere(query: SharedGameFilterQuery): Prisma.GameWhereInput {
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
			myColor:
				query.playedColor === 'white' ? PrismaPlayerColor.WHITE : PrismaPlayerColor.BLACK,
		});
	}

	if (query.playerResult) {
		and.push({
			myResultKey: toOwnerResultKey(query.playerResult),
		});
	}

	if (query.gameSpeeds && query.gameSpeeds.length > 0) {
		and.push({
			speed: {
				in: query.gameSpeeds.map(toPrismaGameSpeed),
			},
		});
	}

	if (query.ratedMode === 'ratedOnly') {
		and.push({ rated: true });
	} else if (query.ratedMode === 'casualOnly') {
		and.push({ rated: false });
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

	if (query.ecoCodeExact) {
		and.push({
			OR: [{ eco: query.ecoCodeExact }, { ecoDetermined: query.ecoCodeExact }],
		});
	}

	if (query.openingNameContains) {
		and.push({
			OR: [
				{ opening: { contains: query.openingNameContains } },
				{ ecoOpeningName: { contains: query.openingNameContains } },
			],
		});
	}

	if (query.gameIdExact) {
		and.push({
			OR: [{ id: query.gameIdExact }, { externalId: query.gameIdExact }],
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

	if (query.opponentRatingMin !== undefined) {
		and.push({
			opponentElo: { gte: query.opponentRatingMin },
		});
	}

	if (query.opponentRatingMax !== undefined) {
		and.push({
			opponentElo: { lte: query.opponentRatingMax },
		});
	}

	if (query.playerTextSearch) {
		and.push({
			OR: [
				{ myUsername: { contains: query.playerTextSearch } },
				{ opponentUsername: { contains: query.playerTextSearch } },
				{ whiteUsername: { contains: query.playerTextSearch } },
				{ blackUsername: { contains: query.playerTextSearch } },
			],
		});
	}

	return and.length > 0 ? { AND: and } : {};
}

/**
 * Parse a raw ISO 8601 date string into a valid Date object.
 */
function parseIsoDate(value: string): Date | null {
	const parsed = new Date(value);

	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Map the shared owner-perspective result to the DB numeric key.
 */
function toOwnerResultKey(
	value: Exclude<SharedGameFilterQuery['playerResult'], undefined>,
): number {
	switch (value) {
		case 'win':
			return 1;
		case 'loss':
			return -1;
		case 'draw':
			return 0;
		default:
			return 0;
	}
}

/**
 * Map shared filter platform values to the Prisma site enum.
 */
function toPrismaExternalSite(value: SharedGameFilterPlatform): PrismaExternalSite | null {
	switch (value) {
		case 'lichess':
			return PrismaExternalSite.LICHESS;
		case 'chessCom':
			return PrismaExternalSite.CHESSCOM;
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
			return PrismaGameSpeed.BULLET;
		case 'blitz':
			return PrismaGameSpeed.BLITZ;
		case 'rapid':
			return PrismaGameSpeed.RAPID;
		default:
			// Defensive fallback.
			return PrismaGameSpeed.RAPID;
	}
}
