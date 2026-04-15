import { Injectable } from '@angular/core';
import type {
	SharedGameFilter,
	SharedGameFilterContext,
	SharedGameFilterContextConfig,
} from 'my-chess-opening-core/filters';

import { SHARED_GAME_FILTER_CONTEXT_CONFIGS } from '../config/shared-game-filter-context-configs';

/**
 * Resolve shared game filter configuration by context.
 *
 * This service centralizes:
 * - context fallback to "default"
 * - defensive cloning of config objects
 * - optional per-call config overrides layered on top of the context base config
 */
@Injectable({
	providedIn: 'root',
})
export class SharedGameFilterContextService {
	/**
	 * Get the base configuration for a context.
	 *
	 * The returned object is cloned to prevent accidental mutations of the
	 * shared constant map.
	 */
	getSharedGameFilterContextConfig(
		context: SharedGameFilterContext,
	): SharedGameFilterContextConfig {
		const config =
			SHARED_GAME_FILTER_CONTEXT_CONFIGS[context] ?? SHARED_GAME_FILTER_CONTEXT_CONFIGS.default;

		return this.cloneSharedGameFilterContextConfig(config);
	}

	/**
	 * Get the effective configuration for a context by layering optional runtime
	 * overrides on top of the registered base context config.
	 */
	getMergedSharedGameFilterContextConfig(
		context: SharedGameFilterContext,
		overrides?: SharedGameFilterContextConfig | null,
	): SharedGameFilterContextConfig {
		const baseConfig = this.getSharedGameFilterContextConfig(context);

		if (overrides == null) {
			return baseConfig;
		}

		return {
			visibleFields:
				overrides.visibleFields === undefined
					? baseConfig.visibleFields
						? [...baseConfig.visibleFields]
						: undefined
					: [...overrides.visibleFields],
			defaultValueOverrides: {
				...(baseConfig.defaultValueOverrides
					? this.cloneSharedGameFilterDefaultOverrides(baseConfig.defaultValueOverrides)
					: {}),
				...(overrides.defaultValueOverrides
					? this.cloneSharedGameFilterDefaultOverrides(overrides.defaultValueOverrides)
					: {}),
			},
		};
	}

	private cloneSharedGameFilterContextConfig(
		config: SharedGameFilterContextConfig,
	): SharedGameFilterContextConfig {
		return {
			visibleFields: config.visibleFields === undefined ? undefined : [...config.visibleFields],
			defaultValueOverrides:
				config.defaultValueOverrides === undefined
					? undefined
					: this.cloneSharedGameFilterDefaultOverrides(config.defaultValueOverrides),
		};
	}

	private cloneSharedGameFilterDefaultOverrides(
		overrides: Partial<SharedGameFilter>,
	): Partial<SharedGameFilter> {
		return {
			...overrides,
			gameSpeeds: overrides.gameSpeeds === undefined ? undefined : [...overrides.gameSpeeds],
			platforms: overrides.platforms === undefined ? undefined : [...overrides.platforms],
		};
	}
}
