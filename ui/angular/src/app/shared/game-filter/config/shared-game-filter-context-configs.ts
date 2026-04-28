import type {
	SharedGameFilterContext,
	SharedGameFilterContextConfig,
	SharedGameFilterFieldKey,
} from 'my-chess-opening-core/filters';
import { SHARED_GAME_FILTER_FIELD_KEYS } from 'my-chess-opening-core/filters';

/**
 * Shared game filter base configuration by usage context.
 *
 * Notes:
 * - "default" keeps the core global defaults
 * - "games" starts broader by default:
 *   - no game speed restriction
 *   - rated and casual included
 * - "export" hides fields not used by the export feature
 * - "my-next-moves" only keeps fields that are meaningful for
 *   position-based move statistics
 * - "dashboard" only keeps period fields in V1.12
 *
 * V1.13 games rules:
 * - hide rating difference fields for now
 * - the current DB can provide both player ratings, but the Games list query
 *   does not yet filter on the computed playerRating - opponentRating value
 */
const GAMES_HIDDEN_FIELDS = new Set<SharedGameFilterFieldKey>(['ratingDiffMin', 'ratingDiffMax']);

const GAMES_VISIBLE_FIELDS = SHARED_GAME_FILTER_FIELD_KEYS.filter(
	(fieldKey) => !GAMES_HIDDEN_FIELDS.has(fieldKey),
);

/**
 * V1.8 export rules:
 * - hide rated mode
 * - hide opponent rating fields
 * - hide rating difference fields
 */
const EXPORT_HIDDEN_FIELDS = new Set<SharedGameFilterFieldKey>([
	'ratedMode',
	'opponentRatingMin',
	'opponentRatingMax',
	'ratingDiffMin',
	'ratingDiffMax',
]);

const EXPORT_VISIBLE_FIELDS = SHARED_GAME_FILTER_FIELD_KEYS.filter(
	(fieldKey) => !EXPORT_HIDDEN_FIELDS.has(fieldKey),
);

/**
 * V1.9 my-next-moves rules:
 * - only keep fields that actually affect the position-based stats query
 * - all other fields stay hidden and must not be applied
 */
const MY_NEXT_MOVES_VISIBLE_FIELDS: SharedGameFilterFieldKey[] = [
	'periodPreset',
	'datePlayedFrom',
	'datePlayedTo',
	'playedColor',
	'playerResult',
	'gameSpeeds',
	'platforms',
	'playerRatingMin',
	'playerRatingMax',
];

const DASHBOARD_VISIBLE_FIELDS: SharedGameFilterFieldKey[] = [
	'periodPreset',
	'datePlayedFrom',
	'datePlayedTo',
];

export const SHARED_GAME_FILTER_CONTEXT_CONFIGS: Record<
	SharedGameFilterContext,
	SharedGameFilterContextConfig
> = {
	default: {},
	games: {
		defaultValueOverrides: {
			gameSpeeds: [],
			ratedMode: 'both',
		},
		visibleFields: GAMES_VISIBLE_FIELDS,
	},
	export: {
		defaultValueOverrides: {
			gameSpeeds: [],
		},
		visibleFields: EXPORT_VISIBLE_FIELDS,
	},
	'my-next-moves': {
		visibleFields: MY_NEXT_MOVES_VISIBLE_FIELDS,
	},
	dashboard: {
		/**
		 * Dashboard only exposes date fields in V1.12.
		 *
		 * Hidden filter fields must stay neutral so that persisted dashboard
		 * filters never accidentally apply speed or rated restrictions later.
		 */
		defaultValueOverrides: {
			periodPreset: 'all',
			gameSpeeds: [],
			ratedMode: 'both',
		},
		visibleFields: DASHBOARD_VISIBLE_FIELDS,
	},
};
