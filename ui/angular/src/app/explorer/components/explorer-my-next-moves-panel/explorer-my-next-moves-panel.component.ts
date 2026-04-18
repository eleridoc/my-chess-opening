import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	signal,
} from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { MyNextMovesResult } from 'my-chess-opening-core';
import type { SharedGameFilter } from 'my-chess-opening-core/filters';
import { countActiveSharedGameFilterFields } from 'my-chess-opening-core/filters';

import { ExplorerFacade } from '../../facade/explorer.facade';
import { MyNextMovesService } from '../../../services/my-next-moves/my-next-moves.service';
import { IsoDateTimePipe } from '../../../shared/dates/pipes';
import { SharedGameFilterContextService } from '../../../shared/game-filter/services/shared-game-filter-context.service';
import { SharedGameFilterDialogService } from '../../../shared/game-filter/services/shared-game-filter-dialog.service';
import { SharedGameFilterStorageService } from '../../../shared/game-filter/services/shared-game-filter-storage.service';
import { SectionLoaderComponent } from '../../../shared/loading/section-loader/section-loader.component';

/**
 * Explorer panel dedicated to the "My next moves" feature.
 *
 * Responsibilities:
 * - react to the current Explorer position
 * - react to the persisted "my-next-moves" shared filter
 * - load aggregated backend data
 * - render the panel header + summary state
 *
 * Notes:
 * - The detailed move table will be introduced in the next iteration.
 * - Errors stay inline to avoid noisy global notifications while navigating.
 */
@Component({
	selector: 'app-explorer-my-next-moves-panel',
	standalone: true,
	imports: [
		CommonModule,
		MatButtonModule,
		MatIconModule,
		MatTooltipModule,
		SectionLoaderComponent,
		IsoDateTimePipe,
	],
	templateUrl: './explorer-my-next-moves-panel.component.html',
	styleUrl: './explorer-my-next-moves-panel.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerMyNextMovesPanelComponent {
	private readonly facade = inject(ExplorerFacade);
	private readonly myNextMovesService = inject(MyNextMovesService);
	private readonly sharedGameFilterStorage = inject(SharedGameFilterStorageService);
	private readonly sharedGameFilterContext = inject(SharedGameFilterContextService);
	private readonly sharedGameFilterDialog = inject(SharedGameFilterDialogService);

	/**
	 * Resolved once and reused for active-filter counting.
	 */
	private readonly myNextMovesFilterContextConfig =
		this.sharedGameFilterContext.getSharedGameFilterContextConfig('my-next-moves');

	/**
	 * Last-wins token used to ignore obsolete async responses.
	 */
	private loadSeq = 0;

	/**
	 * Persisted shared filter for the "my-next-moves" context.
	 */
	readonly myNextMovesFilter = signal<SharedGameFilter>(
		this.sharedGameFilterStorage.loadSharedGameFilter('my-next-moves'),
	);

	/**
	 * Last successful backend result.
	 */
	readonly myNextMovesResult = signal<MyNextMovesResult | null>(null);

	/**
	 * Inline loading state for the panel.
	 */
	readonly isLoading = signal(false);

	/**
	 * Inline error state for the panel.
	 */
	readonly loadError = signal<string | null>(null);

	readonly activeFilterCount = computed(() =>
		countActiveSharedGameFilterFields(
			this.myNextMovesFilter(),
			this.myNextMovesFilterContextConfig,
		),
	);

	readonly filterButtonLabel = computed(() => {
		const activeCount = this.activeFilterCount();
		return activeCount > 0 ? `Filters (${activeCount})` : 'Filters';
	});

	constructor() {
		effect(() => {
			const positionKey = this.facade.positionKey();
			const normalizedFen = this.facade.normalizedFen();
			const filter = this.myNextMovesFilter();

			void this.refresh(positionKey, normalizedFen, filter);
		});
	}

	openFilterDialog(): void {
		this.sharedGameFilterDialog.openSharedGameFilterDialog({
			title: 'My next moves filters',
			context: 'my-next-moves',
			initialValue: this.myNextMovesFilter(),
			persistInStorage: true,
			onFilterChanged: (filter) => {
				this.myNextMovesFilter.set(filter);
			},
		});
	}

	/**
	 * Refresh panel data from the backend.
	 *
	 * Rules:
	 * - refresh automatically on position/filter change
	 * - keep only the latest in-flight result
	 * - do not use global notifications here
	 */
	private async refresh(
		positionKey: string,
		normalizedFen: string,
		filter: SharedGameFilter,
	): Promise<void> {
		const seq = ++this.loadSeq;

		this.isLoading.set(true);
		this.loadError.set(null);

		try {
			const result = await this.myNextMovesService.getMoves({
				positionKey,
				normalizedFen,
				filter,
			});

			if (seq !== this.loadSeq) {
				return;
			}

			this.myNextMovesResult.set(result);
		} catch (error) {
			if (seq !== this.loadSeq) {
				return;
			}

			console.error('[ExplorerMyNextMovesPanel] Failed to load my next moves:', error);

			this.myNextMovesResult.set(null);
			this.loadError.set('Failed to load move statistics for the current position.');
		} finally {
			if (seq === this.loadSeq) {
				this.isLoading.set(false);
			}
		}
	}
}
