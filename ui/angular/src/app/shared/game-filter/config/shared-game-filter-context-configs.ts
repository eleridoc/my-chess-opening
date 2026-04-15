import type {
	SharedGameFilterContext,
	SharedGameFilterContextConfig,
} from 'my-chess-opening-core/filters';

/**
 * Shared game filter base configuration by usage context.
 *
 * Notes:
 * - "default" keeps the core global defaults
 * - "games" and "export" start broader by default:
 *   - no game speed restriction
 *   - rated and casual included
 * - "my-next-moves" keeps the focused global defaults for now
 *
 * Visibility is not restricted yet. This will remain easy to refine later when
 * the dedicated UI integrations are introduced.
 */
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
			ratedMode: 'both',
		},
	},
	'my-next-moves': {},
};
