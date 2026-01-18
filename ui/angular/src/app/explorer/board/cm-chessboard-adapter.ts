import { Chessboard, COLOR, INPUT_EVENT_TYPE } from 'cm-chessboard/src/Chessboard.js';
import { Markers } from 'cm-chessboard/src/extensions/markers/Markers.js';

import type {
	BoardLastMoveSquares,
	BoardMoveAttempt,
	BoardOrientation,
	ChessBoardAdapter,
	ChessBoardAdapterInit,
} from './board-adapter';

// -----------------------------------------------------------------------------
// Marker types (Markers extension)
// -----------------------------------------------------------------------------

/**
 * Persistent markers for the last applied move.
 * These markers must survive all temporary gesture hints.
 */
const LAST_MOVE_FROM = { class: 'mco-last-move-from', slice: 'markerSquare' };
const LAST_MOVE_TO = { class: 'mco-last-move-to', slice: 'markerSquare' };

/**
 * Temporary "move hints" markers (V1.2.5).
 *
 * These are cleared after the gesture ends (drop / second click / cancel),
 * while last-move markers must remain.
 *
 * Marker types in cm-chessboard are defined as `{ class, slice }`,
 * where `slice` targets an SVG id from the markers sprite.
 */
const HINT_SELECTED_FROM = { class: 'mco-hint-selected-from', slice: 'markerSquare' };
const HINT_HOVER_TO = { class: 'mco-hint-hover-to', slice: 'markerSquare' };
const HINT_LEGAL_DOT = { class: 'mco-hint-legal-dot', slice: 'markerDot' };

/**
 * Capture hint marker: use a ring so it stays visible when a piece sits on the square.
 */
const HINT_CAPTURE_CIRCLE = { class: 'mco-hint-capture-circle', slice: 'markerCircle' };

// -----------------------------------------------------------------------------
// Adapter
// -----------------------------------------------------------------------------

/**
 * CmChessboardAdapter
 *
 * cm-chessboard implementation of our ChessBoardAdapter contract.
 *
 * Design:
 * - "Authoritative core" by default: the board should not commit moves on its own.
 * - The UI emits an intent (from/to), the core validates/applies, then UI updates via FEN.
 * - Optionally, we can validate synchronously via `validateMoveAttempt` to avoid flicker.
 *
 * V1.2.5:
 * - Disable built-in selection markers (we draw our own).
 * - Allow selecting only pieces that have legal moves.
 * - Add move hints: selected square, dots, capture rings, hover highlight.
 */
export class CmChessboardAdapter implements ChessBoardAdapter {
	private board: any | null;

	private destroyed = false;
	private lastFen: string;

	private moveInputEnabled = false;
	private moveInputAllowedColor: BoardOrientation | null = null;

	private lastMoveSquares: BoardLastMoveSquares = null;

	// V1.2.5: temporary hint state (selection + destinations + hover)
	private hintFrom: string | null = null;
	private hintLegalDests: Set<string> | null = null;
	private hintHoverTo: string | null = null;

	private readonly onMoveAttempt?: (attempt: BoardMoveAttempt) => void;
	private readonly validateMoveAttempt?: (attempt: BoardMoveAttempt) => boolean;

	constructor(private readonly init: ChessBoardAdapterInit) {
		const orientation: BoardOrientation = init.orientation ?? 'white';

		this.lastFen = init.fen;
		this.onMoveAttempt = init.onMoveAttempt;
		this.validateMoveAttempt = init.validateMoveAttempt;

		this.board = new Chessboard(init.element, {
			assetsUrl: init.assetsUrl,
			position: init.fen,
			orientation: orientation === 'black' ? COLOR.black : COLOR.white,
			responsive: true,
			extensions: [{ class: Markers, props: { autoMarkers: false } }],
			// Disable cm-chessboard built-in selection markers (we draw our own markers)
			style: {
				moveFromMarker: undefined,
				moveToMarker: undefined,

				cssClass: 'chessboard-js',
				borderType: 'frame',
				// pieces: {
				// 	file: 'pieces/staunty.svg',
				// },
			},
		});
	}

	// -------------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------------

	setFen(fen: string): void {
		if (this.destroyed || !this.board) return;
		if (!fen || fen === this.lastFen) return;

		this.lastFen = fen;
		void this.board.setPosition(fen, false);

		// Re-apply after position updates (safe even if markers are not supported).
		this.applyLastMoveMarkers();
	}

	setMoveInputEnabled(enabled: boolean): void {
		if (this.destroyed || !this.board) return;
		if (enabled === this.moveInputEnabled) return;

		this.moveInputEnabled = enabled;
		this.applyMoveInputState();
	}

	setMoveInputAllowedColor(color: BoardOrientation | null): void {
		if (this.destroyed || !this.board) return;
		if (color === this.moveInputAllowedColor) return;

		this.moveInputAllowedColor = color;
		this.applyMoveInputState();
	}

	setLastMoveSquares(lastMove: BoardLastMoveSquares): void {
		this.lastMoveSquares = lastMove;
		this.applyLastMoveMarkers();
	}

	onHostResize(): void {
		// cm-chessboard handles resizing automatically when `responsive: true`.
		// This hook exists for future board implementations.
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;

		try {
			this.board?.destroy();
		} finally {
			this.board = null;
		}
	}

	// -------------------------------------------------------------------------
	// Move input handling
	// -------------------------------------------------------------------------

	/**
	 * Translates cm-chessboard gesture events into `{ from, to }` attempts.
	 *
	 * "Authoritative core" mode:
	 * - If `validateMoveAttempt` is not provided, we always return false on validateMoveInput.
	 *   That makes cm-chessboard snap back and wait for the UI to update via FEN.
	 *
	 * "Optimistic" mode:
	 * - If `validateMoveAttempt` is provided and returns true, cm-chessboard commits the move
	 *   immediately (no flicker) and the UI must still update via FEN afterwards.
	 */
	private readonly handleMoveInput = (event: any): boolean | void => {
		if (this.destroyed) return;

		switch (event.type) {
			case INPUT_EVENT_TYPE.moveInputStarted:
				return this.onMoveInputStarted(event);

			case INPUT_EVENT_TYPE.movingOverSquare:
				this.onMovingOverSquare(event);
				return;

			case INPUT_EVENT_TYPE.validateMoveInput:
				return this.onValidateMoveInput(event);

			case INPUT_EVENT_TYPE.moveInputCanceled:
				this.onMoveGestureEnded();
				return;

			case INPUT_EVENT_TYPE.moveInputFinished:
				this.onMoveGestureEnded();
				return;

			default:
				return;
		}
	};

	private onMoveInputStarted(event: any): boolean {
		const from = (event.squareFrom as string | undefined)?.toLowerCase();
		if (!from) return false;

		// If no hint provider is wired, keep legacy behavior (allow selection).
		if (!this.init.getLegalDestinationsFrom) return true;

		const dests = this.init.getLegalDestinationsFrom(from) ?? [];
		if (dests.length === 0) return false;

		// Optional capture hinting (ring marker).
		const captureDests = this.init.getLegalCaptureDestinationsFrom?.(from) ?? [];
		const captureSet = new Set(captureDests.map((s) => s.toLowerCase()));

		this.hintFrom = from;
		this.hintLegalDests = new Set(dests.map((s) => s.toLowerCase()));
		this.hintHoverTo = null;

		if (!this.canUseMarkers()) return true;

		this.clearHintMarkers();
		this.board.addMarker(HINT_SELECTED_FROM, from);

		for (const to of this.hintLegalDests) {
			if (captureSet.has(to)) {
				this.board.addMarker(HINT_CAPTURE_CIRCLE, to);
			} else {
				this.board.addMarker(HINT_LEGAL_DOT, to);
			}
		}

		return true;
	}

	private onMovingOverSquare(event: any): void {
		// Hover feedback for both click-to-move and drag gestures.
		if (!this.hintLegalDests || !this.init.getLegalDestinationsFrom) return;
		if (!this.canUseMarkers()) return;

		const to = (event.squareTo as string | undefined)?.toLowerCase();

		// Clear previous hover (if any).
		if (this.hintHoverTo) {
			this.board.removeMarkers(HINT_HOVER_TO);
			this.hintHoverTo = null;
		}

		// Add hover only if the target square is a legal destination.
		if (to && this.hintLegalDests.has(to)) {
			this.board.addMarker(HINT_HOVER_TO, to);
			this.hintHoverTo = to;
		}
	}

	private onValidateMoveInput(event: any): boolean {
		const from = (event.squareFrom as string | undefined)?.toLowerCase();
		const to = (event.squareTo as string | undefined)?.toLowerCase();

		// Always clear temporary UI hints when the gesture ends.
		this.clearHintMarkersAndState();

		if (!from || !to) return false;

		// If hint provider is active, reject drops/clicks outside legal destinations early.
		if (this.init.getLegalDestinationsFrom) {
			const legal = this.init.getLegalDestinationsFrom(from) ?? [];
			const legalSet = new Set(legal.map((s) => s.toLowerCase()));
			if (!legalSet.has(to)) return false;
		}

		const attempt: BoardMoveAttempt = { from, to };

		// Preferred path: synchronous validation (no flicker on legal moves).
		if (this.validateMoveAttempt) {
			return this.validateMoveAttempt(attempt);
		}

		// Fallback path: emit and let the core update via FEN (may flicker on legal moves).
		this.onMoveAttempt?.(attempt);
		return false;
	}

	private onMoveGestureEnded(): void {
		this.clearHintMarkersAndState();
		this.refreshLastMoveMarkersAsync();
	}

	// -------------------------------------------------------------------------
	// Move input state (enable/disable + allowed color)
	// -------------------------------------------------------------------------

	private applyMoveInputState(): void {
		if (this.destroyed || !this.board) return;

		this.board.disableMoveInput();

		if (!this.moveInputEnabled) return;

		const cmColor =
			this.moveInputAllowedColor === 'white'
				? COLOR.white
				: this.moveInputAllowedColor === 'black'
					? COLOR.black
					: undefined;

		this.board.enableMoveInput(this.handleMoveInput, cmColor);
	}

	// -------------------------------------------------------------------------
	// Markers helpers
	// -------------------------------------------------------------------------

	private applyLastMoveMarkers(): void {
		if (this.destroyed || !this.canUseMarkers()) return;

		// Remove previous last-move markers (ours only).
		this.board.removeMarkers(LAST_MOVE_FROM);
		this.board.removeMarkers(LAST_MOVE_TO);

		if (!this.lastMoveSquares) return;

		this.board.addMarker(LAST_MOVE_FROM, this.lastMoveSquares.from);
		this.board.addMarker(LAST_MOVE_TO, this.lastMoveSquares.to);
	}

	/**
	 * Clears only temporary hint markers.
	 * Must never remove last-move markers.
	 */
	private clearHintMarkers(): void {
		if (this.destroyed || !this.canUseMarkers()) return;

		this.board.removeMarkers(HINT_CAPTURE_CIRCLE);
		this.board.removeMarkers(HINT_SELECTED_FROM);
		this.board.removeMarkers(HINT_HOVER_TO);
		this.board.removeMarkers(HINT_LEGAL_DOT);
	}

	/**
	 * Resets in-memory hint state (does not touch DOM markers).
	 */
	private resetHintState(): void {
		this.hintFrom = null;
		this.hintLegalDests = null;
		this.hintHoverTo = null;
	}

	private clearHintMarkersAndState(): void {
		this.clearHintMarkers();
		this.resetHintState();
	}

	private refreshLastMoveMarkersAsync(): void {
		// Some libraries may clear markers at the end of the gesture.
		// Re-applying on the next frame ensures our last-move highlight remains visible.
		requestAnimationFrame(() => this.applyLastMoveMarkers());
	}

	/**
	 * Checks whether the Markers extension API is available on the current board instance.
	 * This keeps the adapter resilient if extensions change or are disabled.
	 */
	private canUseMarkers(): boolean {
		return (
			!this.destroyed &&
			!!this.board &&
			typeof this.board.addMarker === 'function' &&
			typeof this.board.removeMarkers === 'function'
		);
	}
}
