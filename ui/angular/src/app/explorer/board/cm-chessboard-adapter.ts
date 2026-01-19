/**
 * CmChessboardAdapter (UI / Angular)
 *
 * cm-chessboard implementation of the ChessBoardAdapter contract.
 *
 * Responsibilities:
 * - Render a chessboard (cm-chessboard).
 * - Translate low-level user gestures (click-to-move / drag&drop) into "move intents".
 * - Provide optional UX improvements:
 *   - last move highlight (persistent)
 *   - legal move hinting (selection highlight, dots, capture rings, hover highlight)
 *   - promotion dialog (via cm-chessboard extension)
 *
 * Architectural rule:
 * - The adapter does NOT implement chess rules.
 * - Legality comes from the core through callbacks:
 *   - validateMoveAttempt (sync validator, "optimistic")
 *   - getLegalDestinationsFrom / getLegalCaptureDestinationsFrom (read-only hinting)
 *
 * Promotion rule:
 * - cm-chessboard does not apply promotions automatically.
 * - We use the PromotionDialog extension and then emit `{ from, to, promotion }`.
 *
 * Special edge case (fixed):
 * - PromotionDialog callback can fire twice in some conditions.
 * - We protect against that with a one-shot token ("request id") consumed at first callback.
 */

import { Chessboard, COLOR, INPUT_EVENT_TYPE } from 'cm-chessboard/src/Chessboard.js';
import { Markers } from 'cm-chessboard/src/extensions/markers/Markers.js';
import { PromotionDialog } from 'cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js';

import type {
	BoardLastMoveSquares,
	BoardMoveAttempt,
	BoardOrientation,
	BoardPromotionPiece,
	ChessBoardAdapter,
	ChessBoardAdapterInit,
} from './board-adapter';

// -----------------------------------------------------------------------------
// Marker definitions (Markers extension)
// -----------------------------------------------------------------------------

/**
 * Persistent markers for the last applied move.
 * These must survive temporary gesture markers (hints).
 */
const LAST_MOVE_FROM = { class: 'mco-last-move-from', slice: 'markerSquare' };
const LAST_MOVE_TO = { class: 'mco-last-move-to', slice: 'markerSquare' };

/**
 * Temporary "move hints" markers.
 *
 * They are cleared when the gesture ends (drop / second click / cancel),
 * while last-move markers must remain.
 */
const HINT_SELECTED_FROM = { class: 'mco-hint-selected-from', slice: 'markerSquare' };
const HINT_HOVER_TO = { class: 'mco-hint-hover-to', slice: 'markerSquare' };
const HINT_LEGAL_DOT = { class: 'mco-hint-legal-dot', slice: 'markerDot' };

/**
 * Capture hint marker: ring stays visible even when a piece sits on the square.
 */
const HINT_CAPTURE_CIRCLE = { class: 'mco-hint-capture-circle', slice: 'markerCircle' };

// -----------------------------------------------------------------------------
// Adapter
// -----------------------------------------------------------------------------

export class CmChessboardAdapter implements ChessBoardAdapter {
	// -------------------------------------------------------------------------
	// Lifecycle / instance state
	// -------------------------------------------------------------------------

	private board: any | null;

	private destroyed = false;

	/**
	 * Last FEN we consider as the UI "source of truth" for the board.
	 * Used to revert after failed move attempts or canceled promotions.
	 */
	private lastFen: string;

	/** Move input state controlled by the parent UI. */
	private moveInputEnabled = false;
	private moveInputAllowedColor: BoardOrientation | null = null;

	/** Last move squares (persistent highlight). */
	private lastMoveSquares: BoardLastMoveSquares = null;

	// -------------------------------------------------------------------------
	// Temporary hint state (selection + legal destinations + hover)
	// -------------------------------------------------------------------------

	private hintFrom: string | null = null;
	private hintLegalDests: Set<string> | null = null;
	private hintHoverTo: string | null = null;

	// -------------------------------------------------------------------------
	// Promotion dialog state
	// -------------------------------------------------------------------------

	/**
	 * True while the PromotionDialog is visible / active.
	 * While open, we ignore extra validateMoveInput events coming from cm-chessboard.
	 */
	private promotionDialogOpen = false;

	/**
	 * Promotion one-shot token.
	 *
	 * Each time we open a promotion dialog we increment it and capture its value.
	 * In the callback:
	 * - if the request id mismatches => ignore (stale callback)
	 * - otherwise we "consume" the token (increment again) to prevent double-fire
	 */
	private promotionRequestId = 0;

	// -------------------------------------------------------------------------
	// Dependencies (callbacks injected by the Angular feature)
	// -------------------------------------------------------------------------

	private readonly onMoveAttempt?: (attempt: BoardMoveAttempt) => void;
	private readonly validateMoveAttempt?: (attempt: BoardMoveAttempt) => boolean;

	private readonly orientation: BoardOrientation;

	// -------------------------------------------------------------------------
	// Debug helpers (kept minimal and safe; remove if you want zero logs)
	// -------------------------------------------------------------------------

	private readonly adapterId = `adapter-${Math.random().toString(16).slice(2)}`;
	private boardInstanceSeq = 0;
	private currentBoardId = '';

	// -------------------------------------------------------------------------
	// Construction
	// -------------------------------------------------------------------------

	constructor(private readonly init: ChessBoardAdapterInit) {
		this.orientation = init.orientation ?? 'white';

		this.lastFen = init.fen;

		this.onMoveAttempt = init.onMoveAttempt;
		this.validateMoveAttempt = init.validateMoveAttempt;

		this.board = this.createBoard(init.fen);
	}

	// -------------------------------------------------------------------------
	// Public API (ChessBoardAdapter)
	// -------------------------------------------------------------------------

	/**
	 * Updates the displayed position.
	 *
	 * Promotion guard:
	 * - If user navigates while a promotion dialog is open, we cancel promotion and
	 *   hard-recreate the board to forcibly close the dialog and keep UI synchronized.
	 */
	setFen(fen: string): void {
		if (this.destroyed || !this.board) return;
		if (!fen) return;

		if (this.promotionDialogOpen) {
			this.cancelPromotionDialogAndRecreate(fen);
			return;
		}

		if (fen === this.lastFen) return;

		this.lastFen = fen;
		void this.board.setPosition(fen, false);

		// Some cm-chessboard operations may clear markers; keep it deterministic.
		this.applyLastMoveMarkers();
	}

	/** Enables/disables user move input. */
	setMoveInputEnabled(enabled: boolean): void {
		if (this.destroyed || !this.board) return;
		if (enabled === this.moveInputEnabled) return;

		this.moveInputEnabled = enabled;
		this.applyMoveInputState();
	}

	/** Restricts move input to a single side (or both if null). */
	setMoveInputAllowedColor(color: BoardOrientation | null): void {
		if (this.destroyed || !this.board) return;
		if (color === this.moveInputAllowedColor) return;

		this.moveInputAllowedColor = color;
		this.applyMoveInputState();
	}

	/** Updates persistent last-move highlight. */
	setLastMoveSquares(lastMove: BoardLastMoveSquares): void {
		this.lastMoveSquares = lastMove;
		this.applyLastMoveMarkers();
	}

	/** Resize hook (no-op because cm-chessboard is responsive). */
	onHostResize(): void {
		// cm-chessboard handles resizing automatically when `responsive: true`.
	}

	/**
	 * Releases DOM/event resources.
	 * Must be safe to call multiple times.
	 */
	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;

		// Invalidate any pending promotion callback.
		this.promotionRequestId++;

		try {
			this.board?.destroy();
		} finally {
			this.board = null;
		}
	}

	// -------------------------------------------------------------------------
	// Board creation / recreation (promotion hard-close)
	// -------------------------------------------------------------------------

	/**
	 * Hard-close the promotion dialog by recreating the board.
	 *
	 * Why:
	 * - PromotionDialog is an extension with its own DOM.
	 * - When user performs another action (navigation / move list click),
	 *   we must immediately close the dialog to keep UI consistent.
	 */
	private cancelPromotionDialogAndRecreate(nextFen?: string): void {
		if (!this.promotionDialogOpen) return;

		// Invalidate any pending callback and mark dialog as closed.
		this.promotionRequestId++;
		this.promotionDialogOpen = false;

		// Clear temporary hints defensively (even though board is recreated).
		this.clearHintMarkersAndState();

		const fenToShow = nextFen ?? this.lastFen;

		try {
			this.board?.destroy();
		} catch {
			// ignore
		}

		this.board = this.createBoard(fenToShow);
		this.lastFen = fenToShow;

		// Re-apply adapter-driven UI state.
		this.applyLastMoveMarkers();
		this.applyMoveInputState();
	}

	/**
	 * Creates a new cm-chessboard instance.
	 * - Markers extension with autoMarkers disabled (we draw everything ourselves)
	 * - PromotionDialog extension enabled
	 * - Default cm-chessboard move markers disabled
	 */
	private createBoard(positionFen: string): any {
		this.currentBoardId = `${this.adapterId}-board-${++this.boardInstanceSeq}`;
		// Keep the log small; remove if you want a clean console.
		// console.log('[CmChessboardAdapter] createBoard', this.currentBoardId, positionFen);

		return new Chessboard(this.init.element, {
			assetsUrl: this.init.assetsUrl,
			position: positionFen,
			orientation: this.orientation === 'black' ? COLOR.black : COLOR.white,
			responsive: true,
			extensions: [{ class: Markers, props: { autoMarkers: false } }, { class: PromotionDialog }],
			style: {
				// Disable built-in selection markers: we use our own markers.
				moveFromMarker: undefined,
				moveToMarker: undefined,

				cssClass: 'chessboard-js',
				borderType: 'frame',
			},
		});
	}

	// -------------------------------------------------------------------------
	// Move input handling (cm-chessboard events -> move intents)
	// -------------------------------------------------------------------------

	/**
	 * Single event handler passed to cm-chessboard `enableMoveInput`.
	 * It translates low-level events into:
	 * - hint updates (moveInputStarted / movingOverSquare)
	 * - a final `{ from, to }` attempt (validateMoveInput)
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
			case INPUT_EVENT_TYPE.moveInputFinished:
				this.onMoveGestureEnded();
				return;

			default:
				return;
		}
	};

	/**
	 * Called when the user starts a gesture (click or drag).
	 *
	 * Hinting logic:
	 * - If no hint provider is wired, we allow the selection.
	 * - If hint provider exists, we only allow selecting pieces that have legal moves.
	 * - We render:
	 *   - selected-from marker
	 *   - dots on legal destinations
	 *   - rings on capture destinations
	 */
	private onMoveInputStarted(event: any): boolean {
		const from = (event.squareFrom as string | undefined)?.toLowerCase();
		if (!from) return false;

		// If no hint provider is wired, keep legacy behavior (allow selection).
		if (!this.init.getLegalDestinationsFrom) return true;

		const dests = this.init.getLegalDestinationsFrom(from) ?? [];
		if (dests.length === 0) return false;

		// Capture hinting (ring marker).
		const captureDests = this.init.getLegalCaptureDestinationsFrom?.(from) ?? [];
		const captureSet = new Set(captureDests.map((s) => s.toLowerCase()));

		this.hintFrom = from;
		this.hintLegalDests = new Set(dests.map((s) => s.toLowerCase()));
		this.hintHoverTo = null;

		if (!this.canUseMarkers()) return true;

		this.clearHintMarkers();

		this.board.addMarker(HINT_SELECTED_FROM, from);

		for (const to of this.hintLegalDests) {
			if (captureSet.has(to)) this.board.addMarker(HINT_CAPTURE_CIRCLE, to);
			else this.board.addMarker(HINT_LEGAL_DOT, to);
		}

		return true;
	}

	/**
	 * Called repeatedly while the user hovers over squares during a gesture.
	 * We highlight the hovered square only if it is a legal destination.
	 */
	private onMovingOverSquare(event: any): void {
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

	/**
	 * Called at the end of a gesture, when cm-chessboard requests validation.
	 *
	 * Rules:
	 * - If promotion dialog is currently open, ignore extra validation calls.
	 * - Clear temporary hints.
	 * - If hint provider exists, reject moves outside legal destinations early.
	 * - If the move is a promotion attempt, open PromotionDialog and dispatch later.
	 * - Otherwise dispatch attempt via validateMoveAttempt (preferred) or onMoveAttempt.
	 */
	private onValidateMoveInput(event: any): boolean {
		if (this.promotionDialogOpen) {
			// Prevent extra validateMoveInput events from interfering with the dialog.
			return true;
		}

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

		// Promotions must be handled explicitly (cm-chessboard does not apply them).
		if (this.isPromotionAttempt(event)) {
			return this.openPromotionDialogAndDispatch(from, to, event);
		}

		return this.dispatchAttempt({ from, to });
	}

	/**
	 * Called when the gesture ends (canceled or finished).
	 * Ensures hint markers are cleared and last-move markers remain visible.
	 */
	private onMoveGestureEnded(): void {
		this.clearHintMarkersAndState();
		this.refreshLastMoveMarkersAsync();
	}

	/**
	 * Dispatches a move attempt either through the sync validator (preferred)
	 * or as an emitted intent (authoritative core path).
	 */
	private dispatchAttempt(attempt: BoardMoveAttempt): boolean {
		if (this.validateMoveAttempt) {
			return this.validateMoveAttempt(attempt);
		}

		this.onMoveAttempt?.(attempt);
		return false;
	}

	// -------------------------------------------------------------------------
	// Promotion handling
	// -------------------------------------------------------------------------

	/**
	 * Detects a pawn move to last rank (rank 1 or 8).
	 * cm-chessboard event includes `piece` like "wp" / "bp".
	 */
	private isPromotionAttempt(event: any): boolean {
		const to: string = String(event?.squareTo ?? '');
		const piece: string = String(event?.piece ?? '');

		if (to.length !== 2 || piece.length < 2) return false;

		const rank = to.charAt(1);
		const isPawn = piece.charAt(1).toLowerCase() === 'p';

		return isPawn && (rank === '1' || rank === '8');
	}

	/**
	 * Opens PromotionDialog and then dispatches `{ from, to, promotion }`.
	 *
	 * Return value:
	 * - true  -> keep the pawn visually on destination while dialog is open
	 * - false -> fallback to core-driven handling (rare / extension missing)
	 *
	 * Safety:
	 * - The callback is protected with a one-shot request id because it can fire twice.
	 * - If user navigates while dialog is open, we recreate the board to close it.
	 */
	private openPromotionDialogAndDispatch(from: string, to: string, event: any): boolean {
		if (this.destroyed || !this.board) return false;

		// If the extension is missing at runtime, fallback to core-driven workflow.
		if (typeof this.board.showPromotionDialog !== 'function') {
			this.onMoveAttempt?.({ from, to });
			return false;
		}

		const piece: string = String(event?.piece ?? '');
		const pieceColor = piece.charAt(0); // 'w' or 'b'

		// Create a new dialog token and mark dialog open.
		const requestId = ++this.promotionRequestId;
		this.promotionDialogOpen = true;
		this.applyMoveInputState(); // lock input while dialog open

		this.board.showPromotionDialog(to, pieceColor, (result: any) => {
			// Ignore stale callback or destroyed adapter.
			if (this.destroyed) return;
			if (requestId !== this.promotionRequestId) return;

			// Consume immediately -> callback becomes one-shot (double-fire protection).
			this.promotionRequestId++;
			this.promotionDialogOpen = false;
			this.applyMoveInputState(); // restore input (unless globally disabled)

			// Cancel -> revert to last known position.
			if (!result || !result.piece) {
				void this.board?.setPosition(this.lastFen, false);
				this.refreshLastMoveMarkersAsync();
				return;
			}

			// result.piece is like "wq" / "bn".
			const promo = this.normalizePromotionPiece(String(result.piece).charAt(1));
			if (!promo) {
				void this.board?.setPosition(this.lastFen, false);
				this.refreshLastMoveMarkersAsync();
				return;
			}

			const attempt: BoardMoveAttempt = { from, to, promotion: promo };
			const accepted = this.dispatchAttempt(attempt);

			// If sync validator rejects, revert immediately.
			if (this.validateMoveAttempt && !accepted) {
				void this.board?.setPosition(this.lastFen, false);
				this.refreshLastMoveMarkersAsync();
			}
		});

		return true;
	}

	/**
	 * Converts various promotion piece representations to our strict union type.
	 * Input can be "q|r|b|n" or "wq/bn" etc. (we only use the piece letter).
	 */
	private normalizePromotionPiece(value: unknown): BoardPromotionPiece | undefined {
		if (typeof value !== 'string') return undefined;
		const p = value.toLowerCase();
		return p === 'q' || p === 'r' || p === 'b' || p === 'n' ? p : undefined;
	}

	// -------------------------------------------------------------------------
	// Move input state (enable/disable + allowed color)
	// -------------------------------------------------------------------------

	/**
	 * Applies the current move input state to cm-chessboard.
	 * Always disables first to guarantee a clean state.
	 */
	private applyMoveInputState(): void {
		if (this.destroyed || !this.board) return;

		// Always disable first
		this.board.disableMoveInput();

		// IMPORTANT:
		// While the promotion dialog is open, we keep input disabled.
		// The current behavior (cancel promotion on external actions via setFen)
		// stays exactly the same.
		if (this.promotionDialogOpen) return;

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

	/**
	 * Applies persistent last-move markers.
	 * Safe to call repeatedly.
	 */
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

	/** Resets in-memory hint state (does not touch DOM markers). */
	private resetHintState(): void {
		this.hintFrom = null;
		this.hintLegalDests = null;
		this.hintHoverTo = null;
	}

	/** Clears hint markers + resets hint state. */
	private clearHintMarkersAndState(): void {
		this.clearHintMarkers();
		this.resetHintState();
	}

	/**
	 * Some libraries may clear markers at the end of a gesture.
	 * Re-applying on the next frame ensures last-move highlight remains visible.
	 */
	private refreshLastMoveMarkersAsync(): void {
		requestAnimationFrame(() => this.applyLastMoveMarkers());
	}

	/**
	 * Returns true if the Markers extension API is available.
	 * Keeps the adapter resilient if extensions change or are disabled.
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
