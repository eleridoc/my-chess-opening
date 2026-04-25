import { normalizeSharedGameFilter } from './helpers';
import type { SharedGameFilterPeriodPreset, SharedGameFilterPlayedDateRange } from './types';

const SHARED_GAME_FILTER_CALENDAR_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Check whether the current preset uses the custom date inputs.
 *
 * When false, datePlayedFrom and datePlayedTo are kept in the filter state but
 * ignored by the applied played date range.
 */
export function usesSharedGameFilterCustomPlayedDates(
	periodPreset: SharedGameFilterPeriodPreset,
): boolean {
	return periodPreset === 'custom';
}

/**
 * Resolve the played date range that should actually be applied for the current
 * filter state and reference date.
 *
 * Rules:
 * - "all" returns no date restriction
 * - "custom" returns the normalized custom date inputs as-is
 * - computed presets return inclusive YYYY-MM-DD calendar bounds
 *
 * The optional referenceDate is mainly useful for deterministic tests and for
 * callers that want full control over "today".
 */
export function resolveSharedGameFilterPlayedDateRange(
	value: unknown,
	referenceDate?: Date | string,
): SharedGameFilterPlayedDateRange {
	const normalizedFilter = normalizeSharedGameFilter(value);

	if (usesSharedGameFilterCustomPlayedDates(normalizedFilter.periodPreset)) {
		return {
			from: normalizedFilter.datePlayedFrom,
			to: normalizedFilter.datePlayedTo,
		};
	}

	return resolveComputedSharedGameFilterPlayedDateRange(
		normalizedFilter.periodPreset,
		referenceDate,
	);
}

/**
 * Resolve the played date range for a computed preset.
 */
function resolveComputedSharedGameFilterPlayedDateRange(
	periodPreset: SharedGameFilterPeriodPreset,
	referenceDate?: Date | string,
): SharedGameFilterPlayedDateRange {
	if (periodPreset === 'all') {
		return {
			from: null,
			to: null,
		};
	}

	const referenceCalendarDate = resolveSharedGameFilterReferenceCalendarDate(referenceDate);
	const referenceUtcDate = parseSharedGameFilterCalendarDate(referenceCalendarDate);

	if (referenceUtcDate === null) {
		return {
			from: null,
			to: null,
		};
	}

	switch (periodPreset) {
		case 'today':
			return {
				from: referenceCalendarDate,
				to: referenceCalendarDate,
			};

		case 'last7Days':
			return {
				from: formatSharedGameFilterCalendarDate(
					addSharedGameFilterUtcDays(referenceUtcDate, -6),
				),
				to: referenceCalendarDate,
			};

		case 'last30Days':
			return {
				from: formatSharedGameFilterCalendarDate(
					addSharedGameFilterUtcDays(referenceUtcDate, -29),
				),
				to: referenceCalendarDate,
			};

		case 'thisMonth':
			return {
				from: formatSharedGameFilterCalendarDate(
					startOfSharedGameFilterUtcMonth(referenceUtcDate),
				),
				to: referenceCalendarDate,
			};

		case 'last3Months':
			return {
				from: formatSharedGameFilterCalendarDate(
					addSharedGameFilterUtcMonths(referenceUtcDate, -3),
				),
				to: referenceCalendarDate,
			};

		case 'last6Months':
			return {
				from: formatSharedGameFilterCalendarDate(
					addSharedGameFilterUtcMonths(referenceUtcDate, -6),
				),
				to: referenceCalendarDate,
			};
		case 'last12Months':
			return {
				from: formatSharedGameFilterCalendarDate(
					addSharedGameFilterUtcMonths(referenceUtcDate, -12),
				),
				to: referenceCalendarDate,
			};
		case 'thisYear':
			return {
				from: formatSharedGameFilterCalendarDate(
					startOfSharedGameFilterUtcYear(referenceUtcDate),
				),
				to: referenceCalendarDate,
			};

		case 'custom':
		default:
			return {
				from: null,
				to: null,
			};
	}
}

/**
 * Resolve a local calendar reference date in YYYY-MM-DD format.
 *
 * Accepted inputs:
 * - undefined => current local date
 * - Date => current local calendar date derived from the instance
 * - string in YYYY-MM-DD => validated and reused
 * - any other string parseable by Date => converted to local calendar date
 *
 * Invalid values fall back to the current local date.
 */
function resolveSharedGameFilterReferenceCalendarDate(value?: Date | string): string {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime())
			? formatSharedGameFilterLocalCalendarDate(new Date())
			: formatSharedGameFilterLocalCalendarDate(value);
	}

	if (typeof value === 'string') {
		const trimmedValue = value.trim();

		if (trimmedValue === '') {
			return formatSharedGameFilterLocalCalendarDate(new Date());
		}

		if (SHARED_GAME_FILTER_CALENDAR_DATE_REGEX.test(trimmedValue)) {
			return parseSharedGameFilterCalendarDate(trimmedValue) === null
				? formatSharedGameFilterLocalCalendarDate(new Date())
				: trimmedValue;
		}

		const parsedDate = new Date(trimmedValue);

		return Number.isNaN(parsedDate.getTime())
			? formatSharedGameFilterLocalCalendarDate(new Date())
			: formatSharedGameFilterLocalCalendarDate(parsedDate);
	}

	return formatSharedGameFilterLocalCalendarDate(new Date());
}

/**
 * Parse a YYYY-MM-DD calendar date into a UTC date object.
 *
 * UTC is used internally only to perform safe calendar arithmetic without
 * accidental local timezone shifts.
 */
function parseSharedGameFilterCalendarDate(value: string): Date | null {
	if (!SHARED_GAME_FILTER_CALENDAR_DATE_REGEX.test(value)) {
		return null;
	}

	const [year, month, day] = value.split('-').map(Number);
	const utcDate = new Date(Date.UTC(year, month - 1, day));

	if (
		utcDate.getUTCFullYear() !== year ||
		utcDate.getUTCMonth() !== month - 1 ||
		utcDate.getUTCDate() !== day
	) {
		return null;
	}

	return utcDate;
}

/**
 * Format a UTC date object as YYYY-MM-DD.
 */
function formatSharedGameFilterCalendarDate(value: Date): string {
	return [
		String(value.getUTCFullYear()).padStart(4, '0'),
		String(value.getUTCMonth() + 1).padStart(2, '0'),
		String(value.getUTCDate()).padStart(2, '0'),
	].join('-');
}

/**
 * Format a local Date instance as YYYY-MM-DD.
 */
function formatSharedGameFilterLocalCalendarDate(value: Date): string {
	return [
		String(value.getFullYear()).padStart(4, '0'),
		String(value.getMonth() + 1).padStart(2, '0'),
		String(value.getDate()).padStart(2, '0'),
	].join('-');
}

/**
 * Add a day delta to a UTC calendar date.
 */
function addSharedGameFilterUtcDays(value: Date, days: number): Date {
	const nextDate = new Date(value.getTime());
	nextDate.setUTCDate(nextDate.getUTCDate() + days);
	return nextDate;
}

/**
 * Add a month delta to a UTC calendar date while clamping the day to the last
 * valid day of the target month when needed.
 */
function addSharedGameFilterUtcMonths(value: Date, months: number): Date {
	const targetYear = value.getUTCFullYear();
	const targetMonth = value.getUTCMonth() + months;
	const targetDay = value.getUTCDate();

	const targetMonthStart = new Date(Date.UTC(targetYear, targetMonth, 1));
	const targetMonthLastDay = getSharedGameFilterUtcMonthLastDay(
		targetMonthStart.getUTCFullYear(),
		targetMonthStart.getUTCMonth(),
	);

	return new Date(
		Date.UTC(
			targetMonthStart.getUTCFullYear(),
			targetMonthStart.getUTCMonth(),
			Math.min(targetDay, targetMonthLastDay),
		),
	);
}

/**
 * Get the first day of the current UTC month.
 */
function startOfSharedGameFilterUtcMonth(value: Date): Date {
	return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

/**
 * Get the first day of the current UTC year.
 */
function startOfSharedGameFilterUtcYear(value: Date): Date {
	return new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
}

/**
 * Get the last valid day number for a given UTC month.
 */
function getSharedGameFilterUtcMonthLastDay(year: number, month: number): number {
	return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
