/**
 * ExplorerFacade (UI / Angular)
 *
 * Orchestration layer between Angular UI components and the core domain engine
 * (`ExplorerSession` from `my-chess-opening-core`).
 *
 * This file intentionally focuses on:
 * - Owning a single `ExplorerSession` instance for the whole application lifetime.
 * - Exposing UI-friendly reactive state (signals) via a dedicated state factory.
 * - Providing an imperative API for UI intents (reset, navigation, imports, move attempts).
 * - Ensuring transient UI state is cleared and core-to-UI synchronization is refreshed
 *   after any successful core mutation.
 *
 * Implementation notes:
 * - Writable signals, computed selectors, and game-info builders are extracted to keep this file small:
 *   - `createExplorerFacadeState()` centralizes writable signals + computed selectors wiring.
 *   - `createExplorerFacadeSelectors()` hosts the heavy computed blocks.
 *   - `explorer-facade.game-info.builders.ts` contains pure VM builder helpers used by selectors.
 * - This facade re-exports the state signals with stable public names for template ergonomics.
 *
 * Non-responsibilities:
 * - No chess rules here (all rules live in the core `ExplorerSession`).
 * - No UI rendering here (snackbars/dialogs are handled by pages/components).
 *
 * Notes:
 * - Keep all comments in English.
 * - For dates, we pass ISO strings and let UI format later using a dedicated layer.
 */

import { Injectable } from '@angular/core';

import { ExplorerSession } from 'my-chess-opening-core/explorer';

import type {
	ExplorerDbGameMeta,
	ExplorerMoveAttempt,
	ExplorerGameSnapshot,
	PromotionPiece,
} from 'my-chess-opening-core/explorer';

import { parsePgnTags } from 'my-chess-opening-core/explorer';

import type { BoardOrientation } from '../board/board-adapter';

import {
	applyDbLoadOrientationRule,
	clearTransientUiState,
	refreshFromCore,
	setImportError,
} from './explorer-facade.internal';

import { createExplorerFacadeState } from './explorer-facade.state';

@Injectable({ providedIn: 'root' })
export class ExplorerFacade {
	// ---------------------------------------------------------------------------
	// Core engine (single instance for app lifetime)
	// ---------------------------------------------------------------------------

	private readonly session = new ExplorerSession();

	/**
	 * Centralized state (writable signals + computed selectors).
	 *
	 * Important:
	 * - UI components should only consume the readonly signals re-exported by this facade.
	 * - Only the facade (imperative API) mutates writable state (e.g. `_ephemeralPgnTags`).
	 */
	private readonly state = createExplorerFacadeState(this.session);

	// ---------------------------------------------------------------------------
	// Public readonly signals (what the UI should consume)
	// ---------------------------------------------------------------------------

	readonly pendingDbGameId = this.state.pendingDbGameId;
	readonly boardOrientation = this.state.boardOrientation;

	readonly mode = this.state.mode;
	readonly source = this.state.source;
	readonly fen = this.state.fen;
	readonly ply = this.state.ply;

	readonly currentNodeId = this.state.currentNodeId;
	readonly moveListRows = this.state.moveListRows;
	readonly variationsByNodeId = this.state.variationsByNodeId;

	// Legacy (remove if unused)
	readonly moves = this.state.moves;

	readonly canPrev = this.state.canPrev;
	readonly canNext = this.state.canNext;

	readonly canStart = this.state.canStart;
	readonly canEnd = this.state.canEnd;

	readonly importRequiresReset = this.state.importRequiresReset;

	readonly canPrevVariation = this.state.canPrevVariation;
	readonly canNextVariation = this.state.canNextVariation;
	readonly variationInfo = this.state.variationInfo;

	readonly lastError = this.state.lastError;
	readonly importFenError = this.state.importFenError;
	readonly importPgnError = this.state.importPgnError;
	readonly promotionPending = this.state.promotionPending;
	readonly lastMoveSquares = this.state.lastMoveSquares;

	readonly normalizedFen = this.state.normalizedFen;
	readonly positionKey = this.state.positionKey;
	readonly dbGameSnapshot = this.state.dbGameSnapshot;

	readonly gameHeaders = this.state.gameHeaders;
	readonly gameInfoHeaderVm = this.state.gameInfoHeaderVm;
	readonly snapshot = this.state.snapshot;

	constructor() {
		// Ensure signals are consistent with the initial core state.
		this.refresh();
	}

	// ---------------------------------------------------------------------------
	// Public API — lifecycle / loaders (CASE rules enforced by core)
	// ---------------------------------------------------------------------------

	/**
	 * Hard reset to initial CASE1 state.
	 * Clears transient UI state, resets core, then refreshes signals.
	 */
	reset(): void {
		this.clearTransient();
		this.setPendingDbGameId(null);

		this.session.resetToInitial();
		this.state._ephemeralPgnTags.set(null);

		this.refresh();
	}

	/** Starts a fresh exploration (alias kept for UI readability). */
	loadInitial(): void {
		this.clearTransient();

		this.session.loadInitial();
		this.state._ephemeralPgnTags.set(null);

		this.refresh();
	}

	/** Manual board rotation (UI preference). */
	toggleBoardOrientation(): void {
		// Use update() to avoid reading the signal twice.
		this.state._boardOrientation.update((o) => (o === 'white' ? 'black' : 'white'));
	}

	/** Force an orientation (used by DB-load perspective rule). */
	setBoardOrientation(orientation: BoardOrientation): void {
		this.state._boardOrientation.set(orientation);
	}

	/** UI-friendly alias for ephemeral import. */
	loadFen(fen: string): void {
		// Ephemeral PGN cache becomes irrelevant as soon as we load a FEN.
		this.state._ephemeralPgnTags.set(null);
		this.loadFenForCase1(fen);
	}

	/**
	 * Loads a FEN into CASE1 (only allowed in CASE1_FREE).
	 * On failure, sets `importFenError` (and `lastError` for QA/legacy use).
	 */
	loadFenForCase1(fen: string): void {
		this.clearTransient();

		const result = this.session.loadFenForCase1(fen);
		if (result.ok) {
			this.refresh();
			return;
		}

		setImportError('FEN', result.error, this.state.transient);
	}

	/**
	 * Loads a PGN into CASE2_PGN (only allowed in CASE1_FREE).
	 * On failure, sets `importPgnError` (and `lastError` for QA/legacy use).
	 */
	loadPgn(pgn: string, meta?: { name?: string }): void {
		this.clearTransient();

		const result = this.session.loadPgn(pgn, meta);
		if (result.ok) {
			this.state._ephemeralPgnTags.set(parsePgnTags(pgn));
			this.refresh();
			return;
		}

		setImportError('PGN', result.error, this.state.transient);
	}

	/**
	 * Loads a DB game into CASE2_DB (only allowed in CASE1_FREE).
	 * On failure, sets `lastError`.
	 *
	 * Legacy note:
	 * Prefer loadDbGameSnapshot() for future-proof "single payload" DB loading.
	 */
	loadGameMovesSan(movesSan: string[], meta: ExplorerDbGameMeta): void {
		this.clearTransient();

		const result = this.session.loadGameMovesSan(movesSan, meta);
		if (result.ok) {
			this.refresh();
			return;
		}

		this.state._lastError.set(result.error);
	}

	/**
	 * Loads a DB game snapshot into CASE2_DB (only allowed in CASE1_FREE).
	 * On failure, sets `lastError`.
	 */
	loadDbGameSnapshot(snapshot: ExplorerGameSnapshot): void {
		this.clearTransient();

		const result = this.session.loadDbGameSnapshot(snapshot);
		if (result.ok) {
			// Snapshot load is a "hard context switch" -> clear UI-side request state.
			this.state._lastError.set(null);
			this.setPendingDbGameId(null);
			this.state._ephemeralPgnTags.set(null);

			// DB-load rule: if the snapshot provides a perspective color, keep the owner at the bottom.
			applyDbLoadOrientationRule(snapshot, (o: BoardOrientation) => this.setBoardOrientation(o));

			this.refresh();
			return;
		}

		this.state._lastError.set(result.error);
	}

	/**
	 * Stores a pending DB game id requested by navigation (query param).
	 * `null` clears the pending request.
	 */
	setPendingDbGameId(gameId: string | null): void {
		const id = (gameId ?? '').trim();
		this.state._pendingDbGameId.set(id.length ? id : null);
	}

	// ---------------------------------------------------------------------------
	// Public API — navigation
	// ---------------------------------------------------------------------------

	/**
	 * Navigation clears transient UI state before moving the core cursor.
	 * This ensures errors/promotions don't remain visible after unrelated actions.
	 */
	goStart(): void {
		this.clearTransient();
		this.session.goStart();
		this.refresh();
	}

	goEnd(): void {
		this.clearTransient();
		this.session.goEnd();
		this.refresh();
	}

	goPrev(): void {
		this.clearTransient();
		this.session.goPrev();
		this.refresh();
	}

	goNext(): void {
		this.clearTransient();
		this.session.goNext();
		this.refresh();
	}

	goPrevVariation(): void {
		this.clearTransient();
		this.session.goPrevVariation();
		this.refresh();
	}

	goNextVariation(): void {
		this.clearTransient();
		this.session.goNextVariation();
		this.refresh();
	}

	/**
	 * Mainline-only navigation by ply.
	 * For variations, prefer goToNode(nodeId).
	 */
	goToPly(ply: number): void {
		this.clearTransient();
		this.session.goToPly(ply);
		this.refresh();
	}

	/**
	 * Node-based navigation (required for clicking moves inside variations).
	 *
	 * Note:
	 * Core uses an opaque node id type; UI keeps node ids as string.
	 * We cast locally to keep the facade API ergonomic without leaking core types into templates.
	 */
	goToNode(nodeId: string): void {
		this.clearTransient();
		this.session.goToNode(nodeId as unknown as any);
		this.refresh();
	}

	// ---------------------------------------------------------------------------
	// Public API — move attempts + promotion workflow
	// ---------------------------------------------------------------------------

	/**
	 * Attempts a move from the current cursor position.
	 *
	 * Return value:
	 * - true  -> move was applied by the core (board may keep the piece)
	 * - false -> move rejected or requires promotion
	 *
	 * Failure mapping:
	 * - PROMOTION_REQUIRED -> populate promotionPending
	 * - otherwise -> populate lastError
	 */
	attemptMove(attempt: ExplorerMoveAttempt): boolean {
		this.clearTransient();

		const result = this.session.applyMoveUci(attempt);
		if (result.ok) {
			this.refresh();
			return true;
		}

		if (result.error.code === 'PROMOTION_REQUIRED') {
			const details = result.error.details;

			// Defensive: core should always provide details for PROMOTION_REQUIRED.
			if (!details) {
				this.state._lastError.set({
					code: 'INTERNAL_ERROR',
					message: 'Promotion required but missing details.',
				});
				return false;
			}

			this.state._promotionPending.set({
				from: details.from,
				to: details.to,
				options: details.options,
			});
			return false;
		}

		this.state._lastError.set(result.error);
		return false;
	}

	/**
	 * Resolves a pending promotion by replaying the (from/to) attempt with the chosen piece.
	 * Safe no-op if there is no pending promotion.
	 */
	confirmPromotion(piece: PromotionPiece): void {
		const pending = this.state._promotionPending();
		if (!pending) return;

		this.attemptMove({
			from: pending.from,
			to: pending.to,
			promotion: piece,
		});
	}

	// ---------------------------------------------------------------------------
	// Public API — board hinting
	// ---------------------------------------------------------------------------

	getLegalDestinationsFrom(from: string): string[] {
		return this.session.getLegalDestinationsFrom(from);
	}

	getLegalCaptureDestinationsFrom(from: string): string[] {
		return this.session.getLegalCaptureDestinationsFrom(from);
	}

	/** Clears the last FEN import error (called by Import component on edit/empty). */
	clearImportFenError(): void {
		this.state.transient.importFenError.set(null);
	}

	/** Clears the last PGN import error (called by Import component on edit/empty). */
	clearImportPgnError(): void {
		this.state.transient.importPgnError.set(null);
	}

	// ---------------------------------------------------------------------------
	// Internal helpers (facade-local)
	// ---------------------------------------------------------------------------

	private clearTransient(): void {
		clearTransientUiState(this.state.transient);
	}

	private refresh(): void {
		refreshFromCore(this.session, this.state.coreSync);
	}
}
