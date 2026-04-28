import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { GamesListItem, PlayerColor } from 'my-chess-opening-core';
import {
	countActiveSharedGameFilterFields,
	type SharedGameFilter,
} from 'my-chess-opening-core/filters';

import { GamesService } from '../../services/games/games.service';
import { IsoDateTimePipe } from '../../shared/dates/pipes';
import { ratedLabel, timeLabel, openingLabel, myResultLabel } from '../../shared/games/game-format';
import { SharedGameFilterContextService } from '../../shared/game-filter/services/shared-game-filter-context.service';
import { SharedGameFilterDialogService } from '../../shared/game-filter/services/shared-game-filter-dialog.service';
import { SharedGameFilterStorageService } from '../../shared/game-filter/services/shared-game-filter-storage.service';
import { SectionLoaderComponent } from '../../shared/loading/section-loader/section-loader.component';
import { NotificationService } from '../../shared/notifications/notification.service';
import { ExternalLinkService } from '../../shared/system/external-link.service';

type Outcome = 'win' | 'loss' | 'draw' | 'unknown';

@Component({
	standalone: true,
	selector: 'app-games-page',
	imports: [
		CommonModule,
		IsoDateTimePipe,
		MatTableModule,
		MatPaginatorModule,
		MatButtonModule,
		MatIconModule,
		MatSortModule,
		MatTooltipModule,
		SectionLoaderComponent,
	],
	templateUrl: './games-page.component.html',
	styleUrl: './games-page.component.scss',
})
export class GamesPageComponent {
	readonly displayedColumns = [
		'playedAt',
		'site',
		'white',
		'black',
		'result',
		'moves',
		'opening',
		'speed',
		'time',
		'rated',
		'actions',
	];

	readonly ratedLabel = ratedLabel;
	readonly timeLabel = timeLabel;
	readonly openingLabel = openingLabel;
	readonly myResultLabel = myResultLabel;

	private readonly externalLink = inject(ExternalLinkService);
	private readonly sharedGameFilterStorage = inject(SharedGameFilterStorageService);
	private readonly sharedGameFilterContext = inject(SharedGameFilterContextService);
	private readonly sharedGameFilterDialog = inject(SharedGameFilterDialogService);

	private readonly COLOR_WHITE: PlayerColor = 'white';
	private readonly COLOR_BLACK: PlayerColor = 'black';

	/**
	 * Resolved once and reused for active-filter counting.
	 *
	 * The Games context hides filters that are not supported by the current
	 * Games backend query mapping.
	 */
	private readonly gamesFilterContextConfig =
		this.sharedGameFilterContext.getSharedGameFilterContextConfig('games');

	private reloadTimer: ReturnType<typeof setTimeout> | null = null;

	// Data
	readonly items = signal<GamesListItem[]>([]);
	readonly total = signal(0);
	readonly loading = signal(false);

	/**
	 * Current live shared filter used by the Games page.
	 *
	 * It is initialized from the dedicated "games" shared filter context,
	 * which means it has its own localStorage lifecycle.
	 */
	readonly currentFilter = signal<SharedGameFilter>(
		this.sharedGameFilterStorage.loadSharedGameFilter('games', this.gamesFilterContextConfig),
	);

	readonly activeFilterCount = computed(() =>
		countActiveSharedGameFilterFields(this.currentFilter(), this.gamesFilterContextConfig),
	);

	readonly hasActiveFilters = computed(() => this.activeFilterCount() > 0);

	readonly filterButtonLabel = computed(() => {
		const activeCount = this.activeFilterCount();

		return activeCount > 0 ? `Filter (${activeCount})` : 'Filter';
	});

	readonly emptyMessage = computed(() =>
		this.hasActiveFilters() ? 'No games match the selected filters.' : 'No games imported yet.',
	);

	// Paging
	readonly page = signal(1); // 1-based
	readonly pageSize = signal(50);

	readonly playedAtOrder = signal<'desc' | 'asc'>('desc');

	constructor(
		private readonly games: GamesService,
		private readonly router: Router,
		private readonly notify: NotificationService,
	) {
		// Auto-load on state changes with a small debounce.
		effect(() => {
			void this.page();
			void this.pageSize();
			void this.currentFilter();
			void this.playedAtOrder();

			this.queueReload();
		});
	}

	openFilterDialog(): void {
		this.sharedGameFilterDialog.openSharedGameFilterDialog({
			title: 'Games filters',
			context: 'games',
			initialValue: this.currentFilter(),
			persistInStorage: true,
			resetButtonLabel: 'Reset filters',
			onFilterChanged: (filter) => {
				this.onGamesFilterChanged(filter);
			},
		});
	}

	onGamesFilterChanged(filter: SharedGameFilter): void {
		this.currentFilter.set(filter);
		this.page.set(1);
	}

	reloadNow(): void {
		if (this.reloadTimer) {
			clearTimeout(this.reloadTimer);
			this.reloadTimer = null;
		}

		void this.loadPage();
	}

	onPage(event: PageEvent): void {
		this.pageSize.set(event.pageSize);
		this.page.set(event.pageIndex + 1);
	}

	openInExplorer(gameId: string): void {
		void this.router.navigate(['/explorer'], {
			queryParams: { dbGameId: gameId },
			queryParamsHandling: 'merge',
		});
	}

	onSortChange(sort: Sort): void {
		if (sort.active !== 'playedAt') return;

		const dir = sort.direction === 'asc' ? 'asc' : 'desc';
		this.playedAtOrder.set(dir);
		this.page.set(1);
	}

	trackById = (_: number, item: GamesListItem) => item.id;

	openExternal(url: string | null, event?: Event): void {
		this.externalLink.open(url, event);
	}

	// --- Player styling helpers ---

	private outcomeForMe(g: GamesListItem): Outcome {
		const r = (g.result ?? '').trim();

		if (r === '1/2-1/2') return 'draw';
		if (r === '1-0') return g.myColor === this.COLOR_WHITE ? 'win' : 'loss';
		if (r === '0-1') return g.myColor === this.COLOR_BLACK ? 'win' : 'loss';

		return 'unknown';
	}

	playerClasses(g: GamesListItem, side: PlayerColor): Record<string, boolean> {
		const username = side === this.COLOR_WHITE ? g.whiteUsername : g.blackUsername;
		const isMe = username === g.myUsername;

		if (!isMe) return {};

		const outcome = this.outcomeForMe(g);

		return {
			'games-player--me': true,
			'games-player--me-win': outcome === 'win',
			'games-player--me-loss': outcome === 'loss',
			'games-player--me-draw': outcome === 'draw',
		};
	}

	private queueReload(): void {
		if (this.reloadTimer) {
			clearTimeout(this.reloadTimer);
		}

		// Optional UX: show loader immediately while debounce is pending.
		this.loading.set(true);

		this.reloadTimer = setTimeout(() => void this.loadPage(), 200);
	}

	private async loadPage(): Promise<void> {
		this.loading.set(true);

		try {
			const res = await this.games.list({
				page: this.page(),
				pageSize: this.pageSize(),
				playedAtOrder: this.playedAtOrder(),
				filter: this.currentFilter(),
			});

			this.items.set(res.items);
			this.total.set(res.total);
		} catch {
			this.notify.error('Failed to load games.', {
				actionLabel: 'Retry',
				onAction: () => this.reloadNow(),
			});
			this.items.set([]);
			this.total.set(0);
		} finally {
			this.loading.set(false);
		}
	}
}
