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
 *   - expose errors for UI feedback (import errors, lastError)
 *   - expose promotionPending when PROMOTION_REQUIRED occurs
 *
 * Non-responsibilities:
 * - No chess rules here (all rules live in ExplorerSession).
 * - No UI rendering here (snackbars/dialogs are handled by pages/components).
 *
 * Notes:
 * - Keep all comments in English.
 * - This file may expose *keys* (enum-like values) that UI can map to i18n later.
 * - For dates, we pass through ISO strings and let UI format later using a dedicated layer.
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
	ExplorerMainlineMove, // Keep only if some UI still consumes `facade.moves()`
	PromotionPiece,
	ExplorerGameSnapshot,
} from 'my-chess-opening-core/explorer';

import {
	parsePgnTags,
	mapPgnTagsToExplorerHeaders,
	type PgnTags,
} from 'my-chess-opening-core/explorer';

import type { ExplorerGameHeaders } from 'my-chess-opening-core/explorer';

import type {
	GameInfoHeaderVm,
	GameInfoPlayerVm,
	PlayerSide,
} from '../view-models/game-info-header.vm';

import type { BoardOrientation } from '../board/board-adapter';

import * as gameInfoBuilders from './explorer-game-info.builders';

/**
 * UI-friendly representation of a "promotion required" situation.
 * The UI can decide to:
 * - show a promotion picker
 * - disable input until resolved
 * - or cancel promotion by navigating elsewhere (depending on adapter strategy)
 */
type PromotionPending = {
	from: string;
	to: string;
	options: PromotionPiece[];
};

/**
 * UI hint: squares to highlight for the last applied move in the current path.
 * Derived from the current node incoming move (root has no incoming move).
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

	/**
	 * Pending DB game id requested by navigation (e.g. /explorer?dbGameId=...).
	 * This is intentionally UI-side only (it is NOT core state).
	 *
	 * In V1.5.x, this is "consumed" by IPC loading and cleared on success.
	 */
	private readonly _pendingDbGameId = signal<string | null>(null);

	/**
	 * Board orientation is a pure UI preference:
	 * - It must NOT affect core state (FEN, moves, legality).
	 * - It must NOT be reset when loading FEN/PGN/resetting the session.
	 * - It is only changed by an explicit user action (rotate) or by DB load rule.
	 */
	private readonly _boardOrientation = signal<BoardOrientation>('white');

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
	 * Preferred UI representation (should replace legacy flat move lists).
	 */
	private readonly _moveListRows = signal<ExplorerMoveListRow[]>([]);
	private readonly _variationsByNodeId = signal<Record<string, ExplorerVariationLine[]>>({});

	/**
	 * Legacy mainline list (flat half-moves), with variationCount meta.
	 * Keep only if still used by some component. Otherwise remove safely later.
	 */
	private readonly _moves = signal<ExplorerMainlineMove[]>(this.session.getMainlineMovesWithMeta());

	/** Navigation capabilities derived from the core cursor. */
	private readonly _canPrev = signal<boolean>(this.session.canGoPrev());
	private readonly _canNext = signal<boolean>(this.session.canGoNext());

	/**
	 * Generic last error for QA/debug and legacy UI.
	 * Prefer using more specific signals (importFenError/importPgnError) for import UX.
	 */
	private readonly _lastError = signal<ExplorerError | null>(null);

	/** Ephemeral import errors (FEN/PGN). Used by the Import component to notify the user. */
	private readonly _importFenError = signal<ExplorerError | null>(null);
	private readonly _importPgnError = signal<ExplorerError | null>(null);

	/** Promotion workflow state (set when PROMOTION_REQUIRED occurs). */
	private readonly _promotionPending = signal<PromotionPending | null>(null);

	/** Squares of the last applied move (used by the board adapter for highlighting). */
	private readonly _lastMoveSquares = signal<LastMoveSquares>(null);

	/**
	 * "Tick" signal used to re-run computed selectors that call into the core session directly.
	 * We do NOT mirror every core selector as a signal; instead we refresh this tick on updates.
	 */
	private readonly _rev = signal(0);

	/** Normalized FEN (first 4 fields) for stable position identity. */
	private readonly _normalizedFen = signal<string>(this.session.getCurrentNormalizedFen());

	/** Stable position key derived from normalizedFen (FNV-1a 64-bit hex). */
	private readonly _positionKey = signal<string>(this.session.getCurrentPositionKey());

	/** DB snapshot currently loaded in the core session (null when not in DB snapshot mode). */
	private readonly _dbGameSnapshot = signal<ExplorerGameSnapshot | null>(
		this.session.getDbGameSnapshot(),
	);

	/** PGN headers parsed from an ephemeral import (UI-side cache). */
	private readonly _ephemeralPgnTags = signal<PgnTags | null>(null);

	// ---------------------------------------------------------------------------
	// Public readonly signals (what the UI should consume)
	// ---------------------------------------------------------------------------

	readonly pendingDbGameId = this._pendingDbGameId.asReadonly();
	readonly boardOrientation = this._boardOrientation.asReadonly();

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

	/** Ephemeral import is only allowed from CASE1_FREE. */
	readonly importRequiresReset = computed(() => this.mode() !== 'CASE1_FREE');

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
	readonly importFenError = this._importFenError.asReadonly();
	readonly importPgnError = this._importPgnError.asReadonly();
	readonly promotionPending = this._promotionPending.asReadonly();
	readonly lastMoveSquares = this._lastMoveSquares.asReadonly();

	readonly normalizedFen = this._normalizedFen.asReadonly();
	readonly positionKey = this._positionKey.asReadonly();
	readonly dbGameSnapshot = this._dbGameSnapshot.asReadonly();

	/**
	 * Normalized headers consumed by multiple UI blocks.
	 * Source precedence:
	 * - DB snapshot (when present)
	 * - Ephemeral PGN tags (when source.kind === 'PGN')
	 * - Otherwise null
	 */
	readonly gameHeaders = computed<ExplorerGameHeaders | null>(() => {
		const db = this._dbGameSnapshot();
		if (db?.headers) return db.headers;

		const src = this._source();
		const tags = this._ephemeralPgnTags();
		if (src.kind === 'PGN' && tags) return mapPgnTagsToExplorerHeaders(tags);

		return null;
	});

	/**
	 * Single header VM used by the whole game-info-panel and its sub-components.
	 *
	 * Key goals:
	 * - Provide structured/raw data (i18n-friendly keys, ISO strings).
	 * - Do not pre-format "line1/line2" strings here.
	 * - Player-card decides top/bottom from `boardOrientation`.
	 */
	readonly gameInfoHeaderVm = computed<GameInfoHeaderVm>(() => {
		// Recompute when cursor-dependent selectors change (navigation, variations, etc.).
		this._rev();

		const headers = this.gameHeaders();
		const myColor = this.getPerspectiveColor();
		const boardOrientation = this.boardOrientation();

		// Cursor-dependent core selectors.
		const captured = this.session.getCapturedPiecesAtCursor();
		const material = this.session.getMaterialAtCursor();

		const timeControlVm = gameInfoBuilders.buildTimeControlVm(headers);
		const playedAtIso = (headers?.playedAtIso ?? '').trim() || undefined;

		const meta = {
			...(timeControlVm ? { timeControl: timeControlVm } : {}),
			ratedKey: gameInfoBuilders.toRatedKey(headers?.rated),
			speedKey: gameInfoBuilders.toSpeedKey(headers?.speed),
			...(playedAtIso ? { playedAtIso } : {}),
		};

		const players: Record<PlayerSide, GameInfoPlayerVm> = {
			white: gameInfoBuilders.buildGameInfoPlayerVm('white', headers, myColor),
			black: gameInfoBuilders.buildGameInfoPlayerVm('black', headers, myColor),
		};

		const site = gameInfoBuilders.buildSiteVm(headers);
		const result = gameInfoBuilders.buildResultVm(
			(headers?.result ?? '').trim() || undefined,
			myColor,
		);
		const opening = gameInfoBuilders.buildOpeningVm(headers);

		const vm: GameInfoHeaderVm = {
			boardOrientation,
			...(myColor ? { myColor } : {}),
			meta,
			players,
			...(site ? { site } : {}),
			result,
			...(opening ? { opening } : {}),
			captured,
			material,
		};

		return vm;
	});

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

		normalizedFen: this._normalizedFen(),
		positionKey: this._positionKey(),
		dbGameSnapshot: this._dbGameSnapshot(),
		pendingDbGameId: this._pendingDbGameId(),
		boardOrientation: this._boardOrientation(),

		// UI helpers / derived state (useful for diagnostics)
		canStart: this.canStart(),
		canEnd: this.canEnd(),
		importRequiresReset: this.importRequiresReset(),

		importFenError: this._importFenError(),
		importPgnError: this._importPgnError(),
		ephemeralPgnTags: this._ephemeralPgnTags(),

		gameHeaders: this.gameHeaders(),
		gameInfoHeaderVm: this.gameInfoHeaderVm(),

		rev: this._rev(),
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
		this.setPendingDbGameId(null);
		this.session.resetToInitial();
		this._ephemeralPgnTags.set(null);
		this.refreshFromCore();
	}

	/** Starts a fresh exploration (alias kept for UI readability). */
	loadInitial(): void {
		this.clearTransientUiState();
		this.session.loadInitial();
		this._ephemeralPgnTags.set(null);
		this.refreshFromCore();
	}

	/** Manual board rotation (UI preference). */
	toggleBoardOrientation(): void {
		this._boardOrientation.set(this._boardOrientation() === 'white' ? 'black' : 'white');
	}

	/** Force an orientation (used by DB-load perspective rule). */
	setBoardOrientation(orientation: BoardOrientation): void {
		this._boardOrientation.set(orientation);
	}

	/** UI-friendly alias for ephemeral import. */
	loadFen(fen: string): void {
		this._ephemeralPgnTags.set(null);
		this.loadFenForCase1(fen);
	}

	/**
	 * Loads a FEN into CASE1 (only allowed in CASE1_FREE).
	 * On failure, sets `importFenError` (and `lastError` for QA/legacy use).
	 */
	loadFenForCase1(fen: string): void {
		this.clearTransientUiState();

		const result = this.session.loadFenForCase1(fen);
		if (result.ok) {
			this.refreshFromCore();
			return;
		}

		this.setImportError('FEN', result.error);
	}

	/**
	 * Loads a PGN into CASE2_PGN (only allowed in CASE1_FREE).
	 * On failure, sets `importPgnError` (and `lastError` for QA/legacy use).
	 */
	loadPgn(pgn: string, meta?: { name?: string }): void {
		this.clearTransientUiState();

		const result = this.session.loadPgn(pgn, meta);
		if (result.ok) {
			this._ephemeralPgnTags.set(parsePgnTags(pgn));
			this.refreshFromCore();
			return;
		}

		this.setImportError('PGN', result.error);
	}

	/**
	 * Loads a DB game into CASE2_DB (only allowed in CASE1_FREE).
	 * On failure, sets `lastError`.
	 *
	 * Legacy note:
	 * Prefer loadDbGameSnapshot() for future-proof "single payload" DB loading.
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

	/**
	 * Loads a DB game snapshot into CASE2_DB (only allowed in CASE1_FREE).
	 * On failure, sets `lastError`.
	 */
	loadDbGameSnapshot(snapshot: ExplorerGameSnapshot): void {
		this.clearTransientUiState();

		const result = this.session.loadDbGameSnapshot(snapshot);
		if (result.ok) {
			// Snapshot load is a "hard context switch" -> clear UI-side request state.
			this._lastError.set(null);
			this.setPendingDbGameId(null);
			this._ephemeralPgnTags.set(null);

			// DB-load rule: if the snapshot provides a perspective color, keep the owner at the bottom.
			this.applyDbLoadOrientationRule(snapshot);

			this.refreshFromCore();
			return;
		}

		this._lastError.set(result.error);
	}

	/**
	 * Stores a pending DB game id requested by navigation (query param).
	 * `null` clears the pending request.
	 */
	setPendingDbGameId(gameId: string | null): void {
		const id = (gameId ?? '').trim();
		this._pendingDbGameId.set(id.length ? id : null);
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
	 * For variations, prefer goToNode(nodeId).
	 */
	goToPly(ply: number): void {
		this.clearTransientUiState();
		this.session.goToPly(ply);
		this.refreshFromCore();
	}

	/**
	 * Node-based navigation (required for clicking moves inside variations).
	 *
	 * Note:
	 * Core uses an opaque node id type; UI keeps node ids as string.
	 * We cast locally to keep the facade API ergonomic without leaking core types into templates.
	 */
	goToNode(nodeId: string): void {
		this.clearTransientUiState();
		this.session.goToNode(nodeId as unknown as any);
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
	 * - false -> move rejected or requires promotion
	 *
	 * Failure mapping:
	 * - PROMOTION_REQUIRED -> populate promotionPending
	 * - otherwise -> populate lastError
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
	 * Resolves a pending promotion by replaying the (from/to) attempt with the chosen piece.
	 * Safe no-op if there is no pending promotion.
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
		this._importFenError.set(null);
	}

	/** Clears the last PGN import error (called by Import component on edit/empty). */
	clearImportPgnError(): void {
		this._importPgnError.set(null);
	}

	// ---------------------------------------------------------------------------
	// Internal helpers
	// ---------------------------------------------------------------------------

	private setImportError(kind: 'FEN' | 'PGN', error: ExplorerError): void {
		if (kind === 'FEN') this._importFenError.set(error);
		else this._importPgnError.set(error);

		// Keep for QA/debug (and any legacy UI still reading lastError).
		this._lastError.set(error);
	}

	/**
	 * Clears UI-only transient state (errors and promotion prompt).
	 * This must NOT mutate core state.
	 */
	private clearTransientUiState(): void {
		this._lastError.set(null);
		this._promotionPending.set(null);
		this.clearImportFenError();
		this.clearImportPgnError();
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
		this._normalizedFen.set(this.session.getCurrentNormalizedFen());
		this._positionKey.set(this.session.getCurrentPositionKey());
		this._dbGameSnapshot.set(this.session.getDbGameSnapshot());
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

		// Derived last move squares
		const incoming = this.session.getCurrentNode().incomingMove;
		this._lastMoveSquares.set(incoming ? { from: incoming.from, to: incoming.to } : null);

		// Notify computed selectors that depend on core (variationInfo, canPrevVariation, ...)
		this._rev.update((v) => v + 1);
	}

	/**
	 * Applies the DB-load orientation rule:
	 * When loading a DB snapshot and it provides myColor, keep that color at the bottom.
	 * For non-DB loads (FEN/PGN), we keep the current orientation as-is.
	 */
	private applyDbLoadOrientationRule(snapshot: ExplorerGameSnapshot): void {
		if (snapshot.kind !== 'DB') return;

		const c = snapshot.myColor;
		if (c === 'white' || c === 'black') {
			this.setBoardOrientation(c);
		}
	}

	/**
	 * Returns the perspective color when we are in DB snapshot mode.
	 * Used for:
	 * - players "isMe" flags
	 * - result tone (win/lose)
	 */
	private getPerspectiveColor(): 'white' | 'black' | undefined {
		const db = this._dbGameSnapshot();
		return db?.kind === 'DB' ? db.myColor : undefined;
	}
}
