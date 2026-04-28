import { SHARED_GAME_FILTER_FIELD_KEYS } from 'my-chess-opening-core';

import type {
	SharedGameFilterContextConfig,
	SharedGameFilterFieldKey,
} from 'my-chess-opening-core';

/**
 * Backend shared filter configuration for the Games page.
 *
 * Important:
 * - The backend must not trust the renderer to hide fields correctly.
 * - Hidden fields are stripped again here before any DB query is built.
 * - Rating difference is intentionally excluded from the Games page.
 *
 * Reason:
 * ratingDiffMin / ratingDiffMax mean playerRating - opponentRating.
 * The current Games query deliberately does not filter on this computed value.
 */
const GAMES_UNSUPPORTED_FIELDS = new Set<SharedGameFilterFieldKey>([
	'ratingDiffMin',
	'ratingDiffMax',
]);

const GAMES_VISIBLE_FIELDS = SHARED_GAME_FILTER_FIELD_KEYS.filter(
	(fieldKey) => !GAMES_UNSUPPORTED_FIELDS.has(fieldKey),
);

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
 * Backend shared filter configuration for the Games page.
 *
 * Defaults are aligned with the Angular "games" context:
 * - no speed restriction by default
 * - rated and casual games included by default
 */
export const GAMES_SHARED_GAME_FILTER_CONTEXT_CONFIG: SharedGameFilterContextConfig = {
	defaultValueOverrides: {
		gameSpeeds: [],
		ratedMode: 'both',
	},
	visibleFields: GAMES_VISIBLE_FIELDS,
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
