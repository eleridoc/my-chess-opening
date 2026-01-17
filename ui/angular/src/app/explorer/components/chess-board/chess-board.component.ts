import {
	AfterViewInit,
	Component,
	ElementRef,
	EventEmitter,
	Inject,
	Input,
	OnChanges,
	OnDestroy,
	Output,
	SimpleChanges,
	ViewChild,
} from '@angular/core';

import type { ExplorerMoveAttempt } from 'my-chess-opening-core/explorer';

import {
	CHESS_BOARD_ADAPTER_FACTORY,
	type BoardOrientation,
	type ChessBoardAdapter,
	type ChessBoardAdapterFactory,
} from '../../board/board-adapter';

import type { BoardLastMoveSquares } from '../../board/board-adapter';

/**
 * ChessBoardComponent (UI)
 *
 * Responsibilities:
 * - Render a chessboard using the injected adapter implementation.
 * - Keep the board in sync with the input FEN and UI state (input enabled / last move).
 * - Emit move attempts as UI intents (the core remains authoritative).
 *
 * Non-responsibilities:
 * - No chess rules here.
 * - No legality / promotion logic here (handled by the core via the facade).
 */
@Component({
	selector: 'app-chess-board',
	standalone: true,
	templateUrl: './chess-board.component.html',
	styleUrl: './chess-board.component.scss',
})
export class ChessBoardComponent implements AfterViewInit, OnDestroy, OnChanges {
	// -------------------------------------------------------------------------
	// Inputs / Outputs
	// -------------------------------------------------------------------------

	/** Current position to display (full FEN). */
	@Input({ required: true }) fen!: string;

	/** Board orientation (default: white). */
	@Input() orientation: BoardOrientation = 'white';

	/** Allows the parent UI to disable move input (promotion pending, read-only mode, etc.). */
	@Input() inputEnabled = true;

	/** Last move squares highlight (null clears the highlight). */
	@Input() lastMoveSquares: BoardLastMoveSquares = null;

	/**
	 * Optional synchronous validator used by the adapter:
	 * - true => accept the move immediately (no snapback / no flicker)
	 * - false => reject (snapback)
	 *
	 * If not provided, the component will emit moveAttempt and the board will stay authoritative.
	 */
	@Input() validateMoveAttempt?: (attempt: ExplorerMoveAttempt) => boolean;

	/**
	 * Optional move-hints provider for the board:
	 * - restrict selectable pieces (must have at least one legal move)
	 * - display dots + hover highlights
	 *
	 * Must be synchronous and read-only.
	 */
	@Input() getLegalDestinationsFrom?: (from: string) => string[];

	/**
	 * Optional capture-hints provider for the board (ring markers on capture squares).
	 * Must be synchronous and read-only.
	 */
	@Input() getLegalCaptureDestinationsFrom?: (from: string) => string[];

	/**
	 * Emitted when the user attempts a move (drag&drop or click-to-move).
	 * The parent is expected to forward this attempt to the core/facade.
	 */
	@Output() moveAttempt = new EventEmitter<ExplorerMoveAttempt>();

	@ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>;

	// -------------------------------------------------------------------------
	// Internal state
	// -------------------------------------------------------------------------

	private adapter: ChessBoardAdapter | null = null;
	private lastFenApplied: string | null = null;

	private isDestroyed = false;
	private resizeObserver: ResizeObserver | null = null;

	constructor(
		@Inject(CHESS_BOARD_ADAPTER_FACTORY) private readonly factory: ChessBoardAdapterFactory,
	) {}

	// -------------------------------------------------------------------------
	// Angular lifecycle
	// -------------------------------------------------------------------------

	ngAfterViewInit(): void {
		this.createAdapter();
		this.applyAllStateToAdapter();

		this.lastFenApplied = this.fen;
		this.setupResizeObserver();
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (this.isDestroyed) return;
		if (!this.adapter) return;

		if (changes['fen']) {
			this.applyFenIfChanged();
		}

		if (changes['inputEnabled']) {
			this.adapter.setMoveInputEnabled(this.inputEnabled);
		}

		if (changes['lastMoveSquares']) {
			this.adapter.setLastMoveSquares?.(this.lastMoveSquares);
		}

		// Note: orientation changes are intentionally ignored for now.
		// If needed later, we can recreate the adapter or add an adapter method.
	}

	ngOnDestroy(): void {
		this.isDestroyed = true;

		this.resizeObserver?.disconnect();
		this.resizeObserver = null;

		this.adapter?.destroy();
		this.adapter = null;

		this.lastFenApplied = null;
	}

	// -------------------------------------------------------------------------
	// Adapter wiring
	// -------------------------------------------------------------------------

	private createAdapter(): void {
		const init = this.buildAdapterInit();

		this.adapter = this.factory.create(init);
	}

	private buildAdapterInit() {
		const init: any = {
			element: this.host.nativeElement,
			fen: this.fen,
			orientation: this.orientation,
			assetsUrl: 'assets/cm-chessboard/',
			onMoveAttempt: (attempt: { from: string; to: string }) => {
				// Keep the output contract stable for the rest of the UI.
				this.moveAttempt.emit({ from: attempt.from, to: attempt.to });
			},
			validateMoveAttempt: (attempt: { from: string; to: string }) => {
				// If the parent provided a synchronous validator, use it.
				if (this.validateMoveAttempt) {
					return this.validateMoveAttempt({ from: attempt.from, to: attempt.to });
				}

				// Otherwise fallback to emitting the attempt and let the core update via FEN.
				this.moveAttempt.emit({ from: attempt.from, to: attempt.to });
				return false;
			},
		};

		// Optional hint callbacks (synchronous + read-only)
		if (this.getLegalDestinationsFrom) {
			init.getLegalDestinationsFrom = (from: string) => this.getLegalDestinationsFrom!(from);
		}

		if (this.getLegalCaptureDestinationsFrom) {
			init.getLegalCaptureDestinationsFrom = (from: string) =>
				this.getLegalCaptureDestinationsFrom!(from);
		}

		return init;
	}

	/**
	 * Applies the initial UI state to the adapter after creation.
	 */
	private applyAllStateToAdapter(): void {
		if (!this.adapter) return;

		this.adapter.setLastMoveSquares?.(this.lastMoveSquares);
		this.adapter.setMoveInputEnabled(this.inputEnabled);
		this.adapter.setMoveInputAllowedColor(this.getSideToMoveFromFen(this.fen));
	}

	/**
	 * Applies a FEN update only if it differs from the last applied value.
	 * This avoids unnecessary board rerenders and event churn.
	 */
	private applyFenIfChanged(): void {
		if (!this.adapter) return;

		const nextFen = this.fen;
		if (!nextFen || nextFen === this.lastFenApplied) return;

		this.lastFenApplied = nextFen;

		this.adapter.setFen(nextFen);
		this.adapter.setMoveInputAllowedColor(this.getSideToMoveFromFen(nextFen));
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	/**
	 * Derives the side-to-move from the FEN active color field.
	 * Returns null if the FEN is invalid or incomplete.
	 */
	private getSideToMoveFromFen(fen: string): BoardOrientation | null {
		const parts = (fen ?? '').trim().split(/\s+/);
		if (parts.length < 2) return null;
		return parts[1] === 'w' ? 'white' : parts[1] === 'b' ? 'black' : null;
	}

	private setupResizeObserver(): void {
		// Observe host size changes to support responsive layouts and future board libs.
		this.resizeObserver = new ResizeObserver(() => {
			if (this.isDestroyed) return;

			// Avoid calling into the board during layout calculation.
			requestAnimationFrame(() => this.adapter?.onHostResize?.());
		});

		this.resizeObserver.observe(this.host.nativeElement);
	}
}
