import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { GamesListItem, PlayerColor } from 'my-chess-opening-core';
import { GamesService } from '../../services/games/games.service';
import { NotificationService } from '../../shared/notifications/notification.service';
import { ExternalLinkService } from '../../shared/system/external-link.service';
import { ratedLabel, timeLabel, openingLabel, myResultLabel } from '../../shared/games/game-format';

import { IsoDateTimePipe } from '../../shared/dates/pipes';
import { SectionLoaderComponent } from '../../shared/loading/section-loader/section-loader.component';

type Outcome = 'win' | 'loss' | 'draw' | 'unknown';

@Component({
	standalone: true,
	selector: 'app-games-page',
	imports: [
		CommonModule,
		FormsModule,
		IsoDateTimePipe,
		MatTableModule,
		MatPaginatorModule,
		MatFormFieldModule,
		MatInputModule,
		MatButtonModule,
		MatIconModule,
		MatSelectModule,
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
	private readonly COLOR_WHITE: PlayerColor = 'white';
	private readonly COLOR_BLACK: PlayerColor = 'black';

	// Data
	items = signal<GamesListItem[]>([]);
	total = signal(0);
	loading = signal(false);

	// Filters (minimal for now)
	search = signal('');

	// Paging
	page = signal(1); // 1-based
	pageSize = signal(50);

	playedAtOrder = signal<'desc' | 'asc'>('desc');

	private reloadTimer: any = null;

	constructor(
		private readonly games: GamesService,
		private readonly router: Router,
		private readonly notify: NotificationService,
	) {
		// Auto-load on state changes (with small debounce)
		effect(() => {
			void this.page();
			void this.pageSize();
			void this.search();
			void this.playedAtOrder();
			this.queueReload();
		});
	}

	private queueReload(): void {
		if (this.reloadTimer) clearTimeout(this.reloadTimer);

		// Optional UX: show loader immediately while debounce is pending
		this.loading.set(true);

		this.reloadTimer = setTimeout(() => void this.loadPage(), 200);
	}

	reloadNow(): void {
		if (this.reloadTimer) clearTimeout(this.reloadTimer);
		void this.loadPage();
	}

	onSearch(value: string): void {
		this.search.set(value ?? '');
		this.page.set(1);
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

		const dir = sort.direction === 'asc' ? 'asc' : 'desc'; // fallback desc
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

	private async loadPage(): Promise<void> {
		this.loading.set(true);
		try {
			const q = this.search().trim();

			const res = await this.games.list({
				page: this.page(),
				pageSize: this.pageSize(),
				playedAtOrder: this.playedAtOrder(),
				filters: {
					search: q.length ? q : null,
				},
			});

			this.items.set(res.items);
			this.total.set(res.total);
		} catch (e) {
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
