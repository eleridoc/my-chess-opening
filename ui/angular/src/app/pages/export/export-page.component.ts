import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';

import {
	SHARED_GAME_FILTER_FIELD_KEYS,
	buildSharedGameFilterQueryPayload,
	type SharedGameFilter,
	type SharedGameFilterContextConfig,
} from 'my-chess-opening-core/filters';

import { SharedGameFilterComponent } from '../../shared/game-filter/components';
import { SharedGameFilterDialogService } from '../../shared/game-filter/services/shared-game-filter-dialog.service';
import { SharedGameFilterStorageService } from '../../shared/game-filter/services/shared-game-filter-storage.service';

/**
 * Export page testbed for the shared game filter.
 *
 * This first integration intentionally does not call the backend.
 * It is used to validate:
 * - inline mode
 * - popup mode
 * - storage by context
 * - normalized filter output
 * - query mapping output
 */
@Component({
	selector: 'app-export-page',
	standalone: true,
	imports: [CommonModule, MatButtonModule, SharedGameFilterComponent],
	templateUrl: './export-page.component.html',
	styleUrl: './export-page.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportPageComponent {
	private readonly sharedGameFilterStorage = inject(SharedGameFilterStorageService);
	private readonly sharedGameFilterDialogService = inject(SharedGameFilterDialogService);

	/**
	 * Export should expose the whole filter surface for this first test page.
	 *
	 * The base "export" context defaults are still kept through the context
	 * service. Here we only force all fields to stay visible.
	 */
	readonly exportFilterContextConfig: SharedGameFilterContextConfig = {
		visibleFields: [...SHARED_GAME_FILTER_FIELD_KEYS],
	};

	readonly lastActionLabel = signal('Initial export filter preview');
	readonly appliedFilterJson = signal('');
	readonly mappedQueryJson = signal('');

	constructor() {
		const initialFilter = this.sharedGameFilterStorage.loadSharedGameFilter(
			'export',
			this.exportFilterContextConfig,
		);

		this.refreshPreviewFromFilter(initialFilter, 'Initial export filter preview');
	}

	onInlineApply(filter: SharedGameFilter): void {
		this.refreshPreviewFromFilter(filter, 'Applied from inline filter');
	}

	onInlineReset(filter: SharedGameFilter): void {
		this.refreshPreviewFromFilter(filter, 'Reset to export defaults');
	}

	onReloadStoredFilter(): void {
		const storedFilter = this.sharedGameFilterStorage.loadSharedGameFilter(
			'export',
			this.exportFilterContextConfig,
		);

		this.refreshPreviewFromFilter(storedFilter, 'Reloaded from export local storage');
	}

	onOpenPopupTest(): void {
		this.sharedGameFilterDialogService
			.openSharedGameFilterDialog({
				title: 'Export filters',
				context: 'export',
				contextConfig: this.exportFilterContextConfig,
				persistInStorage: true,
				applyButtonLabel: 'Apply filters',
				resetButtonLabel: 'Reset filters',
				cancelButtonLabel: 'Close',
			})
			.afterClosed()
			.subscribe((result) => {
				if (result === undefined) {
					return;
				}

				this.refreshPreviewFromFilter(result, 'Applied from popup filter');
			});
	}

	private refreshPreviewFromFilter(filter: SharedGameFilter, label: string): void {
		const payload = buildSharedGameFilterQueryPayload(filter, this.exportFilterContextConfig);

		this.lastActionLabel.set(label);
		this.appliedFilterJson.set(this.stringifyJson(payload.filter));
		this.mappedQueryJson.set(this.stringifyJson(payload.query));
	}

	private stringifyJson(value: unknown): string {
		return JSON.stringify(value, null, 2);
	}
}
