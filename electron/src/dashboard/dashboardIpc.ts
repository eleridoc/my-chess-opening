import { ipcMain } from 'electron';
import type {
	ExternalSite as PrismaExternalSite,
	GameSpeed as PrismaGameSpeed,
	Prisma,
} from '@prisma/client';

import {
	ExternalSite,
	buildSharedGameFilterQueryPayload,
	resolveSharedGameFilterPlayedDateRange,
} from 'my-chess-opening-core';

import type {
	DashboardAccountBlock,
	DashboardDailyActivityPoint,
	DashboardDailyResultRatioPoint,
	DashboardEloPoint,
	DashboardGameSpeed,
	DashboardOverviewInput,
	DashboardOverviewResult,
	DashboardSpeedBlock,
	DashboardSummaryStats,
	SharedGameFilterQuery,
} from 'my-chess-opening-core';

import { prisma } from '../db/prisma';
import { DASHBOARD_SHARED_GAME_FILTER_CONTEXT_CONFIG } from '../shared/sharedGameFilterContextConfigs';

/**
 * Prisma row shape used by the Dashboard aggregation layer.
 *
 * Keep this intentionally small:
 * the Dashboard V1.12 only needs dates, result, speed, Elo and account metadata.
 */
interface DashboardGameRow {
	id: string;
	playedAt: Date;
	myResultKey: number;
	speed: PrismaGameSpeed;
	myElo: number | null;
	accountConfigId: string;
	accountConfig: {
		id: string;
		site: PrismaExternalSite;
		username: string;
	};
}

/**
 * Internal account accumulator used before converting to the public contract.
 */
interface DashboardAccountAccumulator {
	accountId: string;
	site: ExternalSite;
	username: string;
	games: DashboardGameRow[];
}

const DASHBOARD_PRISMA_SPEEDS: PrismaGameSpeed[] = ['BULLET', 'BLITZ', 'RAPID'];

const DASHBOARD_SPEED_ORDER: DashboardGameSpeed[] = ['bullet', 'blitz', 'rapid'];

/**
 * Register IPC handlers for the Dashboard page.
 *
 * V1.12 scope:
 * - one overview endpoint
 * - backend-side filter sanitization
 * - date-only filtering
 * - no classical games
 * - in-memory aggregation after a focused Prisma query
 */
export function registerDashboardIpc(): void {
	ipcMain.handle(
		'dashboard:getOverview',
		async (_event, input?: DashboardOverviewInput): Promise<DashboardOverviewResult> => {
			const referenceDate = new Date();

			const payload = buildSharedGameFilterQueryPayload(
				input?.filter ?? {},
				DASHBOARD_SHARED_GAME_FILTER_CONTEXT_CONFIG,
				referenceDate,
			);

			const playedDateRange = resolveSharedGameFilterPlayedDateRange(
				payload.filter,
				referenceDate,
			);

			const where = buildDashboardWhere(payload.query);

			const games = await prisma.game.findMany({
				where,
				orderBy: [{ playedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
				select: {
					id: true,
					playedAt: true,
					myResultKey: true,
					speed: true,
					myElo: true,
					accountConfigId: true,
					accountConfig: {
						select: {
							id: true,
							site: true,
							username: true,
						},
					},
				},
			});

			return {
				appliedFilter: payload.filter,
				playedDateRange,
				global: {
					summary: buildSummaryStats(games),
					dailyActivity: buildDailyActivity(games),
					dailyResultRatio: buildDailyResultRatio(games),
				},
				accounts: buildAccountBlocks(games),
			};
		},
	);
}

/**
 * Build the Prisma where clause for Dashboard queries.
 *
 * Dashboard V1.12 intentionally supports only:
 * - played date bounds
 * - bullet / blitz / rapid games
 *
 * Hidden shared-filter fields are already stripped by
 * DASHBOARD_SHARED_GAME_FILTER_CONTEXT_CONFIG before this function runs.
 */
function buildDashboardWhere(query: SharedGameFilterQuery): Prisma.GameWhereInput {
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

	// Dashboard V1.12 does not include classical games.
	and.push({
		speed: {
			in: DASHBOARD_PRISMA_SPEEDS,
		},
	});

	return and.length > 0 ? { AND: and } : {};
}

/**
 * Build reusable summary statistics from owner-perspective result keys.
 */
function buildSummaryStats(games: DashboardGameRow[]): DashboardSummaryStats {
	const totalGames = games.length;
	const wins = games.filter((game) => game.myResultKey === 1).length;
	const draws = games.filter((game) => game.myResultKey === 0).length;
	const losses = games.filter((game) => game.myResultKey === -1).length;

	return {
		totalGames,
		wins,
		draws,
		losses,
		winRatePercent: toPercent(wins, totalGames),
		drawRatePercent: toPercent(draws, totalGames),
		lossRatePercent: toPercent(losses, totalGames),
	};
}

/**
 * Build daily game counts for calendar heatmaps.
 *
 * Only days with at least one game are returned.
 * Empty days are handled by the heatmap component later.
 */
function buildDailyActivity(games: DashboardGameRow[]): DashboardDailyActivityPoint[] {
	const counters = new Map<string, number>();

	for (const game of games) {
		const date = toLocalCalendarDate(game.playedAt);
		counters.set(date, (counters.get(date) ?? 0) + 1);
	}

	return [...counters.entries()]
		.sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
		.map(([date, gamesCount]) => ({
			date,
			gamesCount,
		}));
}

/**
 * Build daily result ratio points for calendar heatmaps.
 *
 * Draws are intentionally neutral:
 * - wins increase the score
 * - losses decrease the score
 * - draws do not move the score
 */
function buildDailyResultRatio(games: DashboardGameRow[]): DashboardDailyResultRatioPoint[] {
	const counters = new Map<
		string,
		{
			wins: number;
			draws: number;
			losses: number;
		}
	>();

	for (const game of games) {
		const date = toLocalCalendarDate(game.playedAt);
		const current = counters.get(date) ?? { wins: 0, draws: 0, losses: 0 };

		if (game.myResultKey === 1) {
			current.wins += 1;
		} else if (game.myResultKey === -1) {
			current.losses += 1;
		} else {
			current.draws += 1;
		}

		counters.set(date, current);
	}

	return [...counters.entries()]
		.sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
		.map(([date, value]) => {
			const score = value.wins - value.losses;
			const decisiveGames = value.wins + value.losses;

			return {
				date,
				wins: value.wins,
				draws: value.draws,
				losses: value.losses,
				score,
				decisiveGames,
				ratio: decisiveGames > 0 ? roundRatio(score / decisiveGames) : 0,
			};
		});
}

/**
 * Build one Dashboard block per account that has games in the selected period.
 */
function buildAccountBlocks(games: DashboardGameRow[]): DashboardAccountBlock[] {
	const accounts = new Map<string, DashboardAccountAccumulator>();

	for (const game of games) {
		const accountId = game.accountConfigId;
		const current =
			accounts.get(accountId) ??
			({
				accountId,
				site: toExternalSite(game.accountConfig.site),
				username: game.accountConfig.username,
				games: [],
			} satisfies DashboardAccountAccumulator);

		current.games.push(game);
		accounts.set(accountId, current);
	}

	return [...accounts.values()]
		.sort((accountA, accountB) => {
			const siteCompare = String(accountA.site).localeCompare(String(accountB.site));

			if (siteCompare !== 0) {
				return siteCompare;
			}

			return accountA.username.localeCompare(accountB.username);
		})
		.map((account) => ({
			accountId: account.accountId,
			site: account.site,
			username: account.username,
			summary: buildSummaryStats(account.games),
			speeds: buildSpeedBlocks(account.games),
		}));
}

/**
 * Build speed blocks for one account.
 *
 * Empty speeds are not returned.
 */
function buildSpeedBlocks(games: DashboardGameRow[]): DashboardSpeedBlock[] {
	const speedGroups = new Map<DashboardGameSpeed, DashboardGameRow[]>();

	for (const game of games) {
		const speed = toDashboardSpeed(game.speed);

		if (speed === null) {
			continue;
		}

		const current = speedGroups.get(speed) ?? [];
		current.push(game);
		speedGroups.set(speed, current);
	}

	return DASHBOARD_SPEED_ORDER.flatMap((speed) => {
		const speedGames = speedGroups.get(speed) ?? [];

		if (speedGames.length === 0) {
			return [];
		}

		return [
			{
				speed,
				summary: buildSummaryStats(speedGames),
				dailyActivity: buildDailyActivity(speedGames),
				dailyResultRatio: buildDailyResultRatio(speedGames),
				eloHistory: buildEloHistory(speedGames),
			},
		];
	});
}

/**
 * Build chronological Elo history for one account and speed.
 *
 * Games without owner Elo are ignored.
 */
function buildEloHistory(games: DashboardGameRow[]): DashboardEloPoint[] {
	return games
		.filter((game) => game.myElo !== null)
		.map((game) => ({
			gameId: game.id,
			playedAtIso: game.playedAt.toISOString(),
			date: toLocalCalendarDate(game.playedAt),
			elo: game.myElo as number,
		}));
}

/**
 * Convert Prisma external site enum values to core public site values.
 */
function toExternalSite(value: PrismaExternalSite): ExternalSite {
	switch (value) {
		case 'LICHESS':
			return ExternalSite.LICHESS;

		case 'CHESSCOM':
			return ExternalSite.CHESSCOM;
	}
}

/**
 * Convert Prisma speed enum values to Dashboard public speed values.
 */
function toDashboardSpeed(value: PrismaGameSpeed): DashboardGameSpeed | null {
	switch (value) {
		case 'BULLET':
			return 'bullet';

		case 'BLITZ':
			return 'blitz';

		case 'RAPID':
			return 'rapid';

		case 'CLASSICAL':
		default:
			return null;
	}
}

/**
 * Convert an ISO string to a valid Date instance.
 */
function parseIsoDate(value: string): Date | null {
	const date = new Date(value);

	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Convert a Date to a local calendar date in YYYY-MM-DD format.
 *
 * This intentionally uses local time so daily buckets align with the user's
 * local date boundaries used by the shared filter query mapper.
 */
function toLocalCalendarDate(value: Date): string {
	return [
		String(value.getFullYear()).padStart(4, '0'),
		String(value.getMonth() + 1).padStart(2, '0'),
		String(value.getDate()).padStart(2, '0'),
	].join('-');
}

/**
 * Convert a count into a percentage with two decimals.
 */
function toPercent(value: number, total: number): number {
	if (total <= 0) {
		return 0;
	}

	return Number(((value / total) * 100).toFixed(2));
}

/**
 * Round normalized result ratios to four decimals.
 */
function roundRatio(value: number): number {
	return Number(value.toFixed(4));
}
