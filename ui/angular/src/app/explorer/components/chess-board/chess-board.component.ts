/**
 * ChessBoardComponent (UI / Angular)
 *
 * Dumb rendering wrapper around the active ChessBoardAdapter.
 *
 * Responsibilities:
 * - Instantiate the adapter once the host element exists (AfterViewInit).
 * - Forward input state to the adapter:
 *   - current FEN
 *   - move input enabled/disabled
 *   - allowed side to move (derived from FEN)
 *   - last move highlight squares
 * - Translate adapter attempts into core-friendly ExplorerMoveAttempt events.
 * - Manage adapter lifecycle and DOM observers (destroy safely).
 *
 * Non-responsibilities:
 * - No chess rules here.
 * - No "promotion workflow" decisions here.
 *   The parent (facade/page) decides whether input is enabled.
 */

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
	type BoardMoveAttempt,
	type BoardOrientation,
	type ChessBoardAdapter,
	type ChessBoardAdapterFactory,
	type ChessBoardAdapterInit,
	type BoardLastMoveSquares,
} from '../../board/board-adapter';

@Component({
	selector: 'app-chess-board',
	standalone: true,
	templateUrl: './chess-board.component.html',
	styleUrl: './chess-board.component.scss',
})
export class ChessBoardComponent implements AfterViewInit, OnDestroy, OnChanges {
	@ViewChild('shell') private shell!: ElementRef<HTMLElement>;

	// ---------------------------------------------------------------------------
	// Inputs (controlled by parent)
	// ---------------------------------------------------------------------------

	/** Current position to display (full FEN). */
	@Input({ required: true }) fen!: string;

	/** Board orientation (view preference). */
	@Input() orientation: BoardOrientation = 'white';

	/**
	 * Enables/disables user input.
	 * Parent decides (ex: disable while a promotion workflow is pending elsewhere).
	 */
	@Input() inputEnabled = true;

	/** Last move squares highlight (optional). */
	@Input() lastMoveSquares: BoardLastMoveSquares = null;

	/**
	 * Optional synchronous validator.
	 * When provided, the adapter may run in "optimistic" mode to avoid flicker.
	 */
	@Input() validateMoveAttempt?: (attempt: ExplorerMoveAttempt) => boolean;

	/**
	 * Optional hint providers used by the adapter:
	 * - legal destinations (dots)
	 * - capture destinations (rings)
	 */
	@Input() getLegalDestinationsFrom?: (from: string) => string[];
	@Input() getLegalCaptureDestinationsFrom?: (from: string) => string[];

	// ---------------------------------------------------------------------------
	// Outputs
	// ---------------------------------------------------------------------------

	/** Emitted when the user attempts a move (authoritative core path). */
	@Output() moveAttempt = new EventEmitter<ExplorerMoveAttempt>();

	// ---------------------------------------------------------------------------
	// Template refs
	// ---------------------------------------------------------------------------

	@ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>;

	// ---------------------------------------------------------------------------
	// Internal state
	// ---------------------------------------------------------------------------

	private lastComputedSizePx: number | null = null;

	private adapter: ChessBoardAdapter | null = null;
	private lastFenApplied: string | null = null;

	private destroyed = false;
	private resizeObserver: ResizeObserver | null = null;

	constructor(
		@Inject(CHESS_BOARD_ADAPTER_FACTORY) private readonly factory: ChessBoardAdapterFactory,
	) {}

	// ---------------------------------------------------------------------------
	// Angular lifecycle
	// ---------------------------------------------------------------------------

	/**
	 * Creates the adapter once the host element exists.
	 * Also wires ResizeObserver so board implementations can refresh if needed.
	 */
	ngAfterViewInit(): void {
		const init: ChessBoardAdapterInit = {
			element: this.host.nativeElement,
			fen: this.fen,
			orientation: this.orientation,
			assetsUrl: 'assets/cm-chessboard/',
			onMoveAttempt: (attempt: BoardMoveAttempt) => {
				this.moveAttempt.emit(this.toExplorerAttempt(attempt));
			},
			...(this.validateMoveAttempt
				? {
						validateMoveAttempt: (attempt: BoardMoveAttempt) =>
							this.validateMoveAttempt!(this.toExplorerAttempt(attempt)),
					}
				: {}),
			...(this.getLegalDestinationsFrom
				? { getLegalDestinationsFrom: (from) => this.getLegalDestinationsFrom!(from) }
				: {}),
			...(this.getLegalCaptureDestinationsFrom
				? { getLegalCaptureDestinationsFrom: (from) => this.getLegalCaptureDestinationsFrom!(from) }
				: {}),
		};

		this.adapter = this.factory.create(init);

		// Initial adapter state sync
		this.adapter.setLastMoveSquares?.(this.lastMoveSquares);
		this.adapter.setMoveInputEnabled(this.inputEnabled);
		this.adapter.setMoveInputAllowedColor(this.getSideToMoveFromFen(this.fen));
		this.lastFenApplied = this.fen;

		// Auto-size board to fit the available box (min(width, height)).
		this.resizeObserver = new ResizeObserver(() => {
			if (this.destroyed) return;
			this.applyAutoSize();
		});

		this.resizeObserver.observe(this.shell.nativeElement);

		// Apply once on init
		this.applyAutoSize();
	}

	/**
	 * Destroys adapter and observers.
	 * Must be safe even if called after partial init.
	 */
	ngOnDestroy(): void {
		this.destroyed = true;

		this.resizeObserver?.disconnect();
		this.resizeObserver = null;

		this.adapter?.destroy();
		this.adapter = null;

		this.lastFenApplied = null;
	}

	/**
	 * Keeps the adapter synchronized with input changes.
	 */
	ngOnChanges(changes: SimpleChanges): void {
		if (this.destroyed || !this.adapter) return;

		if (changes['orientation'] && !changes['orientation'].firstChange) {
			this.adapter?.setOrientation?.(this.orientation);
		}

		if (changes['fen']) {
			const nextFen = this.fen;
			if (nextFen && nextFen !== this.lastFenApplied) {
				this.lastFenApplied = nextFen;
				this.adapter.setFen(nextFen);

				// Keep allowed color in sync with the side-to-move in FEN.
				this.adapter.setMoveInputAllowedColor(this.getSideToMoveFromFen(nextFen));
			}
		}

		if (changes['inputEnabled']) {
			this.adapter.setMoveInputEnabled(this.inputEnabled);
		}

		if (changes['lastMoveSquares']) {
			this.adapter.setLastMoveSquares?.(this.lastMoveSquares);
		}
	}

	// ---------------------------------------------------------------------------
	// Mapping helpers
	// ---------------------------------------------------------------------------

	/**
	 * Converts the board adapter attempt shape to the core attempt shape.
	 */
	private toExplorerAttempt(attempt: BoardMoveAttempt): ExplorerMoveAttempt {
		return attempt.promotion
			? { from: attempt.from, to: attempt.to, promotion: attempt.promotion }
			: { from: attempt.from, to: attempt.to };
	}

	/**
	 * Extracts side-to-move from a FEN string.
	 * Returns null when FEN is invalid or incomplete.
	 */
	private getSideToMoveFromFen(fen: string): BoardOrientation | null {
		const parts = (fen ?? '').trim().split(/\s+/);
		if (parts.length < 2) return null;
		return parts[1] === 'w' ? 'white' : parts[1] === 'b' ? 'black' : null;
	}

	/**
	 * Auto-sizes the board host to a square that fits inside the available space.
	 * We use the smallest dimension of the shell (min(width, height)).
	 *
	 * This ensures the board, player cards and controls remain visible without
	 * requiring a scroll in the center column.
	 */
	private applyAutoSize(): void {
		if (!this.adapter) return;

		const shellEl = this.shell?.nativeElement;
		const hostEl = this.host?.nativeElement;

		if (!shellEl || !hostEl) return;

		const rect = shellEl.getBoundingClientRect();
		const size = Math.floor(Math.min(rect.width, rect.height));

		// Avoid useless DOM writes / resize churn.
		if (!size || size === this.lastComputedSizePx) return;

		this.lastComputedSizePx = size;

		hostEl.style.width = `${size}px`;
		hostEl.style.height = `${size}px`;

		requestAnimationFrame(() => this.adapter?.onHostResize?.());
	}
}
