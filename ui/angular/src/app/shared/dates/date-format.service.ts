import { Injectable } from '@angular/core';
import { DateTime } from 'luxon';

export type IsoInput = string | null | undefined;

/**
 * DateFormatService
 *
 * UI-only date formatting helpers for ISO 8601 strings stored in the DB.
 *
 * Goals:
 * - Keep all formatting centralized.
 * - Respect the user's machine locale (navigator.language).
 * - Never mutate ISO values (formatting only).
 */
@Injectable({ providedIn: 'root' })
export class DateFormatService {
	private readonly locale = (navigator.language || 'en-US').trim() || 'en-US';

	formatDate(iso: IsoInput): string {
		const dt = this.parseIso(iso);
		if (!dt) return '—';
		return dt.setLocale(this.locale).toLocaleString(DateTime.DATE_MED);
	}

	/**
	 * Formats a date+time in a compact, locale-aware way.
	 * Use withSeconds=true for log screens.
	 */
	formatDateTime(iso: IsoInput, withSeconds = false): string {
		const dt = this.parseIso(iso);
		if (!dt) return '—';

		const preset = withSeconds ? DateTime.DATETIME_SHORT_WITH_SECONDS : DateTime.DATETIME_SHORT;

		return dt.setLocale(this.locale).toLocaleString(preset);
	}

	private parseIso(iso: IsoInput): DateTime | null {
		const raw = (iso ?? '').trim();
		if (!raw) return null;

		const dt = DateTime.fromISO(raw, { setZone: true }).toLocal();

		return dt.isValid ? dt : null;
	}
}
