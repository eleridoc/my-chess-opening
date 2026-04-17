import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';

import type {
	ExportBuildPgnResult,
	ExportSummaryStats,
	SharedGameFilter,
} from 'my-chess-opening-core';

import { ExportService } from '../../services/export/export.service';
import { SharedGameFilterComponent } from '../../shared/game-filter/components';
import { SharedGameFilterStorageService } from '../../shared/game-filter/services/shared-game-filter-storage.service';
import { SectionLoaderComponent } from '../../shared/loading/section-loader/section-loader.component';
import { NotificationService } from '../../shared/notifications/notification.service';

/**
 * Export page.
 *
 * V1.8.5 scope:
 * - keep the shared filter state live and persistent
 * - execute Search only on explicit user action
 * - keep a dedicated executed filter snapshot for summary/export
 * - generate and download a PGN file from the last executed filter
 * - reset only the page execution state after a successful export
 */
@Component({
	selector: 'app-export-page',
	standalone: true,
	imports: [CommonModule, MatButtonModule, SharedGameFilterComponent, SectionLoaderComponent],
	templateUrl: './export-page.component.html',
	styleUrl: './export-page.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportPageComponent {
	private readonly sharedGameFilterStorage = inject(SharedGameFilterStorageService);
	private readonly exportService = inject(ExportService);
	private readonly notify = inject(NotificationService);

	/**
	 * Current live filter shown in the UI.
	 *
	 * It is initialized from the persisted export context and updated by the
	 * shared filter component whenever the user changes a valid value.
	 */
	readonly currentFilter = signal<SharedGameFilter>(
		this.sharedGameFilterStorage.loadSharedGameFilter('export'),
	);

	/**
	 * Canonical filter snapshot used by the last successful Search.
	 *
	 * Export must always use this filter, even if the current live filter was
	 * edited afterwards.
	 */
	readonly executedFilter = signal<SharedGameFilter | null>(null);

	/** Aggregated summary returned by the backend for the last executed filter. */
	readonly summaryStats = signal<ExportSummaryStats | null>(null);

	/** Search action loading state. */
	readonly isSearching = signal(false);

	/** Export action loading state. */
	readonly isExporting = signal(false);

	readonly isBusy = computed(() => this.isSearching() || this.isExporting());

	readonly hasExecutedSearch = computed(
		() => this.executedFilter() !== null && this.summaryStats() !== null,
	);

	readonly searchButtonLabel = computed(() =>
		this.hasExecutedSearch() ? 'Run filter again' : 'Run filter',
	);

	readonly canExport = computed(() => {
		const executedFilter = this.executedFilter();
		const summaryStats = this.summaryStats();

		return (
			executedFilter !== null &&
			summaryStats !== null &&
			summaryStats.totalGames > 0 &&
			!this.isBusy()
		);
	});

	readonly isSummaryStale = computed(() => {
		const executedFilter = this.executedFilter();

		if (executedFilter === null) {
			return false;
		}

		return (
			this.stringifySharedGameFilter(this.currentFilter()) !==
			this.stringifySharedGameFilter(executedFilter)
		);
	});

	onInlineFilterChanged(filter: SharedGameFilter): void {
		this.currentFilter.set(filter);
	}

	async onSearch(): Promise<void> {
		if (this.isBusy()) {
			return;
		}

		this.isSearching.set(true);

		try {
			const result = await this.exportService.getSummary({
				filter: this.currentFilter(),
			});

			this.executedFilter.set(result.appliedFilter);
			this.summaryStats.set(result.stats);
		} catch (error) {
			console.error('[ExportPage] Failed to compute export summary:', error);

			this.notify.error('Failed to search export games.', {
				actionLabel: 'Retry',
				onAction: () => void this.onSearch(),
			});
		} finally {
			this.isSearching.set(false);
		}
	}

	async onExport(): Promise<void> {
		const executedFilter = this.executedFilter();
		const summaryStats = this.summaryStats();

		if (
			executedFilter === null ||
			summaryStats === null ||
			summaryStats.totalGames <= 0 ||
			this.isBusy()
		) {
			return;
		}

		this.isExporting.set(true);

		try {
			const result = await this.exportService.buildPgnFile({
				filter: executedFilter,
			});

			if (result.gamesCount <= 0) {
				this.notify.warn('No games were available to export for the last searched filter.');
				this.resetExecutionState();
				return;
			}

			this.triggerBrowserDownload(result);

			this.notify.success(`PGN export generated successfully (${result.gamesCount} games).`);
			this.resetExecutionState();
		} catch (error) {
			console.error('[ExportPage] Failed to generate PGN export:', error);

			this.notify.error('Failed to generate PGN export.', {
				actionLabel: 'Retry',
				onAction: () => void this.onExport(),
			});
		} finally {
			this.isExporting.set(false);
		}
	}

	private resetExecutionState(): void {
		this.executedFilter.set(null);
		this.summaryStats.set(null);
	}

	private triggerBrowserDownload(result: ExportBuildPgnResult): void {
		const blob = new Blob([result.content], { type: result.mimeType });
		const objectUrl = URL.createObjectURL(blob);

		const anchor = document.createElement('a');
		anchor.href = objectUrl;
		anchor.download = result.fileName;
		anchor.style.display = 'none';

		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();

		setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
	}

	private stringifySharedGameFilter(filter: SharedGameFilter): string {
		return JSON.stringify(filter);
	}
}
