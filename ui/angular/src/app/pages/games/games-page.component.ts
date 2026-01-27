import { CommonModule, DatePipe } from '@angular/common';
import { Component, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import type { GamesListItem, PlayerColor } from 'my-chess-opening-core';
import { GamesService } from '../../services/games.service';

type Outcome = 'win' | 'loss' | 'draw' | 'unknown';

@Component({
	standalone: true,
	selector: 'app-games-page',
	imports: [
		CommonModule,
		FormsModule,
		DatePipe,

		MatTableModule,
		MatPaginatorModule,
		MatFormFieldModule,
		MatInputModule,
		MatButtonModule,
		MatIconModule,
		MatProgressSpinnerModule,
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

	private reloadTimer: any = null;

	constructor(
		private readonly games: GamesService,
		private readonly router: Router,
	) {
		// Auto-load on state changes (with small debounce)
		effect(() => {
			void this.page();
			void this.pageSize();
			void this.search();
			this.queueReload();
		});
	}

	private queueReload(): void {
		if (this.reloadTimer) clearTimeout(this.reloadTimer);
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

	trackById = (_: number, item: GamesListItem) => item.id;

	myResultLabel(g: GamesListItem): string {
		// Preferred: use resultKey (1 win / 0 draw / -1 loss)
		if (g.myResultKey === 1) return '1';
		if (g.myResultKey === 0) return '1/2';
		if (g.myResultKey === -1) return '0';
		return '—';
	}

	private parseTimeControl(tc: string): { mins: string; inc: string } {
		const raw = (tc ?? '').trim();
		if (!raw) return { mins: '—', inc: '—' };

		// Accept common formats: "10+5", "600+5", "10|5", "10 + 5"
		const m = raw.match(/^(\d+)\s*(?:\+|\|)\s*(\d+)$/);
		if (!m) return { mins: raw, inc: '—' };

		const a = Number(m[1]);
		const b = Number(m[2]);

		// If a looks like seconds, convert to minutes.
		const mins =
			a > 60
				? (a % 60 === 0 ? String(a / 60) : String(Math.round((a / 60) * 10) / 10)).replace(
						/\.0$/,
						'',
					)
				: String(a);

		return { mins, inc: String(b) };
	}

	timeLabel(tc: string): string {
		const t = this.parseTimeControl(tc);
		return `${t.mins} | ${t.inc}`;
	}

	openExternal(url: string | null, event?: MouseEvent): void {
		event?.preventDefault();
		event?.stopPropagation();

		if (!url) return;

		if (!window.electron) {
			// Fallback (dev in browser)
			window.open(url, '_blank', 'noopener,noreferrer');
			return;
		}

		void window.electron.system.openExternal(url);
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
				filters: {
					search: q.length ? q : null,
				},
			});

			this.items.set(res.items);
			this.total.set(res.total);
		} catch (e) {
			console.error('[UI] Failed to load games:', e);
			this.items.set([]);
			this.total.set(0);
		} finally {
			this.loading.set(false);
		}
	}
}
