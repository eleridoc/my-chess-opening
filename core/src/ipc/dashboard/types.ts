import type { SharedGameFilter } from '../../filters';
import type { ExternalSite, GameSpeed } from '../../import/types';

/**
 * Dashboard IPC contracts.
 *
 * This API is dedicated to the Dashboard page.
 *
 * Design goals:
 * - reuse the shared V1.7 game filter as input
 * - return the canonical filter snapshot actually applied by the backend
 * - keep the renderer focused on rendering, not on aggregating raw games
 * - expose global, per-account and per-speed dashboard blocks in one request
 *
 * Notes:
 * - Calendar dates use YYYY-MM-DD.
 * - Raw game timestamps use ISO 8601 strings.
 * - Percentages are numeric values in the range 0..100.
 * - Result stats are computed from the imported account owner's perspective.
 */

/**
 * Dashboard currently ignores classical games in V1.12.
 */
export type DashboardGameSpeed = Exclude<GameSpeed, 'classical'>;

/**
 * Input for loading the Dashboard overview.
 */
export interface DashboardOverviewInput {
	/**
	 * Current shared game filter snapshot coming from the UI.
	 *
	 * The backend is responsible for:
	 * - normalizing it
	 * - stripping hidden fields for the Dashboard context
	 * - applying the actual query rules
	 */
	filter: SharedGameFilter;
}

/**
 * Resolved played-date range actually used by the backend.
 *
 * Values are calendar dates in YYYY-MM-DD format.
 * Null means that the bound is open.
 */
export interface DashboardPlayedDateRange {
	from: string | null;
	to: string | null;
}

/**
 * Reusable summary statistics block.
 *
 * Counts and rates are computed from the account owner's perspective:
 * - wins = owner wins
 * - draws = drawn games
 * - losses = owner losses
 */
export interface DashboardSummaryStats {
	/** Total number of games matching the current scope. */
	totalGames: number;

	/** Owner wins. */
	wins: number;

	/** Drawn games. */
	draws: number;

	/** Owner losses. */
	losses: number;

	/** Owner win percentage in the range 0..100. */
	winRatePercent: number;

	/** Draw percentage in the range 0..100. */
	drawRatePercent: number;

	/** Owner loss percentage in the range 0..100. */
	lossRatePercent: number;
}

/**
 * One daily activity point for calendar heatmaps.
 */
export interface DashboardDailyActivityPoint {
	/** Calendar date in YYYY-MM-DD format. */
	date: string;

	/** Number of games played on this date. */
	gamesCount: number;
}

/**
 * One daily result-ratio point for calendar heatmaps.
 *
 * The ratio intentionally ignores draws:
 * - positive when wins > losses
 * - negative when losses > wins
 * - zero when wins === losses, or when there are only draws
 */
export interface DashboardDailyResultRatioPoint {
	/** Calendar date in YYYY-MM-DD format. */
	date: string;

	/** Owner wins on this date. */
	wins: number;

	/** Draws on this date. */
	draws: number;

	/** Owner losses on this date. */
	losses: number;

	/**
	 * Raw daily score.
	 *
	 * Example:
	 * - 3 wins, 1 loss => 2
	 * - 1 win, 3 losses => -2
	 * - 2 wins, 2 losses => 0
	 */
	score: number;

	/** Number of decisive games used for the normalized ratio. */
	decisiveGames: number;

	/**
	 * Normalized daily score in the range -1..1.
	 *
	 * Formula:
	 * decisiveGames > 0 ? (wins - losses) / decisiveGames : 0
	 */
	ratio: number;
}

/**
 * One Elo history point for a specific account and speed.
 */
export interface DashboardEloPoint {
	/** Game id from the local database. */
	gameId: string;

	/** Raw game timestamp as an ISO 8601 string. */
	playedAtIso: string;

	/** Calendar date in YYYY-MM-DD format, useful for labels/tooltips. */
	date: string;

	/** Owner Elo after / during the game, as imported from the provider. */
	elo: number;
}

/**
 * Dashboard block for one speed within one account.
 */
export interface DashboardSpeedBlock {
	/** Game speed. Classical is intentionally excluded from Dashboard V1.12. */
	speed: DashboardGameSpeed;

	/** Summary stats for this account and speed. */
	summary: DashboardSummaryStats;

	/** Daily game volume for this account and speed. */
	dailyActivity: DashboardDailyActivityPoint[];

	/** Daily result ratio for this account and speed. */
	dailyResultRatio: DashboardDailyResultRatioPoint[];

	/** Elo history for this account and speed. */
	eloHistory: DashboardEloPoint[];
}

/**
 * Dashboard block for one imported account.
 */
export interface DashboardAccountBlock {
	/** AccountConfig id from the local database. */
	accountId: string;

	/** External provider for this account. */
	site: ExternalSite;

	/** Username on the external provider. */
	username: string;

	/** Summary stats for this account. */
	summary: DashboardSummaryStats;

	/** Per-speed blocks. Empty speeds are not returned. */
	speeds: DashboardSpeedBlock[];
}

/**
 * Global Dashboard block across all included accounts and speeds.
 */
export interface DashboardGlobalBlock {
	/** Summary stats across the whole filtered Dashboard scope. */
	summary: DashboardSummaryStats;

	/** Daily game volume across the whole filtered Dashboard scope. */
	dailyActivity: DashboardDailyActivityPoint[];

	/** Daily result ratio across the whole filtered Dashboard scope. */
	dailyResultRatio: DashboardDailyResultRatioPoint[];
}

/**
 * Full Dashboard overview result.
 */
export interface DashboardOverviewResult {
	/** Canonical filter snapshot actually applied by the backend. */
	appliedFilter: SharedGameFilter;

	/** Resolved played-date range actually used by the backend. */
	playedDateRange: DashboardPlayedDateRange;

	/** Global Dashboard block. */
	global: DashboardGlobalBlock;

	/** Per-account Dashboard blocks. Accounts without data are not returned. */
	accounts: DashboardAccountBlock[];
}

/**
 * Dashboard domain API exposed over IPC.
 */
export interface DashboardApi {
	/**
	 * Load the full Dashboard overview for the provided filter.
	 */
	getOverview: (input: DashboardOverviewInput) => Promise<DashboardOverviewResult>;
}
