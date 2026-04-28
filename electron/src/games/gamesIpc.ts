import { ipcMain } from 'electron';
import type { Prisma } from '@prisma/client';

import type { GamesListInput, GamesListResult, SharedGameFilter } from 'my-chess-opening-core';

import { prisma } from '../db/prisma';
import { clamp } from '../shared/math';
import { buildGamesFilterDbPayload } from './gamesFilterDb';

interface GamesListWherePayload {
	where: Prisma.GameWhereInput;
	appliedFilter: SharedGameFilter | null;
}

function parseIsoDateStart(iso: string): Date | null {
	const s = iso.trim();
	if (!s) return null;

	// Date-only (YYYY-MM-DD) → interpret as start of day (UTC)
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
		const d = new Date(`${s}T00:00:00.000Z`);
		return Number.isNaN(d.getTime()) ? null : d;
	}

	const d = new Date(s);
	return Number.isNaN(d.getTime()) ? null : d;
}

function parseIsoDateEnd(iso: string): Date | null {
	const s = iso.trim();
	if (!s) return null;

	// Date-only (YYYY-MM-DD) → interpret as end of day (UTC)
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
		const d = new Date(`${s}T23:59:59.999Z`);
		return Number.isNaN(d.getTime()) ? null : d;
	}

	const d = new Date(s);
	return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Build the Games list `where` payload.
 *
 * V1.13 transition rule:
 * - when `input.filter` is provided, use the new shared filter mapping
 * - otherwise, keep the legacy `input.filters` behavior until the UI migration is done
 */
function buildGamesListWherePayload(input?: GamesListInput): GamesListWherePayload {
	if (input && Object.prototype.hasOwnProperty.call(input, 'filter')) {
		const payload = buildGamesFilterDbPayload(input.filter ?? {});

		return {
			where: payload.where,
			appliedFilter: payload.filter,
		};
	}

	return {
		where: buildLegacyWhere(input?.filters ?? {}),
		appliedFilter: null,
	};
}

/**
 * Legacy Games page filters.
 *
 * @deprecated V1.13 introduces the shared game filter through
 * `GamesListInput.filter`. Keep this function only until the Games page UI has
 * fully migrated to the shared filter.
 */
function buildLegacyWhere(filters: NonNullable<GamesListInput['filters']>): Prisma.GameWhereInput {
	const and: Prisma.GameWhereInput[] = [];

	if (filters.sites?.length) {
		and.push({ site: { in: filters.sites } });
	}

	if (filters.myColor?.length) {
		and.push({
			myColor: {
				in: filters.myColor.map((value) => (value === 'white' ? 'WHITE' : 'BLACK')),
			},
		});
	}

	if (filters.resultKeys?.length) {
		and.push({ resultKey: { in: filters.resultKeys } });
	}

	if (filters.myResultKeys?.length) {
		and.push({ myResultKey: { in: filters.myResultKeys } });
	}

	if (filters.playedAtGteIso) {
		const d = parseIsoDateStart(filters.playedAtGteIso);
		if (d) and.push({ playedAt: { gte: d } });
	}

	if (filters.playedAtLteIso) {
		const d = parseIsoDateEnd(filters.playedAtLteIso);
		if (d) and.push({ playedAt: { lte: d } });
	}

	if (filters.search && filters.search.trim().length > 0) {
		const q = filters.search.trim();

		and.push({
			OR: [
				{ myUsername: { contains: q } },
				{ opponentUsername: { contains: q } },
				{ whiteUsername: { contains: q } },
				{ blackUsername: { contains: q } },
				{ opening: { contains: q } },
				{ ecoOpeningName: { contains: q } },
				{ eco: { contains: q } },
				{ ecoDetermined: { contains: q } },
				{ externalId: { contains: q } },
			],
		});
	}

	return and.length ? { AND: and } : {};
}

function buildExternalUrl(site: string, externalId: string | null): string | null {
	if (!externalId) return null;

	if (site === 'LICHESS') return `https://lichess.org/${externalId}`;

	if (site === 'CHESSCOM') {
		// Most common case for imported games.
		return `https://www.chess.com/game/live/${externalId}`;
	}

	return null;
}

export function registerGamesIpc() {
	ipcMain.handle(
		'games:list',
		async (_event, input?: GamesListInput): Promise<GamesListResult> => {
			const page = clamp(Number(input?.page ?? 1), 1, 10_000);
			const pageSize = clamp(Number(input?.pageSize ?? 50), 1, 200);
			const { where, appliedFilter } = buildGamesListWherePayload(input);
			const playedAtOrder = input?.playedAtOrder === 'asc' ? 'asc' : 'desc';
			const skip = (page - 1) * pageSize;

			const [total, rows] = await Promise.all([
				prisma.game.count({ where }),
				prisma.game.findMany({
					where,
					orderBy: [{ playedAt: playedAtOrder }, { id: playedAtOrder }], // stable ordering
					skip,
					take: pageSize,
					select: {
						id: true,
						playedAt: true,

						site: true,
						rated: true,
						speed: true,
						timeControl: true,

						result: true,
						myResultKey: true,

						myColor: true,
						myUsername: true,
						opponentUsername: true,

						whiteUsername: true,
						blackUsername: true,

						whiteElo: true,
						blackElo: true,

						eco: true,
						ecoDetermined: true,
						opening: true,

						ecoOpeningName: true,
						ecoOpeningLinePgn: true,
						ecoOpeningMatchPly: true,

						_count: { select: { moves: true } },
						externalId: true,
					},
				}),
			]);

			return {
				items: rows.map((g) => ({
					id: g.id,
					playedAtIso: g.playedAt.toISOString(),

					site: g.site as any,
					rated: g.rated,
					speed: g.speed as any,
					timeControl: g.timeControl,

					result: g.result,
					myResultKey: (g.myResultKey as any) ?? 0,

					myColor: g.myColor === 'WHITE' ? 'white' : 'black',
					myUsername: g.myUsername,
					opponentUsername: g.opponentUsername,

					whiteUsername: g.whiteUsername,
					blackUsername: g.blackUsername,

					whiteElo: g.whiteElo ?? null,
					blackElo: g.blackElo ?? null,

					eco: g.eco ?? null,
					ecoDetermined: g.ecoDetermined ?? null,

					opening: g.opening ?? null,
					ecoOpeningName: g.ecoOpeningName ?? null,
					ecoOpeningLinePgn: g.ecoOpeningLinePgn ?? null,
					ecoOpeningMatchPly: g.ecoOpeningMatchPly ?? null,

					movesCount: g._count.moves,
					externalUrl: buildExternalUrl(g.site, g.externalId ?? null),
				})),
				total,
				page,
				pageSize,
				appliedFilter,
			};
		},
	);
}
