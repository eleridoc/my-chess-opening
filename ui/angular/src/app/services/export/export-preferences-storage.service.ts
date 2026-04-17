import { Injectable } from '@angular/core';

const EXPORT_UNIFIED_PLAYER_NAME_STORAGE_KEY = 'mco.export.unified-player-name';

/**
 * Persist lightweight export UI preferences in localStorage.
 *
 * Current scope:
 * - unified player name used when generating the PGN export
 */
@Injectable({ providedIn: 'root' })
export class ExportPreferencesStorageService {
	loadUnifiedPlayerName(): string {
		const storage = this.getStorage();

		if (storage === null) {
			return '';
		}

		try {
			const rawValue = storage.getItem(EXPORT_UNIFIED_PLAYER_NAME_STORAGE_KEY);

			if (rawValue === null) {
				return '';
			}

			return this.normalizeUnifiedPlayerName(rawValue);
		} catch {
			return '';
		}
	}

	saveUnifiedPlayerName(value: string): string {
		const normalizedValue = this.normalizeUnifiedPlayerName(value);
		const storage = this.getStorage();

		if (storage === null) {
			return normalizedValue;
		}

		try {
			if (normalizedValue === '') {
				storage.removeItem(EXPORT_UNIFIED_PLAYER_NAME_STORAGE_KEY);
			} else {
				storage.setItem(EXPORT_UNIFIED_PLAYER_NAME_STORAGE_KEY, normalizedValue);
			}
		} catch {
			/**
			 * Ignore storage failures to keep the preference non-blocking.
			 */
		}

		return normalizedValue;
	}

	private normalizeUnifiedPlayerName(value: string): string {
		return value.trim();
	}

	private getStorage(): Storage | null {
		try {
			if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
				return null;
			}

			return globalThis.localStorage;
		} catch {
			return null;
		}
	}
}
