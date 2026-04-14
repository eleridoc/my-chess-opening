import type {
	SharedGameFilter,
	SharedGameFilterContextConfig,
	SharedGameFilterGameSpeed,
	SharedGameFilterPlatform,
	SharedGameFilterPlayedColor,
	SharedGameFilterPlayerResult,
	SharedGameFilterRatedMode,
} from './types';
import { resolveSharedGameFilterPlayedDateRange } from './period';
import { stripHiddenSharedGameFilterFields as stripHiddenFields } from './helpers';

/**
 * Query-ready representation derived from the shared game filter.
 *
 * Notes:
 * - only meaningful restrictions are emitted
 * - played date bounds are converted to ISO 8601 strings
 * - a restrictive default from a context is still emitted when it actually
 *   constrains the future query
 */
export interface SharedGameFilterQuery {
	playedDateFromIso?: string;
	playedDateToIso?: string;
	playedColor?: Exclude<SharedGameFilterPlayedColor, 'both'>;
	playerResult?: Exclude<SharedGameFilterPlayerResult, 'all'>;
	gameSpeeds?: SharedGameFilterGameSpeed[];
	ratedMode?: Exclude<SharedGameFilterRatedMode, 'both'>;
	platforms?: SharedGameFilterPlatform[];
	ecoCodeExact?: string;
	openingNameContains?: string;
	gameIdExact?: string;
	playerRatingMin?: number;
	playerRatingMax?: number;
	opponentRatingMin?: number;
	opponentRatingMax?: number;
	ratingDiffMin?: number;
	ratingDiffMax?: number;
	playerTextSearch?: string;
}

/**
 * Combined payload returned by the shared filter query mapper.
 *
 * This is useful for future consumers that need both:
 * - the canonical visible filter state
 * - the query-ready mapped object
 */
export interface SharedGameFilterQueryPayload {
	filter: SharedGameFilter;
	query: SharedGameFilterQuery;
}

const SHARED_GAME_FILTER_CALENDAR_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build a query-ready payload from an unknown shared game filter input.
 *
 * Steps:
 * - normalize and strip hidden fields according to the context config
 * - resolve the effective played date range
 * - convert the active restrictions into a compact query object
 */
export function buildSharedGameFilterQueryPayload(
	value: unknown,
	config?: SharedGameFilterContextConfig | null,
	referenceDate?: Date | string,
): SharedGameFilterQueryPayload {
	const filter = stripHiddenFields(value, config);
	const playedDateRange = resolveSharedGameFilterPlayedDateRange(filter, referenceDate);

	const query: SharedGameFilterQuery = {};

	const playedDateFromIso = toSharedGameFilterLocalDayStartIso(playedDateRange.from);
	if (playedDateFromIso !== undefined) {
		query.playedDateFromIso = playedDateFromIso;
	}

	const playedDateToIso = toSharedGameFilterLocalDayEndIso(playedDateRange.to);
	if (playedDateToIso !== undefined) {
		query.playedDateToIso = playedDateToIso;
	}

	if (filter.playedColor !== 'both') {
		query.playedColor = filter.playedColor;
	}

	if (filter.playerResult !== 'all') {
		query.playerResult = filter.playerResult;
	}

	if (filter.gameSpeeds.length > 0) {
		query.gameSpeeds = [...filter.gameSpeeds];
	}

	if (filter.ratedMode !== 'both') {
		query.ratedMode = filter.ratedMode;
	}

	if (filter.platforms.length > 0) {
		query.platforms = [...filter.platforms];
	}

	if (filter.ecoCodeExact !== '') {
		query.ecoCodeExact = filter.ecoCodeExact;
	}

	if (filter.openingNameContains !== '') {
		query.openingNameContains = filter.openingNameContains;
	}

	if (filter.gameIdExact !== '') {
		query.gameIdExact = filter.gameIdExact;
	}

	if (filter.playerRatingMin !== null) {
		query.playerRatingMin = filter.playerRatingMin;
	}

	if (filter.playerRatingMax !== null) {
		query.playerRatingMax = filter.playerRatingMax;
	}

	if (filter.opponentRatingMin !== null) {
		query.opponentRatingMin = filter.opponentRatingMin;
	}

	if (filter.opponentRatingMax !== null) {
		query.opponentRatingMax = filter.opponentRatingMax;
	}

	if (filter.ratingDiffMin !== null) {
		query.ratingDiffMin = filter.ratingDiffMin;
	}

	if (filter.ratingDiffMax !== null) {
		query.ratingDiffMax = filter.ratingDiffMax;
	}

	if (filter.playerTextSearch !== '') {
		query.playerTextSearch = filter.playerTextSearch;
	}

	return {
		filter,
		query,
	};
}

/**
 * Build only the query-ready object from a shared game filter input.
 */
export function buildSharedGameFilterQuery(
	value: unknown,
	config?: SharedGameFilterContextConfig | null,
	referenceDate?: Date | string,
): SharedGameFilterQuery {
	return buildSharedGameFilterQueryPayload(value, config, referenceDate).query;
}

/**
 * Convert a YYYY-MM-DD local calendar date to an ISO 8601 start-of-day bound.
 *
 * Returns undefined when the input is null or invalid.
 */
function toSharedGameFilterLocalDayStartIso(value: string | null): string | undefined {
	const localDate = parseSharedGameFilterLocalCalendarDate(value, 'start');

	return localDate === null ? undefined : localDate.toISOString();
}

/**
 * Convert a YYYY-MM-DD local calendar date to an ISO 8601 end-of-day bound.
 *
 * Returns undefined when the input is null or invalid.
 */
function toSharedGameFilterLocalDayEndIso(value: string | null): string | undefined {
	const localDate = parseSharedGameFilterLocalCalendarDate(value, 'end');

	return localDate === null ? undefined : localDate.toISOString();
}

/**
 * Parse a local calendar date string and create a local Date instance at the
 * start or end of that day.
 */
function parseSharedGameFilterLocalCalendarDate(
	value: string | null,
	boundary: 'start' | 'end',
): Date | null {
	if (value === null || !SHARED_GAME_FILTER_CALENDAR_DATE_REGEX.test(value)) {
		return null;
	}

	const [year, month, day] = value.split('-').map(Number);

	const date =
		boundary === 'start'
			? new Date(year, month - 1, day, 0, 0, 0, 0)
			: new Date(year, month - 1, day, 23, 59, 59, 999);

	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return null;
	}

	return date;
}
