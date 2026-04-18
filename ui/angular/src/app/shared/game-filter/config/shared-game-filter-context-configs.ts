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
 *
 * V1.8 export rules:
 * - hide rated mode
 * - hide opponent rating fields
 * - hide rating difference fields
 *
 * V1.9 my-next-moves rules:
 * - only keep fields that actually affect the position-based stats query
 * - all other fields stay hidden and must not be applied
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
};
