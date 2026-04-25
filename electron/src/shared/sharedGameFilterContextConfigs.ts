import type { SharedGameFilterContextConfig } from 'my-chess-opening-core';

/**
 * Backend shared filter configuration for the "my next moves" feature.
 *
 * Important:
 * - The backend must not trust the renderer to hide fields correctly.
 * - Hidden fields are stripped again here before any DB query is built.
 * - Only fields that actually impact position-based move statistics are kept.
 */
export const MY_NEXT_MOVES_SHARED_GAME_FILTER_CONTEXT_CONFIG: SharedGameFilterContextConfig = {
	visibleFields: [
		'periodPreset',
		'datePlayedFrom',
		'datePlayedTo',
		'playedColor',
		'playerResult',
		'gameSpeeds',
		'platforms',
		'playerRatingMin',
		'playerRatingMax',
	],
};

/**
 * Backend shared filter configuration for the Dashboard feature.
 *
 * Important:
 * - The Dashboard V1.12 only filters by played dates.
 * - Hidden fields are stripped again here before any DB query is built.
 * - Hidden defaults are neutralized to avoid silently applying speed or rated filters.
 */
export const DASHBOARD_SHARED_GAME_FILTER_CONTEXT_CONFIG: SharedGameFilterContextConfig = {
	defaultValueOverrides: {
		periodPreset: 'last12Months',
		gameSpeeds: [],
		ratedMode: 'both',
	},
	visibleFields: ['periodPreset', 'datePlayedFrom', 'datePlayedTo'],
};
