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
