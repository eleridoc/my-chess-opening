import { SHARED_GAME_FILTER_FIELD_KEYS } from './constants';
import type {
	SharedGameFilter,
	SharedGameFilterContextConfig,
	SharedGameFilterFieldKey,
} from './types';

/**
 * Global shared filter defaults.
 *
 * Notes:
 * - periodPreset "all" means no played date restriction
 * - platforms [] means "all platforms / no platform restriction"
 * - gameSpeeds starts with ["rapid"] by product decision
 */
export const DEFAULT_SHARED_GAME_FILTER: SharedGameFilter = {
	periodPreset: 'all',
	datePlayedFrom: null,
	datePlayedTo: null,
	playedColor: 'both',
	playerResult: 'all',
	gameSpeeds: ['rapid'],
	ratedMode: 'ratedOnly',
	platforms: [],
	ecoCodeExact: '',
	openingNameContains: '',
	gameIdExact: '',
	playerRatingMin: null,
	playerRatingMax: null,
	opponentRatingMin: null,
	opponentRatingMax: null,
	ratingDiffMin: null,
	ratingDiffMax: null,
	playerTextSearch: '',
};

/**
 * Default visible fields for a generic/shared usage.
 */
export const DEFAULT_SHARED_GAME_FILTER_VISIBLE_FIELDS: SharedGameFilterFieldKey[] = [
	...SHARED_GAME_FILTER_FIELD_KEYS,
];

/**
 * Default context configuration fallback.
 */
export const DEFAULT_SHARED_GAME_FILTER_CONTEXT_CONFIG: SharedGameFilterContextConfig = {
	visibleFields: DEFAULT_SHARED_GAME_FILTER_VISIBLE_FIELDS,
	defaultValueOverrides: {},
};
