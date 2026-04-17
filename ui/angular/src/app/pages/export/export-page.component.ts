import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	inject,
	signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import type {
	ExportBuildPgnResult,
	ExportSummaryStats,
	SharedGameFilter,
} from 'my-chess-opening-core';

import { ExportPreferencesStorageService } from '../../services/export/export-preferences-storage.service';
import { ExportService } from '../../services/export/export.service';
import { SharedGameFilterComponent } from '../../shared/game-filter/components';
import { SharedGameFilterStorageService } from '../../shared/game-filter/services/shared-game-filter-storage.service';
import { SectionLoaderComponent } from '../../shared/loading/section-loader/section-loader.component';
import { NotificationService } from '../../shared/notifications/notification.service';

/**
 * Export page.
 *
 * V1.8.6 polish:
 * - keep the shared filter state live and persistent
 * - execute Search only on explicit user action
 * - keep a dedicated executed filter snapshot for summary/export
 * - generate and download a PGN file from the last executed filter
 * - allow clearing the current result without resetting the filter
 * - make summary status clearer (up-to-date / stale / empty)
 *
 * Extra export option:
 * - allow overriding the owner's exported PGN name with a unified player name
 * - persist the last entered unified name in localStorage
 */
@Component({
	selector: 'app-export-page',
	standalone: true,
	imports: [
		CommonModule,
		ReactiveFormsModule,
		MatButtonModule,
		MatFormFieldModule,
		MatInputModule,
		SharedGameFilterComponent,
		SectionLoaderComponent,
	],
	templateUrl: './export-page.component.html',
	styleUrl: './export-page.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportPageComponent {
	private readonly destroyRef = inject(DestroyRef);
	private readonly sharedGameFilterStorage = inject(SharedGameFilterStorageService);
	private readonly exportPreferencesStorage = inject(ExportPreferencesStorageService);
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

	/**
	 * Optional unified player name applied only when exporting PGNs.
	 *
	 * This value does not affect the summary counts and therefore does not
	 * require re-running Search when edited.
	 */
	readonly unifiedPlayerNameControl = new FormControl<string>(
		this.exportPreferencesStorage.loadUnifiedPlayerName(),
		{ nonNullable: true },
	);

	readonly isBusy = computed(() => this.isSearching() || this.isExporting());

	readonly hasExecutedSearch = computed(
		() => this.executedFilter() !== null && this.summaryStats() !== null,
	);

	readonly searchButtonLabel = computed(() =>
		this.hasExecutedSearch() ? 'Filter games again' : 'Filter games',
	);

	readonly canClearResult = computed(() => this.hasExecutedSearch() && !this.isBusy());

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

	readonly exportButtonLabel = computed(() => {
		const totalGames = this.summaryStats()?.totalGames ?? 0;

		if (totalGames <= 0) {
			return 'Export PGN';
		}

		return totalGames === 1 ? 'Export PGN (1 game)' : `Export PGN (${totalGames} games)`;
	});

	readonly summaryStatusTitle = computed(() => {
		const summaryStats = this.summaryStats();

		if (summaryStats === null) {
			return '';
		}

		if (summaryStats.totalGames === 0) {
			return 'No games found';
		}

		if (this.isSummaryStale()) {
			return 'Summary is out of date';
		}

		return 'Summary is up to date';
	});

	readonly summaryStatusMessage = computed(() => {
		const summaryStats = this.summaryStats();

		if (summaryStats === null) {
			return '';
		}

		if (summaryStats.totalGames === 0) {
			return 'The last searched filter did not match any games. Adjust the filter and run it again.';
		}

		if (this.isSummaryStale()) {
			return 'Current filter has changed since the last search. Export PGN will still use the last searched filter.';
		}

		return 'The current visible filter matches the summary below. Export PGN will use this same searched filter.';
	});

	readonly summaryStatusClass = computed(() => {
		const summaryStats = this.summaryStats();

		if (summaryStats === null) {
			return '';
		}

		if (summaryStats.totalGames === 0) {
			return 'export-page__status export-page__status--empty';
		}

		if (this.isSummaryStale()) {
			return 'export-page__status export-page__status--stale';
		}

		return 'export-page__status export-page__status--fresh';
	});

	constructor() {
		this.unifiedPlayerNameControl.valueChanges
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((value) => {
				this.exportPreferencesStorage.saveUnifiedPlayerName(value);
			});
	}

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

			this.notify.error('Failed to filter export games.', {
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
			const unifiedPlayerName = this.getNormalizedUnifiedPlayerName();

			const result = await this.exportService.buildPgnFile({
				filter: executedFilter,
				unifiedPlayerName,
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

	onClearResult(): void {
		if (!this.canClearResult()) {
			return;
		}

		this.resetExecutionState();
	}

	private resetExecutionState(): void {
		this.executedFilter.set(null);
		this.summaryStats.set(null);
	}

	private getNormalizedUnifiedPlayerName(): string {
		const rawValue = this.unifiedPlayerNameControl.getRawValue();
		const normalizedValue = this.exportPreferencesStorage.saveUnifiedPlayerName(rawValue);

		if (normalizedValue !== rawValue) {
			this.unifiedPlayerNameControl.setValue(normalizedValue, { emitEvent: false });
		}

		return normalizedValue;
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
