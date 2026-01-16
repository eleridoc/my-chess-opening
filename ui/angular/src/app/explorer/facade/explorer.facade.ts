/**
 * ExplorerFacade (UI / Angular)
 *
 * Orchestration layer between Angular UI components and the core domain engine
 * (ExplorerSession from `my-chess-opening-core`).
 *
 * Responsibilities:
 * - Own a single ExplorerSession instance for the whole application lifetime.
 * - Expose UI-friendly reactive state using Angular signals (mode, source, fen, ply, moves, ...).
 * - Provide an imperative API for UI actions (reset, navigation, loaders, move attempts).
 *
 * Design notes:
 * - The facade MUST NOT contain chess rules or domain logic.
 *   All rules live in core (ExplorerSession).
 * - The facade is responsible for mapping core results to UI state:
 *   - refresh derived signals after each successful action
 *   - capture errors in `lastError`
 *   - handle promotion flow using `promotionPending`
 *
 * V0.3 scope covered:
 * - Signals: mode/source/fen/ply/moves/canPrev/canNext (+ canStart/canEnd computed)
 * - Actions: reset/loadInitial/loadFenForCase1/loadPgn/loadGameMovesSan
 * - Navigation: goStart/goEnd/goPrev/goNext/goToPly
 * - Move workflow: attemptMove + confirmPromotion
 * - Lifetime: providedIn root (app-level singleton)
 */

import { Injectable, computed, signal } from '@angular/core';

import { ExplorerSession } from 'my-chess-opening-core/explorer';

import type {
	ExplorerMode,
	ExplorerMove,
	ExplorerSessionSource,
	ExplorerMoveAttempt,
	PromotionPiece,
	ExplorerError,
	ExplorerDbGameMeta,
} from 'my-chess-opening-core/explorer';

type PromotionPending = {
	from: string;
	to: string;
	options: PromotionPiece[];
};

type LastMoveSquares = { from: string; to: string };

@Injectable({ providedIn: 'root' })
export class ExplorerFacade {
	// ---------------------------------------------------------------------------
	// Core engine (single instance for app lifetime)
	// ---------------------------------------------------------------------------

	private readonly session = new ExplorerSession();

	// ---------------------------------------------------------------------------
	// Internal signals (source of truth for UI bindings)
	// ---------------------------------------------------------------------------

	/** Debug-only session id to verify singleton behavior across routing. */
	private readonly _debugSessionId = signal<string>(
		`explorer-${Math.random().toString(16).slice(2)}`,
	);

	/** Current core mode (CASE1_FREE / CASE2_PGN / CASE2_DB). */
	private readonly _mode = signal<ExplorerMode>(this.session.getMode());

	/** Where the current session comes from (FREE / FEN / PGN / DB). */
	private readonly _source = signal<ExplorerSessionSource>(this.session.getSource());

	/** Current position as FEN (derived from the core cursor). */
	private readonly _fen = signal<string>(this.session.getCurrentFen());

	/** Current ply (0 = root). */
	private readonly _ply = signal<number>(this.session.getCurrentPly());

	/** Active line move list (UI-ready). */
	private readonly _moves = signal<ExplorerMove[]>(this.session.getActiveLineMoves());

	/** Navigation capabilities derived from the core cursor. */
	private readonly _canPrev = signal<boolean>(this.session.canGoPrev());
	private readonly _canNext = signal<boolean>(this.session.canGoNext());

	/** Last core error (if any) after an attempted action. */
	private readonly _lastError = signal<ExplorerError | null>(null);

	/** Promotion workflow state (set when PROMOTION_REQUIRED occurs). */
	private readonly _promotionPending = signal<PromotionPending | null>(null);

	private readonly _lastMoveSquares = signal<{ from: string; to: string } | null>(null);

	// ---------------------------------------------------------------------------
	// Public readonly signals (what the UI should use)
	// ---------------------------------------------------------------------------

	readonly debugSessionId = this._debugSessionId.asReadonly();

	readonly mode = this._mode.asReadonly();
	readonly source = this._source.asReadonly();
	readonly fen = this._fen.asReadonly();
	readonly ply = this._ply.asReadonly();
	readonly moves = this._moves.asReadonly();

	readonly canPrev = this._canPrev.asReadonly();
	readonly canNext = this._canNext.asReadonly();

	/** Convenience signals for UI buttons. */
	readonly canStart = computed(() => this._canPrev());
	readonly canEnd = computed(() => this._canNext());

	readonly lastError = this._lastError.asReadonly();
	readonly promotionPending = this._promotionPending.asReadonly();

	readonly lastMoveSquares = this._lastMoveSquares.asReadonly();

	/**
	 * Stable snapshot mainly for debug (avoid using it for real UI logic).
	 * Useful when building quick templates during early development.
	 */
	readonly snapshot = computed(() => ({
		mode: this._mode(),
		source: this._source(),
		fen: this._fen(),
		ply: this._ply(),
		moves: this._moves(),
		canPrev: this._canPrev(),
		canNext: this._canNext(),
		lastError: this._lastError(),
		promotionPending: this._promotionPending(),
	}));

	constructor() {
		console.log('[ExplorerFacade] created', this._debugSessionId());
		this.refreshFromCore();
	}

	// ---------------------------------------------------------------------------
	// Public API — lifecycle / loaders (CASE rules enforced by core)
	// ---------------------------------------------------------------------------

	/** Hard reset to initial CASE1 state. */
	reset(): void {
		this.clearTransientUiState();
		this.session.resetToInitial();
		this.refreshFromCore();
	}

	/** Alias for starting a fresh exploration. */
	loadInitial(): void {
		this.clearTransientUiState();
		this.session.loadInitial();
		this.refreshFromCore();
	}

	/**
	 * Load a FEN into CASE1 (only allowed in CASE1_FREE).
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
	 * Load a PGN into CASE2_PGN (only allowed in CASE1_FREE).
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
	 * Load a DB game into CASE2_DB (only allowed in CASE1_FREE).
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

	goStart(): void {
		this.session.goStart();
		this.refreshFromCore();
	}

	goEnd(): void {
		this.session.goEnd();
		this.refreshFromCore();
	}

	goPrev(): void {
		this.session.goPrev();
		this.refreshFromCore();
	}

	goNext(): void {
		this.session.goNext();
		this.refreshFromCore();
	}

	goToPly(ply: number): void {
		this.session.goToPly(ply);
		this.refreshFromCore();
	}

	// ---------------------------------------------------------------------------
	// Public API — move attempt + promotion workflow
	// ---------------------------------------------------------------------------

	/**
	 * Attempt a move from the current position.
	 *
	 * Returns:
	 * - true  -> move was applied by the core (board can accept it visually)
	 * - false -> move was rejected or requires promotion (board must snap back)
	 *
	 * Success:
	 * - core state changes -> refresh signals
	 *
	 * Failure:
	 * - PROMOTION_REQUIRED -> populate `promotionPending` (UI must call confirmPromotion)
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
	 * Resolve a pending promotion by replaying the last (from/to) attempt
	 * with the chosen promotion piece.
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
	// Internal helpers
	// ---------------------------------------------------------------------------

	/** Clears UI-only transient state (errors, promotion prompt). */
	private clearTransientUiState(): void {
		this._lastError.set(null);
		this._promotionPending.set(null);
	}

	/**
	 * Pull fresh state from the core session into signals.
	 * Must be called after any successful action that mutates the core.
	 */
	private refreshFromCore(): void {
		this._mode.set(this.session.getMode());
		this._source.set(this.session.getSource());
		this._fen.set(this.session.getCurrentFen());
		this._ply.set(this.session.getCurrentPly());

		this._moves.set(this.session.getActiveLineMoves());

		this._canPrev.set(this.session.canGoPrev());
		this._canNext.set(this.session.canGoNext());

		const incoming = this.session.getCurrentNode().incomingMove;
		this._lastMoveSquares.set(incoming ? { from: incoming.from, to: incoming.to } : null);
	}
}
