import type {
	ExternalSite as PrismaExternalSite,
	GameSpeed as PrismaGameSpeed,
} from '@prisma/client';

import { ExternalSite } from 'my-chess-opening-core';

import type {
	DashboardAccountBlock,
	DashboardDailyActivityPoint,
	DashboardDailyResultRatioCalValue,
	DashboardDailyResultRatioPoint,
	DashboardEloPoint,
	DashboardGameSpeed,
	DashboardGlobalBlock,
	DashboardSpeedBlock,
	DashboardSummaryStats,
	DashboardPlayedDateRange,
} from 'my-chess-opening-core';

/**
 * Prisma speeds included in the Dashboard V1.12 scope.
 *
 * Classical games are intentionally excluded from the first Dashboard version.
 */
export const DASHBOARD_PRISMA_SPEEDS: PrismaGameSpeed[] = ['BULLET', 'BLITZ', 'RAPID'];

/**
 * Public Dashboard speed display order.
 */
const DASHBOARD_SPEED_ORDER: DashboardGameSpeed[] = ['bullet', 'blitz', 'rapid'];

/**
 * Prisma row shape used by the Dashboard aggregation layer.
 *
 * Keep this intentionally small:
 * the Dashboard V1.12 only needs dates, result, speed, Elo and account metadata.
 */
export interface DashboardGameRow {
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
 * Dashboard overview blocks computed from already-filtered games.
 */
export interface DashboardOverviewBlocks {
	global: DashboardGlobalBlock;
	accounts: DashboardAccountBlock[];
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

/**
 * Build all Dashboard overview blocks from the filtered game list.
 *
 * The IPC layer is responsible for:
 * - validating / normalizing filters
 * - querying Prisma
 *
 * This aggregation layer is responsible for:
 * - global statistics
 * - daily activity
 * - daily result ratio
 * - per-account blocks
 * - per-speed blocks
 * - Elo history
 */
export function buildDashboardOverviewBlocks(
	games: DashboardGameRow[],
	playedDateRange: DashboardPlayedDateRange,
): DashboardOverviewBlocks {
	return {
		global: {
			summary: buildSummaryStats(games),
			dailyActivity: buildDailyActivity(games, playedDateRange),
			dailyResultRatio: buildDailyResultRatio(games, playedDateRange),
		},
		accounts: buildAccountBlocks(games, playedDateRange),
	};
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
function buildDailyActivity(
	games: DashboardGameRow[],
	playedDateRange: DashboardPlayedDateRange,
): DashboardDailyActivityPoint[] {
	const counters = new Map<string, number>();
	const calendarRange = resolveDailyActivityDateRange(games, playedDateRange);

	/**
	 * Initialize every day from the selected period with zero games.
	 *
	 * This makes the frontend receive explicit zero-value days instead of
	 * relying on cal-heatmap default empty cells.
	 */
	if (calendarRange !== null) {
		for (const date of enumerateCalendarDates(calendarRange.from, calendarRange.to)) {
			counters.set(date, 0);
		}
	}

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
function buildDailyResultRatio(
	games: DashboardGameRow[],
	playedDateRange: DashboardPlayedDateRange,
): DashboardDailyResultRatioPoint[] {
	const counters = new Map<
		string,
		{
			wins: number;
			draws: number;
			losses: number;
		}
	>();

	const calendarRange = resolveDailyActivityDateRange(games, playedDateRange);

	/**
	 * Initialize every day from the selected period with zero results.
	 *
	 * This makes the frontend receive an explicit "no games" value for the
	 * result-ratio heatmap instead of relying on cal-heatmap empty cells.
	 */
	if (calendarRange !== null) {
		for (const date of enumerateCalendarDates(calendarRange.from, calendarRange.to)) {
			counters.set(date, { wins: 0, draws: 0, losses: 0 });
		}
	}

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
			const totalGames = value.wins + value.draws + value.losses;
			const ratio = decisiveGames > 0 ? roundRatio(score / decisiveGames) : 0;

			return {
				date,
				wins: value.wins,
				draws: value.draws,
				losses: value.losses,
				score,
				decisiveGames,
				ratio,
				val: buildDailyResultRatioCalValue(totalGames, score),
			};
		});
}

function buildDailyResultRatioCalValue(
	totalGames: number,
	score: number,
): DashboardDailyResultRatioCalValue {
	if (totalGames <= 0) {
		return 0;
	}

	if (score > 0) {
		return 1;
	}

	if (score < 0) {
		return 4;
	}

	return 2;
}

/**
 * Build one Dashboard block per account that has games in the selected period.
 */
function buildAccountBlocks(
	games: DashboardGameRow[],
	playedDateRange: DashboardPlayedDateRange,
): DashboardAccountBlock[] {
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
			speeds: buildSpeedBlocks(account.games, playedDateRange),
		}));
}

/**
 * Build speed blocks for one account.
 *
 * Empty speeds are not returned.
 */
function buildSpeedBlocks(
	games: DashboardGameRow[],
	playedDateRange: DashboardPlayedDateRange,
): DashboardSpeedBlock[] {
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
				dailyActivity: buildDailyActivity(speedGames, playedDateRange),
				dailyResultRatio: buildDailyResultRatio(speedGames, playedDateRange),
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
		.filter((game): game is DashboardGameRow & { myElo: number } => game.myElo !== null)
		.map((game) => ({
			gameId: game.id,
			playedAtIso: game.playedAt.toISOString(),
			date: toLocalCalendarDate(game.playedAt),
			elo: game.myElo,
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

		default:
			throw new Error(`Unsupported external site for Dashboard: ${String(value)}`);
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

interface DashboardCalendarDateRange {
	from: string;
	to: string;
}

/**
 * Resolve the date range used to fill daily activity with zero-value days.
 *
 * Priority:
 * - use the backend-resolved filter period when both bounds exist
 * - fallback to the min/max game dates when the filter is open-ended
 */
function resolveDailyActivityDateRange(
	games: DashboardGameRow[],
	playedDateRange: DashboardPlayedDateRange,
): DashboardCalendarDateRange | null {
	const gameDates = games.map((game) => toLocalCalendarDate(game.playedAt)).sort();

	const from = playedDateRange.from ?? gameDates[0] ?? null;
	const to = playedDateRange.to ?? gameDates[gameDates.length - 1] ?? null;

	if (!from || !to) {
		return null;
	}

	const fromDate = parseCalendarDateToUtcDate(from);
	const toDate = parseCalendarDateToUtcDate(to);

	if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) {
		return null;
	}

	return {
		from,
		to,
	};
}

/**
 * Enumerate all calendar dates in an inclusive YYYY-MM-DD range.
 */
function enumerateCalendarDates(from: string, to: string): string[] {
	const start = parseCalendarDateToUtcDate(from);
	const end = parseCalendarDateToUtcDate(to);

	if (!start || !end || start.getTime() > end.getTime()) {
		return [];
	}

	const dates: string[] = [];
	const current = new Date(start);

	/**
	 * Safety guard to avoid accidental huge loops if a future filter allows
	 * extremely large open-ended ranges.
	 */
	const maxDays = 5000;

	while (current.getTime() <= end.getTime() && dates.length < maxDays) {
		dates.push(formatUtcCalendarDate(current));
		current.setUTCDate(current.getUTCDate() + 1);
	}

	return dates;
}

/**
 * Parse YYYY-MM-DD as a UTC calendar date.
 */
function parseCalendarDateToUtcDate(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

	if (!match) {
		return null;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);

	const date = new Date(Date.UTC(year, month - 1, day));

	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}

	return date;
}

/**
 * Format a UTC Date as YYYY-MM-DD.
 */
function formatUtcCalendarDate(value: Date): string {
	return [
		String(value.getUTCFullYear()).padStart(4, '0'),
		String(value.getUTCMonth() + 1).padStart(2, '0'),
		String(value.getUTCDate()).padStart(2, '0'),
	].join('-');
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
