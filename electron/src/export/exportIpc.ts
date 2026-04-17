import { ipcMain } from 'electron';
import type {
	ExternalSite as PrismaExternalSite,
	GameSpeed as PrismaGameSpeed,
} from '@prisma/client';
import { prisma } from '../db/prisma';

import type { Prisma } from '@prisma/client';

import type {
	ExportSummaryInput,
	ExportSummaryResult,
	SharedGameFilterContextConfig,
	SharedGameFilterPlatform,
	SharedGameFilterQuery,
} from 'my-chess-opening-core';
import { buildSharedGameFilterQueryPayload } from 'my-chess-opening-core';

/**
 * Export-specific shared filter configuration used by the backend.
 *
 * Notes:
 * - The backend must not trust the renderer to hide fields correctly.
 * - Hidden fields are stripped again here before building the DB query.
 * - Opponent rating and rating difference are intentionally excluded for V1.8.
 */
const EXPORT_SHARED_GAME_FILTER_CONTEXT_CONFIG: SharedGameFilterContextConfig = {
	visibleFields: [
		'periodPreset',
		'datePlayedFrom',
		'datePlayedTo',
		'playedColor',
		'playerResult',
		'gameSpeeds',
		'ratedMode',
		'platforms',
		'ecoCodeExact',
		'openingNameContains',
		'gameIdExact',
		'playerRatingMin',
		'playerRatingMax',
		'playerTextSearch',
	],
};

/**
 * Register IPC handlers for the Export screen.
 *
 * V1.8.2 scope:
 * - summary only
 * - no PGN file generation yet
 */
export function registerExportIpc(): void {
	ipcMain.handle(
		'export:getSummary',
		async (_event, input?: ExportSummaryInput): Promise<ExportSummaryResult> => {
			const payload = buildSharedGameFilterQueryPayload(
				input?.filter ?? {},
				EXPORT_SHARED_GAME_FILTER_CONTEXT_CONFIG,
			);

			const where = buildExportWhere(payload.query);

			const [
				totalGames,
				wins,
				draws,
				losses,
				whiteGames,
				blackGames,
				bulletGames,
				blitzGames,
				rapidGames,
			] = await Promise.all([
				prisma.game.count({ where }),
				prisma.game.count({ where: mergeWhere(where, { myResultKey: 1 }) }),
				prisma.game.count({ where: mergeWhere(where, { myResultKey: 0 }) }),
				prisma.game.count({ where: mergeWhere(where, { myResultKey: -1 }) }),
				prisma.game.count({ where: mergeWhere(where, { myColor: 'WHITE' }) }),
				prisma.game.count({ where: mergeWhere(where, { myColor: 'BLACK' }) }),
				prisma.game.count({ where: mergeWhere(where, { speed: 'BULLET' }) }),
				prisma.game.count({ where: mergeWhere(where, { speed: 'BLITZ' }) }),
				prisma.game.count({ where: mergeWhere(where, { speed: 'RAPID' }) }),
			]);

			return {
				appliedFilter: payload.filter,
				stats: {
					totalGames,
					wins,
					draws,
					losses,
					whiteGames,
					blackGames,
					bulletGames,
					blitzGames,
					rapidGames,
				},
			};
		},
	);
}

/**
 * Build the Prisma `where` clause for export summary queries.
 *
 * Rules:
 * - owner perspective is used where applicable:
 *   - myColor
 *   - myResultKey
 *   - myElo
 * - opening/ECO filters accept either provider data or app-deduced enrichment
 * - game id exact matches either internal DB id or provider external id
 */
function buildExportWhere(query: SharedGameFilterQuery): Prisma.GameWhereInput {
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

	if (query.ratedMode === 'ratedOnly') {
		and.push({ rated: true });
	} else if (query.ratedMode === 'casualOnly') {
		and.push({ rated: false });
	}

	if (query.platforms && query.platforms.length > 0) {
		const mappedSites = query.platforms
			.map((value: SharedGameFilterPlatform) => toPrismaExternalSite(value))
			.filter(
				(value: PrismaExternalSite | null): value is PrismaExternalSite => value !== null,
			);

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
 * Merge a base export `where` clause with an additional summary-specific clause.
 *
 * This keeps the summary count calls explicit and easy to read.
 */
function mergeWhere(
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
 * Parse an ISO 8601 string into a valid Date instance.
 */
function parseIsoDate(value: string): Date | null {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Shared filter platform -> Prisma site enum.
 *
 * Notes:
 * - V1.8 only has imported games from Lichess / Chess.com in the DB.
 * - "other" currently maps to no DB site and therefore yields no matches
 *   when selected alone.
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
 * Shared filter speed -> Prisma speed enum.
 */
function toPrismaGameSpeed(value: string): PrismaGameSpeed {
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
