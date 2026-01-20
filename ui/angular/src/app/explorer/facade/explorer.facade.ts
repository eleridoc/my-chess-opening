/**
 * ExplorerFacade (UI / Angular)
 *
 * Orchestration layer between Angular UI components and the core domain engine
 * (ExplorerSession from `my-chess-opening-core`).
 *
 * Responsibilities:
 * - Own a single ExplorerSession instance for the whole application lifetime.
 * - Expose UI-friendly reactive state using Angular signals (mode, source, fen, cursor, move list).
 * - Provide an imperative API for UI intents (reset, navigation, loaders, move attempts).
 * - Translate core results into UI state:
 *   - refresh signals after successful actions
 *   - expose lastError when an action fails
 *   - expose promotionPending when PROMOTION_REQUIRED occurs
 *
 * Non-responsibilities:
 * - No chess rules here (all rules live in ExplorerSession).
 * - No UI components here (dialogs, toasts, etc. are handled by the page/components).
 */

import { Injectable, computed, signal } from '@angular/core';

import { ExplorerSession } from 'my-chess-opening-core/explorer';

import type {
	ExplorerDbGameMeta,
	ExplorerError,
	ExplorerMode,
	ExplorerMoveAttempt,
	ExplorerMoveListRow,
	ExplorerSessionSource,
	ExplorerVariationLine,
	PromotionPiece,
	// NOTE:
	// Keep this ONLY if some UI still consumes `facade.moves()`.
	// If not used anywhere anymore, you can safely remove it + the related signal.
	ExplorerMainlineMove,
} from 'my-chess-opening-core/explorer';

/**
 * PromotionPending
 *
 * UI-friendly representation of a "promotion required" situation.
 * The UI may decide to:
 * - show a promotion choice UI
 * - disable input until resolved
 * - or cancel promotion by navigating elsewhere (depending on adapter strategy)
 */
type PromotionPending = {
	from: string;
	to: string;
	options: PromotionPiece[];
};

/**
 * LastMoveSquares
 *
 * UI hint: squares to highlight for the last applied move in the current path.
 * This is derived from the current node incoming move.
 */
type LastMoveSquares = { from: string; to: string } | null;

@Injectable({ providedIn: 'root' })
export class ExplorerFacade {
	// ---------------------------------------------------------------------------
	// Core engine (single instance for app lifetime)
	// ---------------------------------------------------------------------------

	private readonly session = new ExplorerSession();

	// ---------------------------------------------------------------------------
	// Internal signals (source of truth for UI bindings)
	// ---------------------------------------------------------------------------

	/** Current core mode (CASE1_FREE / CASE2_PGN / CASE2_DB). */
	private readonly _mode = signal<ExplorerMode>(this.session.getMode());

	/** Where the current session comes from (FREE / FEN / PGN / DB). */
	private readonly _source = signal<ExplorerSessionSource>(this.session.getSource());

	/** Current position as FEN (derived from the core cursor). */
	private readonly _fen = signal<string>(this.session.getCurrentFen());

	/** Current ply (0 = root). */
	private readonly _ply = signal<number>(this.session.getCurrentPly());

	/**
	 * Current cursor node id (required to target moves inside variations).
	 * Stored as string for UI convenience.
	 */
	private readonly _currentNodeId = signal<string>(this.session.getCurrentNodeId());

	/**
	 * MoveList view model (mainline rows + variations mapping).
	 * These are UI-ready and should be preferred over old "flat moves" lists.
	 */
	private readonly _moveListRows = signal<ExplorerMoveListRow[]>([]);
	private readonly _variationsByNodeId = signal<Record<string, ExplorerVariationLine[]>>({});

	/**
	 * Legacy mainline list (flat half-moves), with variationCount.
	 * Keep only if still used by another component. Otherwise remove.
	 */
	private readonly _moves = signal<ExplorerMainlineMove[]>(this.session.getMainlineMovesWithMeta());

	/** Navigation capabilities derived from the core cursor. */
	private readonly _canPrev = signal<boolean>(this.session.canGoPrev());
	private readonly _canNext = signal<boolean>(this.session.canGoNext());

	/** Last core error (if any) after an attempted action. */
	private readonly _lastError = signal<ExplorerError | null>(null);

	/** Promotion workflow state (set when PROMOTION_REQUIRED occurs). */
	private readonly _promotionPending = signal<PromotionPending | null>(null);

	/** Squares of the last applied move (used by the board adapter for highlighting). */
	private readonly _lastMoveSquares = signal<LastMoveSquares>(null);

	/**
	 * "Tick" signal used to re-run computed selectors that call into the core session directly.
	 * We do NOT mirror every core selector as a signal; instead we refresh this tick on updates.
	 */
	private readonly _rev = signal(0);

	// ---------------------------------------------------------------------------
	// Public readonly signals (what the UI should consume)
	// ---------------------------------------------------------------------------

	readonly mode = this._mode.asReadonly();
	readonly source = this._source.asReadonly();
	readonly fen = this._fen.asReadonly();
	readonly ply = this._ply.asReadonly();

	readonly currentNodeId = this._currentNodeId.asReadonly();
	readonly moveListRows = this._moveListRows.asReadonly();
	readonly variationsByNodeId = this._variationsByNodeId.asReadonly();

	// Legacy (remove if unused)
	readonly moves = this._moves.asReadonly();

	readonly canPrev = this._canPrev.asReadonly();
	readonly canNext = this._canNext.asReadonly();

	/** Convenience signals for UI buttons. */
	readonly canStart = computed(() => this._canPrev());
	readonly canEnd = computed(() => this._canNext());

	/**
	 * Variation cycling availability depends on the current cursor context inside the core.
	 * We re-evaluate after each refresh using the `_rev` tick dependency.
	 */
	readonly canPrevVariation = computed(() => {
		this._rev();
		return this.session.canGoPrevVariation();
	});

	readonly canNextVariation = computed(() => {
		this._rev();
		return this.session.canGoNextVariation();
	});

	readonly variationInfo = computed(() => {
		this._rev();
		return this.session.getVariationInfoAtCurrentPly();
	});

	readonly lastError = this._lastError.asReadonly();
	readonly promotionPending = this._promotionPending.asReadonly();
	readonly lastMoveSquares = this._lastMoveSquares.asReadonly();

	/**
	 * Stable snapshot mainly for debug/templates.
	 * Avoid using this for core UI logic (prefer individual signals).
	 */
	readonly snapshot = computed(() => ({
		mode: this._mode(),
		source: this._source(),
		fen: this._fen(),
		ply: this._ply(),

		currentNodeId: this._currentNodeId(),
		moveListRows: this._moveListRows(),
		variationsByNodeId: this._variationsByNodeId(),

		// legacy
		moves: this._moves(),

		canPrev: this._canPrev(),
		canNext: this._canNext(),

		variationInfo: this.variationInfo(),
		canPrevVariation: this.canPrevVariation(),
		canNextVariation: this.canNextVariation(),

		lastError: this._lastError(),
		promotionPending: this._promotionPending(),
		lastMoveSquares: this._lastMoveSquares(),
	}));

	constructor() {
		this.refreshFromCore();
	}

	// ---------------------------------------------------------------------------
	// Public API — lifecycle / loaders (CASE rules enforced by core)
	// ---------------------------------------------------------------------------

	/**
	 * Hard reset to initial CASE1 state.
	 * Clears UI transient state, resets core, then refreshes signals.
	 */
	reset(): void {
		this.clearTransientUiState();
		this.session.resetToInitial();
		this.refreshFromCore();
	}

	/**
	 * Alias for starting a fresh exploration.
	 */
	loadInitial(): void {
		this.clearTransientUiState();
		this.session.loadInitial();
		this.refreshFromCore();
	}

	/**
	 * Loads a FEN into CASE1 (only allowed in CASE1_FREE).
	 * On failure, sets `lastError`.
	 */
	loadFenForCase1(fen: string): void {
		this.clearTransientUiState();

		const result = this.session.loadFenForCase1(fen);
		if (result.ok) {
			this.refreshFromCore();
			return;
		}

		this._lastError.set(result.error);
	}

	/**
	 * Loads a PGN into CASE2_PGN (only allowed in CASE1_FREE).
	 * On failure, sets `lastError`.
	 */
	loadPgn(pgn: string, meta?: { name?: string }): void {
		this.clearTransientUiState();

		const result = this.session.loadPgn(pgn, meta);
		if (result.ok) {
			this.refreshFromCore();
			return;
		}

		this._lastError.set(result.error);
	}

	/**
	 * Loads a DB game into CASE2_DB (only allowed in CASE1_FREE).
	 * On failure, sets `lastError`.
	 */
	loadGameMovesSan(movesSan: string[], meta: ExplorerDbGameMeta): void {
		this.clearTransientUiState();

		const result = this.session.loadGameMovesSan(movesSan, meta);
		if (result.ok) {
			this.refreshFromCore();
			return;
		}

		this._lastError.set(result.error);
	}

	// ---------------------------------------------------------------------------
	// Public API — navigation
	// ---------------------------------------------------------------------------

	/**
	 * Navigation clears UI transient state before moving the core cursor.
	 * This ensures errors/promotions don't remain visible after unrelated actions.
	 */
	goStart(): void {
		this.clearTransientUiState();
		this.session.goStart();
		this.refreshFromCore();
	}

	goEnd(): void {
		this.clearTransientUiState();
		this.session.goEnd();
		this.refreshFromCore();
	}

	goPrev(): void {
		this.clearTransientUiState();
		this.session.goPrev();
		this.refreshFromCore();
	}

	goNext(): void {
		this.clearTransientUiState();
		this.session.goNext();
		this.refreshFromCore();
	}

	goPrevVariation(): void {
		this.clearTransientUiState();
		this.session.goPrevVariation();
		this.refreshFromCore();
	}

	goNextVariation(): void {
		this.clearTransientUiState();
		this.session.goNextVariation();
		this.refreshFromCore();
	}

	/**
	 * Mainline-only navigation by ply.
	 * For variations, use `goToNode(nodeId)`.
	 */
	goToPly(ply: number): void {
		this.clearTransientUiState();
		this.session.goToPly(ply);
		this.refreshFromCore();
	}

	/**
	 * Node-based navigation (required for clicking moves inside variations).
	 */
	goToNode(nodeId: string): void {
		this.clearTransientUiState();
		this.session.goToNode(nodeId as any);
		this.refreshFromCore();
	}

	// ---------------------------------------------------------------------------
	// Public API — move attempts + promotion workflow
	// ---------------------------------------------------------------------------

	/**
	 * Attempts a move from the current cursor position.
	 *
	 * Return value:
	 * - true  -> move was applied by the core (board may keep the piece)
	 * - false -> move rejected or requires promotion (board should snap back unless it handles promo UI)
	 *
	 * Failure mapping:
	 * - PROMOTION_REQUIRED -> populate `promotionPending`
	 * - otherwise -> populate `lastError`
	 */
	attemptMove(attempt: ExplorerMoveAttempt): boolean {
		this.clearTransientUiState();

		const result = this.session.applyMoveUci(attempt);

		if (result.ok) {
			this.refreshFromCore();
			return true;
		}

		if (result.error.code === 'PROMOTION_REQUIRED') {
			const details = result.error.details;

			// Defensive: core should always provide details for PROMOTION_REQUIRED.
			if (!details) {
				this._lastError.set({
					code: 'INTERNAL_ERROR',
					message: 'Promotion required but missing details.',
				});
				return false;
			}

			this._promotionPending.set({
				from: details.from,
				to: details.to,
				options: details.options,
			});
			return false;
		}

		this._lastError.set(result.error);
		return false;
	}

	/**
	 * Resolves a pending promotion by replaying the last (from/to) attempt
	 * with the chosen promotion piece.
	 *
	 * Note:
	 * - This method is optional depending on the UI approach.
	 * - Some UIs can directly include promotion inside `attemptMove`.
	 */
	confirmPromotion(piece: PromotionPiece): void {
		const pending = this._promotionPending();
		if (!pending) return;

		this.attemptMove({
			from: pending.from,
			to: pending.to,
			promotion: piece,
		});
	}

	// ---------------------------------------------------------------------------
	// Public API — read-only helpers for board hinting (V1.2.5)
	// ---------------------------------------------------------------------------

	getLegalDestinationsFrom(from: string): string[] {
		return this.session.getLegalDestinationsFrom(from);
	}

	getLegalCaptureDestinationsFrom(from: string): string[] {
		return this.session.getLegalCaptureDestinationsFrom(from);
	}

	// ---------------------------------------------------------------------------
	// Internal helpers
	// ---------------------------------------------------------------------------

	/**
	 * Clears UI-only transient state (errors and promotion prompt).
	 * This must NOT mutate core state.
	 */
	private clearTransientUiState(): void {
		this._lastError.set(null);
		this._promotionPending.set(null);
	}

	/**
	 * Pulls fresh state from the core session into signals.
	 * Must be called after any successful action that mutates the core.
	 */
	private refreshFromCore(): void {
		// Core state
		this._mode.set(this.session.getMode());
		this._source.set(this.session.getSource());
		this._fen.set(this.session.getCurrentFen());
		this._ply.set(this.session.getCurrentPly());
		this._currentNodeId.set(this.session.getCurrentNodeId());

		// MoveList VM (preferred)
		const vm = this.session.getMoveListViewModel();
		this._moveListRows.set(vm.rows);
		this._variationsByNodeId.set(vm.variationsByNodeId);

		// Legacy mainline list (remove if unused)
		this._moves.set(this.session.getMainlineMovesWithMeta());

		// Navigation capabilities
		this._canPrev.set(this.session.canGoPrev());
		this._canNext.set(this.session.canGoNext());

		// Derived last move squares (root has no incoming move)
		const incoming = this.session.getCurrentNode().incomingMove;
		this._lastMoveSquares.set(incoming ? { from: incoming.from, to: incoming.to } : null);

		// Notify computed selectors that depend on core (canPrevVariation, variationInfo, ...)
		this._rev.update((v) => v + 1);
	}
}
