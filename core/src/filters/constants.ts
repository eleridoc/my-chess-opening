/**
 * Shared game filter runtime constants.
 *
 * These arrays are the single source of truth for:
 * - UI option generation
 * - future validation helpers
 * - context configuration
 */

export const SHARED_GAME_FILTER_CONTEXTS = ['default', 'games', 'export', 'my-next-moves'] as const;

export const SHARED_GAME_FILTER_PERIOD_PRESETS = [
	'all',
	'today',
	'last7Days',
	'last30Days',
	'thisMonth',
	'last3Months',
	'last6Months',
	'last12Months',
	'thisYear',
	'custom',
] as const;

export const SHARED_GAME_FILTER_PLAYED_COLORS = ['both', 'white', 'black'] as const;

export const SHARED_GAME_FILTER_PLAYER_RESULTS = ['all', 'win', 'loss', 'draw'] as const;

export const SHARED_GAME_FILTER_RATED_MODES = ['ratedOnly', 'casualOnly', 'both'] as const;

export const SHARED_GAME_FILTER_GAME_SPEEDS = ['bullet', 'blitz', 'rapid'] as const;

export const SHARED_GAME_FILTER_PLATFORMS = ['lichess', 'chessCom', 'other'] as const;

export const SHARED_GAME_FILTER_FIELD_KEYS = [
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
	'opponentRatingMin',
	'opponentRatingMax',
	'ratingDiffMin',
	'ratingDiffMax',
	'playerTextSearch',
] as const;
