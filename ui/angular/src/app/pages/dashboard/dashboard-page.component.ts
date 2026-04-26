import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import type {
	DashboardAccountBlock,
	DashboardOverviewResult,
	SharedGameFilter,
} from 'my-chess-opening-core';

import { DashboardService } from '../../services/dashboard/dashboard.service';
import { SharedGameFilterComponent } from '../../shared/game-filter/components';
import { SharedGameFilterStorageService } from '../../shared/game-filter/services/shared-game-filter-storage.service';
import { SectionLoaderComponent } from '../../shared/loading/section-loader/section-loader.component';
import { NotificationService } from '../../shared/notifications/notification.service';
import { DashboardAccountBlockComponent } from './components/dashboard-account-block/dashboard-account-block.component';
import {
	DashboardHeatmapComponent,
	type DashboardHeatmapPoint,
} from './components/dashboard-heatmap/dashboard-heatmap.component';
import { DashboardSummaryCardComponent } from './components/dashboard-summary-card/dashboard-summary-card.component';

/**
 * Dashboard page.
 *
 * V1.12 scope:
 * - display the Dashboard shared filter inline
 * - use the dedicated "dashboard" localStorage filter context
 * - load the Dashboard overview from Electron IPC
 * - render global Dashboard blocks
 * - render one selected account details block
 * - manage loading, error and empty states
 */
@Component({
	selector: 'app-dashboard-page',
	standalone: true,
	imports: [
		CommonModule,
		MatFormFieldModule,
		MatSelectModule,
		SharedGameFilterComponent,
		SectionLoaderComponent,
		DashboardSummaryCardComponent,
		DashboardHeatmapComponent,
		DashboardAccountBlockComponent,
	],
	templateUrl: './dashboard-page.component.html',
	styleUrl: './dashboard-page.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent {
	private readonly dashboardService = inject(DashboardService);
	private readonly sharedGameFilterStorage = inject(SharedGameFilterStorageService);
	private readonly notify = inject(NotificationService);

	private latestRequestId = 0;

	/**
	 * Current live filter shown in the inline Dashboard filter.
	 *
	 * It is initialized from the dedicated "dashboard" shared filter context,
	 * which means it has its own localStorage lifecycle.
	 */
	readonly currentFilter = signal<SharedGameFilter>(
		this.sharedGameFilterStorage.loadSharedGameFilter('dashboard'),
	);

	/** Full Dashboard overview returned by the backend. */
	readonly overview = signal<DashboardOverviewResult | null>(null);

	/**
	 * Currently selected account id for the detailed account dashboard.
	 *
	 * The value is synchronized after each backend load so it always points
	 * to an account available in the current filtered result set.
	 */
	readonly selectedAccountId = signal<string | null>(null);

	/** Local page loading state for the overview request. */
	readonly isLoading = signal(false);

	/** Last loading error message, if any. */
	readonly errorMessage = signal<string | null>(null);

	readonly hasLoaded = computed(() => this.overview() !== null);

	readonly isEmpty = computed(() => {
		const overview = this.overview();

		return overview !== null && overview.global.summary.totalGames <= 0;
	});

	readonly loadedGamesCount = computed(() => this.overview()?.global.summary.totalGames ?? 0);

	readonly loadedAccountsCount = computed(() => this.overview()?.accounts.length ?? 0);

	readonly accountBlocks = computed<DashboardAccountBlock[]>(() => this.overview()?.accounts ?? []);

	/**
	 * Account currently displayed in the detailed account section.
	 *
	 * If the selected account no longer exists after a filter change,
	 * the first available account is used as a safe fallback.
	 */
	readonly selectedAccountBlock = computed<DashboardAccountBlock | null>(() => {
		const accounts = this.accountBlocks();

		if (accounts.length === 0) {
			return null;
		}

		const selectedAccountId = this.selectedAccountId();

		return (
			accounts.find((account) => account.accountId === selectedAccountId) ?? accounts[0] ?? null
		);
	});

	readonly globalDailyActivityPoints = computed<DashboardHeatmapPoint[]>(() => {
		const overview = this.overview();

		if (!overview) {
			return [];
		}

		return overview.global.dailyActivity.map((point) => ({
			date: point.date,
			value: point.gamesCount,
		}));
	});

	readonly globalDailyResultRatioPoints = computed<DashboardHeatmapPoint[]>(() => {
		const overview = this.overview();

		if (!overview) {
			return [];
		}

		return overview.global.dailyResultRatio.map((point) => ({
			date: point.date,
			value: point.val,
			tooltipText: this.buildResultRatioTooltipText(point),
		}));
	});

	readonly heatmapStartDate = computed(() => {
		const range = this.overview()?.playedDateRange;

		return range?.from ?? null;
	});

	readonly periodLabel = computed(() => {
		const range = this.overview()?.playedDateRange;

		if (!range) {
			return 'No period loaded yet';
		}

		if (range.from && range.to) {
			return `${range.from} → ${range.to}`;
		}

		if (range.from) {
			return `From ${range.from}`;
		}

		if (range.to) {
			return `Until ${range.to}`;
		}

		return 'All dates';
	});

	constructor() {
		void this.loadOverview(this.currentFilter());
	}

	onInlineFilterChanged(filter: SharedGameFilter): void {
		this.currentFilter.set(filter);
		void this.loadOverview(filter);
	}

	onRetry(): void {
		void this.loadOverview(this.currentFilter());
	}

	selectAccount(accountId: string): void {
		this.selectedAccountId.set(accountId);
	}

	trackAccountById(_index: number, account: DashboardAccountBlock): string {
		return account.accountId;
	}

	accountOptionLabel(account: DashboardAccountBlock): string {
		return `${account.username} · ${this.siteLabel(account.site)}`;
	}

	private async loadOverview(filter: SharedGameFilter): Promise<void> {
		const requestId = ++this.latestRequestId;

		this.isLoading.set(true);
		this.errorMessage.set(null);

		try {
			const overview = await this.dashboardService.getOverview({ filter });

			if (requestId !== this.latestRequestId) {
				return;
			}

			this.overview.set(overview);
			this.syncSelectedAccount(overview.accounts);
		} catch (error) {
			if (requestId !== this.latestRequestId) {
				return;
			}

			console.error('[DashboardPage] Failed to load dashboard overview:', error);

			this.overview.set(null);
			this.selectedAccountId.set(null);
			this.errorMessage.set('Failed to load Dashboard data.');

			this.notify.error('Failed to load Dashboard data.', {
				actionLabel: 'Retry',
				onAction: () => this.onRetry(),
			});
		} finally {
			if (requestId === this.latestRequestId) {
				this.isLoading.set(false);
			}
		}
	}

	/**
	 * Keeps the selected account stable across reloads when possible.
	 *
	 * If the current account disappears because of a period filter change,
	 * the first account in the new result set becomes selected.
	 */
	private syncSelectedAccount(accounts: DashboardAccountBlock[]): void {
		if (accounts.length === 0) {
			this.selectedAccountId.set(null);
			return;
		}

		const currentAccountId = this.selectedAccountId();
		const currentAccountStillExists = accounts.some(
			(account) => account.accountId === currentAccountId,
		);

		if (!currentAccountStillExists) {
			this.selectedAccountId.set(accounts[0].accountId);
		}
	}

	private siteLabel(site: DashboardAccountBlock['site']): string {
		switch (site) {
			case 'LICHESS':
				return 'Lichess';

			case 'CHESSCOM':
				return 'Chess.com';

			default:
				return String(site);
		}
	}

	private buildResultRatioTooltipText(point: {
		date: string;
		wins: number;
		draws: number;
		losses: number;
		score: number;
		decisiveGames: number;
		ratio: number;
		val: number;
	}): string {
		if (point.val === 0) {
			return `No games on ${point.date}`;
		}

		const trend =
			point.val === 1 ? 'Positive day' : point.val === 4 ? 'Negative day' : 'Neutral day';

		return `${trend} · ratio ${point.ratio} · ${point.wins}W / ${point.draws}D / ${point.losses}L on ${point.date}`;
	}
}
