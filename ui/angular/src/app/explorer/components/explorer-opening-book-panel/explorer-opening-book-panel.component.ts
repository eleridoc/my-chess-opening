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

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

import type {
	OpeningBookErrorCode,
	OpeningBookGetMovesSuccess,
	OpeningBookMove,
	OpeningBookOpeningInfo,
	OpeningBookSource,
	PromotionPiece,
} from 'my-chess-opening-core';

import { OpeningBookService } from '../../../services/opening-book/opening-book.service';
import { SectionLoaderComponent } from '../../../shared/loading/section-loader/section-loader.component';
import type { ExplorerBoardArrow } from '../../board/board-arrows.types';
import { ExplorerFacade } from '../../facade/explorer.facade';
import { ExplorerBoardArrowsService } from '../../services/explorer-board-arrows.service';

import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface OpeningBookSourceOption {
	value: OpeningBookSource;
	label: string;
}

/**
 * Explorer panel dedicated to the external Opening Book feature.
 *
 * Responsibilities:
 * - react to the current Explorer position
 * - load external opening book data with a small debounce
 * - render candidate moves and current-position summary
 * - keep errors inline because this feature depends on an external service
 *
 * Notes:
 * - Board arrows use the shared ExplorerBoardArrowsService, like "My next moves".
 * - The current-position summary is rendered as a fixed footer row, matching
 *   the "My next moves" visual pattern.
 */
@Component({
	selector: 'app-explorer-opening-book-panel',
	standalone: true,
	imports: [
		CommonModule,
		MatFormFieldModule,
		MatSelectModule,
		MatTooltipModule,
		SectionLoaderComponent,
		MatButtonModule,
		MatIconModule,
	],
	templateUrl: './explorer-opening-book-panel.component.html',
	styleUrl: './explorer-opening-book-panel.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerOpeningBookPanelComponent implements OnDestroy {
	private readonly router = inject(Router);
	private readonly facade = inject(ExplorerFacade);
	private readonly openingBookService = inject(OpeningBookService);
	private readonly boardArrows = inject(ExplorerBoardArrowsService);

	private readonly numberFormatter = new Intl.NumberFormat();

	/**
	 * Keep external calls slightly delayed while the user navigates quickly
	 * through moves.
	 */
	private readonly autoRefreshDebounceMs = 400;

	/**
	 * Last-wins token used to ignore obsolete async responses.
	 */
	private loadSeq = 0;

	private refreshTimeoutId: ReturnType<typeof setTimeout> | null = null;

	readonly sourceOptions: OpeningBookSourceOption[] = [
		{ value: 'lichess', label: 'Lichess database' },
		{ value: 'masters', label: 'Masters' },
	];

	readonly selectedSource = signal<OpeningBookSource>('lichess');

	readonly result = signal<OpeningBookGetMovesSuccess | null>(null);

	readonly isLoading = signal(false);

	readonly loadError = signal<string | null>(null);

	readonly loadErrorCode = signal<OpeningBookErrorCode | null>(null);

	readonly isLichessAuthError = computed(() => this.loadErrorCode() === 'AUTH_REQUIRED');

	readonly isTransientOpeningBookError = computed(() => {
		const code = this.loadErrorCode();

		return (
			code === 'NETWORK_ERROR' ||
			code === 'TIMEOUT' ||
			code === 'RATE_LIMITED' ||
			code === 'REMOTE_ERROR' ||
			code === 'UNEXPECTED_ERROR'
		);
	});

	readonly currentFen = computed(() => (this.facade.fen() ?? '').trim());

	readonly currentArrowMode = computed(() => this.boardArrows.getArrowMode('opening-book'));

	constructor() {
		effect(() => {
			const source = this.selectedSource();
			const fen = this.currentFen();

			this.scheduleAutoRefresh(source, fen);
		});

		effect(() => {
			const book = this.result();

			if (!book) {
				this.boardArrows.clearSourceArrows('opening-book');
				this.boardArrows.clearHoveredArrow('opening-book');
				return;
			}

			this.boardArrows.setSourceArrows('opening-book', this.buildBoardArrows(book.moves));
		});
	}

	async openLichessSettings(): Promise<void> {
		await this.router.navigate(['/settings'], { fragment: 'lichess' });
	}

	ngOnDestroy(): void {
		this.cancelScheduledRefresh();

		// Invalidate any pending async response.
		this.loadSeq++;

		this.boardArrows.clearSourceArrows('opening-book');
		this.boardArrows.clearHoveredArrow('opening-book');
		this.boardArrows.clearActiveSource('opening-book');
	}

	setSource(source: string): void {
		if (source !== 'lichess' && source !== 'masters') {
			return;
		}

		if (this.selectedSource() === source) {
			return;
		}

		this.boardArrows.setActiveSource('opening-book');
		this.selectedSource.set(source);
	}

	setArrowMode(mode: string): void {
		if (!this.isArrowMode(mode)) {
			return;
		}

		this.boardArrows.setArrowMode('opening-book', mode);
	}

	onMoveSelected(move: OpeningBookMove): void {
		this.boardArrows.setActiveSource('opening-book');

		const attempt = this.parseMoveAttemptFromUci(move.uci);

		if (!attempt) {
			return;
		}

		this.facade.attemptMove(attempt);
	}

	onMoveHovered(move: OpeningBookMove | null): void {
		this.boardArrows.setHoveredArrow('opening-book', move?.uci ?? null);
	}

	trackByMove(_index: number, move: OpeningBookMove): string {
		return `${move.uci}::${move.san}`;
	}

	formatNumber(value: number): string {
		return this.numberFormatter.format(value);
	}

	formatPercent(value: number): string {
		return `${Math.round(this.clampPercent(value))}%`;
	}

	formatAverageRating(value: number | null): string {
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			return '—';
		}

		return String(Math.round(value));
	}

	formatOpening(opening: OpeningBookOpeningInfo | null): string {
		if (!opening) {
			return '—';
		}

		if (opening.eco && opening.name) {
			return `${opening.eco} · ${opening.name}`;
		}

		return opening.eco ?? opening.name ?? '—';
	}

	clampPercent(value: number): number {
		if (!Number.isFinite(value)) {
			return 0;
		}

		return Math.max(0, Math.min(100, value));
	}

	retryLoadOpeningBook(): void {
		this.cancelScheduledRefresh();

		const source = this.selectedSource();
		const fen = this.currentFen().trim();

		if (!fen) {
			this.result.set(null);
			this.isLoading.set(false);
			this.loadErrorCode.set(null);
			this.loadError.set('No position is currently available.');
			return;
		}

		const seq = ++this.loadSeq;

		void this.loadOpeningBook(source, fen, seq);
	}

	/**
	 * Only show an inline label inside an outcome segment when the segment
	 * is wide enough to keep the row readable.
	 */
	shouldShowOutcomeLabel(value: number): boolean {
		return this.clampPercent(value) >= 14;
	}

	/**
	 * Schedule automatic refresh when the Explorer position or book source
	 * changes.
	 *
	 * Signal writes are intentionally performed inside the timer callback, not
	 * directly inside the Angular effect.
	 */
	private scheduleAutoRefresh(source: OpeningBookSource, fen: string): void {
		this.cancelScheduledRefresh();

		const seq = ++this.loadSeq;
		const normalizedFen = fen.trim();
		const delayMs = normalizedFen ? this.autoRefreshDebounceMs : 0;

		this.refreshTimeoutId = setTimeout(() => {
			this.refreshTimeoutId = null;

			if (seq !== this.loadSeq) {
				return;
			}

			if (!normalizedFen) {
				this.result.set(null);
				this.isLoading.set(false);
				this.loadErrorCode.set(null);
				this.loadError.set('No position is currently available.');
				return;
			}

			void this.loadOpeningBook(source, normalizedFen, seq);
		}, delayMs);
	}

	private async loadOpeningBook(
		source: OpeningBookSource,
		fen: string,
		seq: number,
	): Promise<void> {
		this.isLoading.set(true);
		this.loadError.set(null);
		this.loadErrorCode.set(null);

		try {
			const response = await this.openingBookService.getMoves({
				source,
				fen,
				maxMoves: 10,
			});

			if (seq !== this.loadSeq) {
				return;
			}

			if (!response.ok) {
				this.result.set(null);
				this.loadErrorCode.set(response.error.code);
				this.loadError.set(this.getErrorLabel(response.error.code, response.error.message));
				return;
			}

			this.loadErrorCode.set(null);
			this.result.set(response);
		} catch (error) {
			if (seq !== this.loadSeq) {
				return;
			}

			console.error('[ExplorerOpeningBookPanel] Failed to load opening book:', error);

			this.loadErrorCode.set(null);
			this.result.set(null);
			this.loadError.set('Opening book unavailable.');
		} finally {
			if (seq === this.loadSeq) {
				this.isLoading.set(false);
			}
		}
	}

	private cancelScheduledRefresh(): void {
		if (!this.refreshTimeoutId) {
			return;
		}

		clearTimeout(this.refreshTimeoutId);
		this.refreshTimeoutId = null;
	}

	private getErrorLabel(code: string, message?: string): string {
		const details = message ? ` ${message}` : '';

		switch (code) {
			case 'INVALID_INPUT':
				return `Invalid opening book request.${details}`;

			case 'AUTH_REQUIRED':
				return `A Lichess token is required to use the Opening Book.${details}`;

			case 'RATE_LIMITED':
				return `Too many requests to Lichess. Try again later.${details}`;

			case 'TIMEOUT':
				return `Opening book request timed out.${details}`;

			case 'NETWORK_ERROR':
				return `Network error while loading the opening book.${details}`;

			case 'REMOTE_ERROR':
				return `Opening book remote service returned an error.${details}`;

			case 'SECURE_STORAGE_UNAVAILABLE':
				return `Secure token storage is not available on this system.${details}`;

			default:
				return `Opening book unavailable.${details}`;
		}
	}

	private buildBoardArrows(moves: OpeningBookMove[]): ExplorerBoardArrow[] {
		const arrows: ExplorerBoardArrow[] = [];

		const totalGames = moves.reduce((sum, move) => sum + move.outcomes.total, 0);

		for (let index = 0; index < moves.length; index++) {
			const move = moves[index];
			const parsed = this.parseArrowSquaresFromUci(move.uci);

			if (!parsed) {
				continue;
			}

			const weight = totalGames > 0 ? (move.outcomes.total / totalGames) * 100 : 0;

			arrows.push({
				source: 'opening-book',
				from: parsed.from,
				to: parsed.to,
				uci: move.uci,
				label: move.san,
				rank: index + 1,
				weight,
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

	private isArrowMode(mode: string): mode is 'off' | 'top3' | 'top5' | 'all' {
		return mode === 'off' || mode === 'top3' || mode === 'top5' || mode === 'all';
	}

	/**
	 * Convert a UCI string into an Explorer move attempt.
	 *
	 * Supported forms:
	 * - e2e4
	 * - e7e8q
	 */
	private parseMoveAttemptFromUci(
		uci: string,
	): { from: string; to: string; promotion?: PromotionPiece } | null {
		const normalized = typeof uci === 'string' ? uci.trim().toLowerCase() : '';

		if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(normalized)) {
			return null;
		}

		const promotionRaw = normalized.length === 5 ? normalized[4] : undefined;
		const promotion =
			promotionRaw === 'q' || promotionRaw === 'r' || promotionRaw === 'b' || promotionRaw === 'n'
				? promotionRaw
				: undefined;

		return {
			from: normalized.slice(0, 2),
			to: normalized.slice(2, 4),
			promotion,
		};
	}
}
