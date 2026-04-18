import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	OnDestroy,
	computed,
	effect,
	inject,
	signal,
} from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { MyNextMoveRow, MyNextMovesResult } from 'my-chess-opening-core';
import type { SharedGameFilter } from 'my-chess-opening-core/filters';
import { countActiveSharedGameFilterFields } from 'my-chess-opening-core/filters';

import { ExplorerFacade } from '../../facade/explorer.facade';
import { ExplorerMyNextMovesTableComponent } from '../explorer-my-next-moves-table/explorer-my-next-moves-table.component';
import { MyNextMovesService } from '../../../services/my-next-moves/my-next-moves.service';
import { ExplorerBoardArrowsService } from '../../services/explorer-board-arrows.service';
import type {
	ExplorerBoardArrow,
	ExplorerBoardArrowDisplayMode,
} from '../../board/board-arrows.types';
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
 * - render the panel header and the presentational table
 *
 * Notes:
 * - Per-row tooltip details are handled by the table component.
 * - The current-position summary row is also rendered by the table component.
 * - Errors stay inline to avoid noisy global notifications while navigating.
 */
@Component({
	selector: 'app-explorer-my-next-moves-panel',
	standalone: true,
	imports: [
		CommonModule,
		MatButtonModule,
		MatButtonToggleModule,
		MatIconModule,
		MatTooltipModule,
		SectionLoaderComponent,
		ExplorerMyNextMovesTableComponent,
	],
	templateUrl: './explorer-my-next-moves-panel.component.html',
	styleUrl: './explorer-my-next-moves-panel.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerMyNextMovesPanelComponent implements OnDestroy {
	private readonly facade = inject(ExplorerFacade);
	private readonly myNextMovesService = inject(MyNextMovesService);
	private readonly sharedGameFilterStorage = inject(SharedGameFilterStorageService);
	private readonly sharedGameFilterContext = inject(SharedGameFilterContextService);
	private readonly sharedGameFilterDialog = inject(SharedGameFilterDialogService);
	private readonly boardArrows = inject(ExplorerBoardArrowsService);

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

	readonly currentArrowMode = computed(() => this.boardArrows.getArrowMode('my-next-moves'));

	constructor() {
		this.boardArrows.setActiveSource('my-next-moves');

		effect(() => {
			const positionKey = this.facade.positionKey();
			const normalizedFen = this.facade.normalizedFen();
			const filter = this.myNextMovesFilter();

			void this.refresh(positionKey, normalizedFen, filter);
		});

		effect(() => {
			const result = this.myNextMovesResult();

			if (!result) {
				this.boardArrows.clearSourceArrows('my-next-moves');
				return;
			}

			this.boardArrows.setSourceArrows('my-next-moves', this.buildBoardArrows(result.moves));
		});
	}

	ngOnDestroy(): void {
		this.boardArrows.clearSourceArrows('my-next-moves');
		this.boardArrows.clearActiveSource('my-next-moves');
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

	getArrowMode(): ExplorerBoardArrowDisplayMode {
		return this.boardArrows.getArrowMode('my-next-moves');
	}

	setArrowMode(mode: string): void {
		if (mode !== 'off' && mode !== 'top3' && mode !== 'top5' && mode !== 'all') {
			return;
		}

		this.boardArrows.setArrowMode('my-next-moves', mode);
	}

	private buildBoardArrows(rows: MyNextMoveRow[]): ExplorerBoardArrow[] {
		const arrows: ExplorerBoardArrow[] = [];

		for (let index = 0; index < rows.length; index++) {
			const row = rows[index];
			const parsed = this.parseArrowSquaresFromUci(row.moveUci);

			if (!parsed) {
				continue;
			}

			arrows.push({
				source: 'my-next-moves',
				from: parsed.from,
				to: parsed.to,
				uci: row.moveUci,
				label: row.moveSan,
				rank: index + 1,
				weight: row.gamesPercent,
			});
		}

		return arrows;
	}

	private parseArrowSquaresFromUci(uci: string): { from: string; to: string } | null {
		const normalized = typeof uci === 'string' ? uci.trim().toLowerCase() : '';

		if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(normalized)) {
			return null;
		}

		return {
			from: normalized.slice(0, 2),
			to: normalized.slice(2, 4),
		};
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
