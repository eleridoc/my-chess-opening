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
 * - "my-next-moves" keeps the focused global defaults for now
 *
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
	'my-next-moves': {},
};
