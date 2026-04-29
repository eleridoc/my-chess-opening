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
	OpeningBookGetMovesSuccess,
	OpeningBookMove,
	OpeningBookOpeningInfo,
	OpeningBookSource,
	PromotionPiece,
} from 'my-chess-opening-core';

import { ExplorerFacade } from '../../facade/explorer.facade';
import { OpeningBookService } from '../../../services/opening-book/opening-book.service';
import { SectionLoaderComponent } from '../../../shared/loading/section-loader/section-loader.component';

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
 * - Board arrows are intentionally not handled here yet.
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
	],
	templateUrl: './explorer-opening-book-panel.component.html',
	styleUrl: './explorer-opening-book-panel.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerOpeningBookPanelComponent implements OnDestroy {
	private readonly facade = inject(ExplorerFacade);
	private readonly openingBookService = inject(OpeningBookService);

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

	readonly currentFen = computed(() => (this.facade.fen() ?? '').trim());

	constructor() {
		effect(() => {
			const source = this.selectedSource();
			const fen = this.currentFen();

			this.scheduleAutoRefresh(source, fen);
		});
	}

	ngOnDestroy(): void {
		this.cancelScheduledRefresh();

		// Invalidate any pending async response.
		this.loadSeq++;
	}

	setSource(source: string): void {
		if (source !== 'lichess' && source !== 'masters') {
			return;
		}

		if (this.selectedSource() === source) {
			return;
		}

		this.selectedSource.set(source);
	}

	onMoveSelected(move: OpeningBookMove): void {
		const attempt = this.parseMoveAttemptFromUci(move.uci);

		if (!attempt) {
			return;
		}

		this.facade.attemptMove(attempt);
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
				this.loadError.set(this.getErrorLabel(response.error.code, response.error.message));
				return;
			}

			this.result.set(response);
		} catch (error) {
			if (seq !== this.loadSeq) {
				return;
			}

			console.error('[ExplorerOpeningBookPanel] Failed to load opening book:', error);

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
				return `Lichess authentication is required to use the Opening Explorer.${details}`;

			case 'RATE_LIMITED':
				return `Too many requests to Lichess. Try again later.${details}`;

			case 'TIMEOUT':
				return `Opening book request timed out.${details}`;

			case 'NETWORK_ERROR':
				return `Network error while loading the opening book.${details}`;

			case 'REMOTE_ERROR':
				return `Opening book remote service returned an error.${details}`;

			default:
				return `Opening book unavailable.${details}`;
		}
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
