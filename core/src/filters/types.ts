import {
	SHARED_GAME_FILTER_CONTEXTS,
	SHARED_GAME_FILTER_FIELD_KEYS,
	SHARED_GAME_FILTER_GAME_SPEEDS,
	SHARED_GAME_FILTER_PERIOD_PRESETS,
	SHARED_GAME_FILTER_PLATFORMS,
	SHARED_GAME_FILTER_PLAYED_COLORS,
	SHARED_GAME_FILTER_PLAYER_RESULTS,
	SHARED_GAME_FILTER_RATED_MODES,
} from './constants';

export type SharedGameFilterContext = (typeof SHARED_GAME_FILTER_CONTEXTS)[number];

export type SharedGameFilterPeriodPreset = (typeof SHARED_GAME_FILTER_PERIOD_PRESETS)[number];

export type SharedGameFilterPlayedColor = (typeof SHARED_GAME_FILTER_PLAYED_COLORS)[number];

export type SharedGameFilterPlayerResult = (typeof SHARED_GAME_FILTER_PLAYER_RESULTS)[number];

export type SharedGameFilterRatedMode = (typeof SHARED_GAME_FILTER_RATED_MODES)[number];

export type SharedGameFilterGameSpeed = (typeof SHARED_GAME_FILTER_GAME_SPEEDS)[number];

export type SharedGameFilterPlatform = (typeof SHARED_GAME_FILTER_PLATFORMS)[number];

export type SharedGameFilterFieldKey = (typeof SHARED_GAME_FILTER_FIELD_KEYS)[number];

/**
 * Shared game filter state used across the app.
 *
 * This is the canonical contract for the reusable filter component and for
 * future mapping helpers that will transform UI state into query inputs.
 */
export interface SharedGameFilter {
	/**
	 * Selected period preset.
	 * When the preset is not "custom", date bounds are ignored by the applied filter.
	 */
	periodPreset: SharedGameFilterPeriodPreset;

	/**
	 * Local calendar date string in YYYY-MM-DD format.
	 * Mapping helpers will later convert this value to ISO 8601 UTC bounds.
	 */
	datePlayedFrom: string | null;

	/**
	 * Local calendar date string in YYYY-MM-DD format.
	 * Mapping helpers will later convert this value to ISO 8601 UTC bounds.
	 */
	datePlayedTo: string | null;

	/** Owner perspective color filter. */
	playedColor: SharedGameFilterPlayedColor;

	/** Owner perspective result filter. */
	playerResult: SharedGameFilterPlayerResult;

	/**
	 * Selected game speeds.
	 * The global default keeps "rapid" selected.
	 */
	gameSpeeds: SharedGameFilterGameSpeed[];

	/** Rated / casual selection. */
	ratedMode: SharedGameFilterRatedMode;

	/**
	 * Selected source platforms.
	 * An empty array means "all platforms / no platform restriction".
	 */
	platforms: SharedGameFilterPlatform[];

	/** Exact ECO code filter. */
	ecoCodeExact: string;

	/** Partial opening name filter. */
	openingNameContains: string;

	/** Exact internal/provider game id filter. */
	gameIdExact: string;

	/** Owner/player rating lower bound. */
	playerRatingMin: number | null;

	/** Owner/player rating upper bound. */
	playerRatingMax: number | null;

	/** Opponent rating lower bound. */
	opponentRatingMin: number | null;

	/** Opponent rating upper bound. */
	opponentRatingMax: number | null;

	/**
	 * Rating difference lower bound.
	 * The intended business meaning is: playerRating - opponentRating.
	 */
	ratingDiffMin: number | null;

	/**
	 * Rating difference upper bound.
	 * The intended business meaning is: playerRating - opponentRating.
	 */
	ratingDiffMax: number | null;

	/** Partial player text search. */
	playerTextSearch: string;
}

/**
 * Field visibility configuration used by each filter context.
 */
export type SharedGameFilterVisibleFields = ReadonlyArray<SharedGameFilterFieldKey>;

/**
 * Context-specific overrides layered on top of the global defaults.
 */
export type SharedGameFilterDefaultOverrides = Partial<SharedGameFilter>;

/**
 * Configuration contract for a specific filter context.
 *
 * - visibleFields: fields rendered and eligible to be applied
 * - defaultValueOverrides: context-specific defaults layered on top of the global defaults
 */
export interface SharedGameFilterContextConfig {
	visibleFields?: SharedGameFilterVisibleFields;
	defaultValueOverrides?: SharedGameFilterDefaultOverrides;
}
