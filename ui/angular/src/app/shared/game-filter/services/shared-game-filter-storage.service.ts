import { Injectable } from '@angular/core';
import {
	getDefaultSharedGameFilterForContext,
	stripHiddenSharedGameFilterFields,
	type SharedGameFilter,
	type SharedGameFilterContext,
	type SharedGameFilterContextConfig,
} from 'my-chess-opening-core/filters';

import { SharedGameFilterContextService } from './shared-game-filter-context.service';

interface SharedGameFilterStorageEntry {
	version: number;
	filter: unknown;
}

const SHARED_GAME_FILTER_STORAGE_KEY_PREFIX = 'mco.shared-game-filter';
const SHARED_GAME_FILTER_STORAGE_VERSION = 1;

/**
 * Persist shared game filter values in localStorage, scoped by context.
 *
 * Storage rules:
 * - one localStorage entry per context
 * - values are versioned
 * - invalid or obsolete entries are ignored and cleared
 * - values are normalized before being returned or stored
 * - hidden fields are stripped before being stored or returned
 */
@Injectable({
	providedIn: 'root',
})
export class SharedGameFilterStorageService {
	constructor(private readonly sharedGameFilterContextService: SharedGameFilterContextService) {}

	/**
	 * Load the stored filter for a context.
	 *
	 * If no stored value exists, or if the stored payload is invalid/obsolete,
	 * the context-aware defaults are returned.
	 */
	loadSharedGameFilter(
		context: SharedGameFilterContext,
		config?: SharedGameFilterContextConfig | null,
	): SharedGameFilter {
		const resolvedConfig = this.resolveContextConfig(context, config);
		const contextDefaults = getDefaultSharedGameFilterForContext(resolvedConfig);
		const storage = this.getStorage();

		if (storage === null) {
			return contextDefaults;
		}

		const rawValue = storage.getItem(this.buildStorageKey(context));

		if (rawValue === null || rawValue.trim() === '') {
			return contextDefaults;
		}

		let parsedValue: unknown;

		try {
			parsedValue = JSON.parse(rawValue);
		} catch {
			this.clearStoredSharedGameFilter(context);
			return contextDefaults;
		}

		if (!this.isSharedGameFilterStorageEntry(parsedValue)) {
			this.clearStoredSharedGameFilter(context);
			return contextDefaults;
		}

		if (parsedValue.version !== SHARED_GAME_FILTER_STORAGE_VERSION) {
			this.clearStoredSharedGameFilter(context);
			return contextDefaults;
		}

		return stripHiddenSharedGameFilterFields(parsedValue.filter, resolvedConfig);
	}

	/**
	 * Save a filter for a context.
	 *
	 * The returned value is the canonical stored value after normalization and
	 * hidden-field stripping.
	 */
	saveSharedGameFilter(
		context: SharedGameFilterContext,
		value: unknown,
		config?: SharedGameFilterContextConfig | null,
	): SharedGameFilter {
		const resolvedConfig = this.resolveContextConfig(context, config);
		const normalizedFilter = stripHiddenSharedGameFilterFields(value, resolvedConfig);
		const storage = this.getStorage();

		if (storage === null) {
			return normalizedFilter;
		}

		const entry: SharedGameFilterStorageEntry = {
			version: SHARED_GAME_FILTER_STORAGE_VERSION,
			filter: normalizedFilter,
		};

		try {
			storage.setItem(this.buildStorageKey(context), JSON.stringify(entry));
		} catch {
			/**
			 * Ignore storage failures such as quota errors.
			 * The caller still receives the normalized filter value.
			 */
		}

		return normalizedFilter;
	}

	/**
	 * Reset the stored filter for a context and return the context-aware defaults.
	 *
	 * This operation only affects the provided context.
	 */
	resetSharedGameFilter(
		context: SharedGameFilterContext,
		config?: SharedGameFilterContextConfig | null,
	): SharedGameFilter {
		const resolvedConfig = this.resolveContextConfig(context, config);
		this.clearStoredSharedGameFilter(context);
		return getDefaultSharedGameFilterForContext(resolvedConfig);
	}

	/**
	 * Remove the stored filter entry for a context.
	 */
	clearStoredSharedGameFilter(context: SharedGameFilterContext): void {
		const storage = this.getStorage();

		if (storage === null) {
			return;
		}

		try {
			storage.removeItem(this.buildStorageKey(context));
		} catch {
			/**
			 * Ignore storage failures to keep the service non-blocking.
			 */
		}
	}

	/**
	 * Check whether the storage currently contains a raw entry for a context.
	 *
	 * This does not validate the payload content. It only checks key presence.
	 */
	hasStoredSharedGameFilter(context: SharedGameFilterContext): boolean {
		const storage = this.getStorage();

		if (storage === null) {
			return false;
		}

		try {
			return storage.getItem(this.buildStorageKey(context)) !== null;
		} catch {
			return false;
		}
	}

	private resolveContextConfig(
		context: SharedGameFilterContext,
		config?: SharedGameFilterContextConfig | null,
	): SharedGameFilterContextConfig {
		return this.sharedGameFilterContextService.getMergedSharedGameFilterContextConfig(
			context,
			config,
		);
	}

	private buildStorageKey(context: SharedGameFilterContext): string {
		return `${SHARED_GAME_FILTER_STORAGE_KEY_PREFIX}.${context}`;
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

	private isSharedGameFilterStorageEntry(value: unknown): value is SharedGameFilterStorageEntry {
		if (!this.isRecord(value)) {
			return false;
		}

		return typeof value['version'] === 'number' && 'filter' in value;
	}

	private isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}
}
