import {
	SHARED_GAME_FILTER_FIELD_KEYS,
	SHARED_GAME_FILTER_GAME_SPEEDS,
	SHARED_GAME_FILTER_PERIOD_PRESETS,
	SHARED_GAME_FILTER_PLATFORMS,
	SHARED_GAME_FILTER_PLAYED_COLORS,
	SHARED_GAME_FILTER_PLAYER_RESULTS,
	SHARED_GAME_FILTER_RATED_MODES,
} from './constants';
import {
	DEFAULT_SHARED_GAME_FILTER,
	DEFAULT_SHARED_GAME_FILTER_CONTEXT_CONFIG,
	DEFAULT_SHARED_GAME_FILTER_VISIBLE_FIELDS,
} from './defaults';
import type {
	SharedGameFilter,
	SharedGameFilterContextConfig,
	SharedGameFilterFieldKey,
	SharedGameFilterGameSpeed,
	SharedGameFilterPlatform,
} from './types';

/**
 * Create a new shared game filter instance based on the global defaults.
 *
 * Arrays are cloned to guarantee that callers never mutate the exported
 * default object by reference.
 */
export function createDefaultSharedGameFilter(): SharedGameFilter {
	return {
		...DEFAULT_SHARED_GAME_FILTER,
		gameSpeeds: [...DEFAULT_SHARED_GAME_FILTER.gameSpeeds],
		platforms: [...DEFAULT_SHARED_GAME_FILTER.platforms],
	};
}

/**
 * Build the default shared game filter for a specific context configuration.
 *
 * Context overrides are layered on top of the global defaults, then normalized
 * to guarantee a canonical filter object.
 */
export function getDefaultSharedGameFilterForContext(
	config?: SharedGameFilterContextConfig | null,
): SharedGameFilter {
	const baseDefaults = createDefaultSharedGameFilter();

	if (config?.defaultValueOverrides === undefined) {
		return baseDefaults;
	}

	return normalizeSharedGameFilter({
		...baseDefaults,
		...config.defaultValueOverrides,
	});
}

/**
 * Normalize a shared game filter text value.
 *
 * Rules:
 * - non-string values become an empty string
 * - surrounding spaces are trimmed
 */
export function normalizeSharedGameFilterText(value: unknown): string {
	if (typeof value !== 'string') {
		return '';
	}

	return value.trim();
}

/**
 * Normalize an exact ECO code filter value.
 *
 * Rules:
 * - reuses generic text normalization
 * - converts the result to uppercase
 */
export function normalizeSharedGameFilterEcoCode(value: unknown): string {
	return normalizeSharedGameFilterText(value).toUpperCase();
}

/**
 * Normalize a shared multi-select value against an allowed ordered list.
 *
 * Rules:
 * - non-array values become an empty array
 * - unknown values are removed
 * - duplicates are removed
 * - the result follows the official allowed values order
 */
function normalizeSharedGameFilterMultiSelect<
	TAllowed extends readonly string[],
	TValue extends TAllowed[number],
>(value: unknown, allowedValues: TAllowed): TValue[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const rawValues = new Set(
		value.filter((item): item is TValue => typeof item === 'string') as TValue[],
	);

	return allowedValues.filter((allowedValue): allowedValue is TValue =>
		rawValues.has(allowedValue as TValue),
	);
}

/**
 * Normalize selected game speeds.
 */
export function normalizeSharedGameFilterGameSpeeds(value: unknown): SharedGameFilterGameSpeed[] {
	return normalizeSharedGameFilterMultiSelect<
		typeof SHARED_GAME_FILTER_GAME_SPEEDS,
		SharedGameFilterGameSpeed
	>(value, SHARED_GAME_FILTER_GAME_SPEEDS);
}

/**
 * Normalize selected source platforms.
 */
export function normalizeSharedGameFilterPlatforms(value: unknown): SharedGameFilterPlatform[] {
	return normalizeSharedGameFilterMultiSelect<
		typeof SHARED_GAME_FILTER_PLATFORMS,
		SharedGameFilterPlatform
	>(value, SHARED_GAME_FILTER_PLATFORMS);
}

/**
 * Normalize a local calendar date string used by the filter form.
 *
 * Expected format:
 * - YYYY-MM-DD
 *
 * Invalid or unsupported values become null.
 */
function normalizeSharedGameFilterDate(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmedValue = value.trim();

	if (trimmedValue === '') {
		return null;
	}

	return /^\d{4}-\d{2}-\d{2}$/.test(trimmedValue) ? trimmedValue : null;
}

/**
 * Normalize a numeric filter bound.
 *
 * Invalid values become null.
 */
function normalizeSharedGameFilterNumber(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return null;
	}

	return value;
}

/**
 * Normalize a single-select enum value against an allowed list.
 *
 * Invalid values fall back to the provided default.
 */
function normalizeSharedGameFilterEnum<TAllowed extends readonly string[]>(
	value: unknown,
	allowedValues: TAllowed,
	fallbackValue: TAllowed[number],
): TAllowed[number] {
	if (typeof value !== 'string') {
		return fallbackValue;
	}

	return allowedValues.includes(value) ? value : fallbackValue;
}

/**
 * Check whether a value is a plain object-like record.
 */
function isSharedGameFilterRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalize a shared game filter input into a full canonical filter object.
 *
 * Rules:
 * - starts from the global defaults
 * - invalid enums fall back to defaults
 * - invalid text values become empty strings
 * - invalid date values become null
 * - invalid numeric values become null
 * - multi-select values are cleaned, deduplicated, and ordered
 *
 * Notes:
 * - missing gameSpeeds falls back to the default ["rapid"]
 * - missing platforms falls back to the default [] meaning "all platforms"
 * - this helper does not yet apply visibility or business validation rules
 */
export function normalizeSharedGameFilter(value: unknown): SharedGameFilter {
	const defaults = createDefaultSharedGameFilter();

	if (!isSharedGameFilterRecord(value)) {
		return defaults;
	}

	const hasOwn = (key: keyof SharedGameFilter): boolean =>
		Object.prototype.hasOwnProperty.call(value, key);

	return {
		periodPreset: normalizeSharedGameFilterEnum(
			value.periodPreset,
			SHARED_GAME_FILTER_PERIOD_PRESETS,
			defaults.periodPreset,
		),
		datePlayedFrom: normalizeSharedGameFilterDate(value.datePlayedFrom),
		datePlayedTo: normalizeSharedGameFilterDate(value.datePlayedTo),
		playedColor: normalizeSharedGameFilterEnum(
			value.playedColor,
			SHARED_GAME_FILTER_PLAYED_COLORS,
			defaults.playedColor,
		),
		playerResult: normalizeSharedGameFilterEnum(
			value.playerResult,
			SHARED_GAME_FILTER_PLAYER_RESULTS,
			defaults.playerResult,
		),
		gameSpeeds: hasOwn('gameSpeeds')
			? normalizeSharedGameFilterGameSpeeds(value.gameSpeeds)
			: [...defaults.gameSpeeds],
		ratedMode: normalizeSharedGameFilterEnum(
			value.ratedMode,
			SHARED_GAME_FILTER_RATED_MODES,
			defaults.ratedMode,
		),
		platforms: hasOwn('platforms')
			? normalizeSharedGameFilterPlatforms(value.platforms)
			: [...defaults.platforms],
		ecoCodeExact: normalizeSharedGameFilterEcoCode(value.ecoCodeExact),
		openingNameContains: normalizeSharedGameFilterText(value.openingNameContains),
		gameIdExact: normalizeSharedGameFilterText(value.gameIdExact),
		playerRatingMin: normalizeSharedGameFilterNumber(value.playerRatingMin),
		playerRatingMax: normalizeSharedGameFilterNumber(value.playerRatingMax),
		opponentRatingMin: normalizeSharedGameFilterNumber(value.opponentRatingMin),
		opponentRatingMax: normalizeSharedGameFilterNumber(value.opponentRatingMax),
		ratingDiffMin: normalizeSharedGameFilterNumber(value.ratingDiffMin),
		ratingDiffMax: normalizeSharedGameFilterNumber(value.ratingDiffMax),
		playerTextSearch: normalizeSharedGameFilterText(value.playerTextSearch),
	};
}

/**
 * Resolve the visible field keys for a given context configuration.
 *
 * Rules:
 * - when visibleFields is undefined, fallback to the global default visibility
 * - when visibleFields is provided, normalize it against the official field key list
 * - the returned order always follows the official field key order
 */
export function getVisibleSharedGameFilterFields(
	config?: SharedGameFilterContextConfig | null,
): SharedGameFilterFieldKey[] {
	if (config?.visibleFields === undefined) {
		return [...DEFAULT_SHARED_GAME_FILTER_VISIBLE_FIELDS];
	}

	return normalizeSharedGameFilterMultiSelect<
		typeof SHARED_GAME_FILTER_FIELD_KEYS,
		SharedGameFilterFieldKey
	>(config.visibleFields, SHARED_GAME_FILTER_FIELD_KEYS);
}

/**
 * Check whether a shared game filter field is visible for a given context configuration.
 */
export function isSharedGameFilterFieldVisible(
	fieldKey: SharedGameFilterFieldKey,
	config?: SharedGameFilterContextConfig | null,
): boolean {
	return getVisibleSharedGameFilterFields(config).includes(fieldKey);
}

/**
 * Strip values coming from hidden fields and restore the context defaults instead.
 *
 * Rules:
 * - the input filter is normalized first
 * - only visible fields are kept from the normalized filter
 * - hidden fields fall back to the defaults resolved for the provided context
 */
export function stripHiddenSharedGameFilterFields(
	value: unknown,
	config?: SharedGameFilterContextConfig | null,
): SharedGameFilter {
	const normalizedFilter = normalizeSharedGameFilter(value);
	const contextDefaults = getDefaultSharedGameFilterForContext(
		config ?? DEFAULT_SHARED_GAME_FILTER_CONTEXT_CONFIG,
	);
	const visibleFields = getVisibleSharedGameFilterFields(config);

	const visibleFieldValues = Object.fromEntries(
		visibleFields.map((fieldKey) => [fieldKey, normalizedFilter[fieldKey]]),
	) as Partial<SharedGameFilter>;

	return normalizeSharedGameFilter({
		...contextDefaults,
		...visibleFieldValues,
	});
}

/**
 * Compare two shared game filter field values.
 *
 * Arrays are compared by ordered content because multi-select normalization
 * already guarantees a stable canonical order.
 */
function areSharedGameFilterFieldValuesEqual(
	fieldKey: SharedGameFilterFieldKey,
	left: SharedGameFilter[SharedGameFilterFieldKey],
	right: SharedGameFilter[SharedGameFilterFieldKey],
): boolean {
	const leftValue = left;
	const rightValue = right;

	if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
		if (!Array.isArray(leftValue) || !Array.isArray(rightValue)) {
			return false;
		}

		if (leftValue.length !== rightValue.length) {
			return false;
		}

		return leftValue.every((value, index) => value === rightValue[index]);
	}

	return leftValue === rightValue;
}

/**
 * Count how many visible shared game filter fields are active compared to the
 * defaults resolved for the provided context.
 *
 * Rules:
 * - the input filter is normalized first
 * - hidden fields are stripped before comparison
 * - comparison is made against the context-aware defaults
 */
export function countActiveSharedGameFilterFields(
	value: unknown,
	config?: SharedGameFilterContextConfig | null,
): number {
	const visibleFields = getVisibleSharedGameFilterFields(config);
	const normalizedVisibleFilter = stripHiddenSharedGameFilterFields(value, config);
	const contextDefaults = stripHiddenSharedGameFilterFields(
		getDefaultSharedGameFilterForContext(config),
		config,
	);

	return visibleFields.reduce((count, fieldKey) => {
		return areSharedGameFilterFieldValuesEqual(
			fieldKey,
			normalizedVisibleFilter[fieldKey],
			contextDefaults[fieldKey],
		)
			? count
			: count + 1;
	}, 0);
}

/**
 * Check whether the shared game filter has at least one active visible field
 * compared to the defaults resolved for the provided context.
 */
export function hasActiveSharedGameFilter(
	value: unknown,
	config?: SharedGameFilterContextConfig | null,
): boolean {
	return countActiveSharedGameFilterFields(value, config) > 0;
}
