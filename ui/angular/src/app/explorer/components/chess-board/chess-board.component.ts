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
 * UI chessboard component.
 *
 * Responsibilities:
 * - Render a chessboard using the injected adapter implementation.
 * - Keep the board in sync with the input FEN.
 *
 * Non-responsibilities:
 * - No chess rules here.
 * - No move legality, no promotion logic here (handled by the core via the facade).
 */
@Component({
	selector: 'app-chess-board',
	standalone: true,
	templateUrl: './chess-board.component.html',
	styleUrl: './chess-board.component.scss',
})
export class ChessBoardComponent implements AfterViewInit, OnDestroy, OnChanges {
	/** Current position to display (full FEN). */
	@Input({ required: true }) fen!: string;

	/** Board orientation (default: white). */
	@Input() orientation: BoardOrientation = 'white';

	/** Allows the parent UI to disable move input (promotion pending, read-only mode, etc.). */
	@Input() inputEnabled = true;

	/**
	 * Fired when the user attempts a move (DnD/click) on the board.
	 * V1.2.1: not emitted yet (board is read-only for now).
	 */
	@Output() moveAttempt = new EventEmitter<ExplorerMoveAttempt>();

	/**
	 * When provided, the board will use this callback to validate a move attempt
	 * synchronously (true = accept, false = reject/snapback).
	 */
	@Input() validateMoveAttempt?: (attempt: ExplorerMoveAttempt) => boolean;

	@Input() lastMoveSquares: BoardLastMoveSquares = null;

	@ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>;

	private adapter: ChessBoardAdapter | null = null;
	private lastFenApplied: string | null = null;
	private isDestroyed = false;
	private resizeObserver: ResizeObserver | null = null;

	private getSideToMoveFromFen(fen: string): BoardOrientation | null {
		const parts = fen.trim().split(/\s+/);
		if (parts.length < 2) return null;
		return parts[1] === 'w' ? 'white' : parts[1] === 'b' ? 'black' : null;
	}

	constructor(
		@Inject(CHESS_BOARD_ADAPTER_FACTORY) private readonly factory: ChessBoardAdapterFactory,
	) {}

	ngAfterViewInit(): void {
		this.adapter = this.factory.create({
			element: this.host.nativeElement,
			fen: this.fen,
			orientation: this.orientation,
			assetsUrl: 'assets/cm-chessboard/',
			onMoveAttempt: (attempt) => {
				// Keep the output contract stable for the rest of the app.
				this.moveAttempt.emit({ from: attempt.from, to: attempt.to });
			},
			validateMoveAttempt: (attempt) => {
				// If the parent provided a synchronous validator, use it.
				if (this.validateMoveAttempt) {
					return this.validateMoveAttempt({ from: attempt.from, to: attempt.to });
				}

				// Otherwise fallback to emit (old behavior).
				this.moveAttempt.emit({ from: attempt.from, to: attempt.to });
				return false;
			},
		});

		this.adapter.setLastMoveSquares?.(this.lastMoveSquares);
		//this.adapter.setLastMoveHighlight(this.lastMoveSquares);
		this.adapter.setMoveInputEnabled(this.inputEnabled);
		//this.adapter.setMoveInputEnabled(true);
		this.adapter.setMoveInputAllowedColor(this.getSideToMoveFromFen(this.fen));

		this.lastFenApplied = this.fen;

		// Observe host size changes to support responsive layouts and future board libs.
		this.resizeObserver = new ResizeObserver(() => {
			if (this.isDestroyed) return;
			// Avoid calling into the board during layout calculation.
			requestAnimationFrame(() => this.adapter?.onHostResize?.());
		});

		this.resizeObserver.observe(this.host.nativeElement);
	}

	ngOnDestroy(): void {
		this.isDestroyed = true;

		this.resizeObserver?.disconnect();
		this.resizeObserver = null;

		this.adapter?.destroy();
		this.adapter = null;
		this.lastFenApplied = null;
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (this.isDestroyed) return;
		// Only react to FEN changes once the adapter is created.
		if (!this.adapter) return;

		if (changes['fen']) {
			const nextFen = this.fen;
			if (nextFen && nextFen !== this.lastFenApplied) {
				this.lastFenApplied = nextFen;
				this.adapter.setFen(nextFen);
				this.adapter.setMoveInputAllowedColor(this.getSideToMoveFromFen(nextFen));
			}
		}

		if (changes['inputEnabled']) {
			this.adapter.setMoveInputEnabled(this.inputEnabled);
		}

		if (changes['lastMoveSquares']) {
			this.adapter.setLastMoveSquares?.(this.lastMoveSquares);
		}
		// Orientation changes are ignored for now (we can implement later if needed).
	}
}
