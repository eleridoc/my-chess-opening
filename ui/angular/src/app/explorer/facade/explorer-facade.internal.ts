import type { WritableSignal } from '@angular/core';

import type { ExplorerSession } from 'my-chess-opening-core/explorer';
import type {
	ExplorerError,
	ExplorerGameSnapshot,
	ExplorerMainlineMove,
	ExplorerMode,
	ExplorerMoveListRow,
	ExplorerSessionSource,
	ExplorerVariationLine,
	PromotionPiece,
} from 'my-chess-opening-core/explorer';

import type { BoardOrientation } from '../board/board-adapter';

/**
 * ExplorerFacade internals (pure-ish helpers).
 *
 * This module centralizes small helper types and functions used by the facade.
 * The helpers here are "pure-ish":
 * - They do not mutate the core domain engine directly (except via explicit callbacks).
 * - They DO mutate Angular signals, by design (this is the facade boundary).
 *
 * Goals:
 * - Keep ExplorerFacade focused on the public imperative API.
 * - Provide a single place for core-to-signal synchronization.
 * - Keep transient UI state rules consistent across all intents (navigation, imports, moves).
 *
 * Non-goals:
 * - No UI formatting.
 * - No chess rules (handled by `ExplorerSession` in the core package).
 */

// -----------------------------------------------------------------------------
// Small shared types
// -----------------------------------------------------------------------------

/**
 * UI-friendly representation of a "promotion required" situation.
 * The UI can decide to:
 * - show a promotion picker
 * - disable input until resolved
 * - or cancel by navigating elsewhere (depending on adapter strategy)
 */
export type PromotionPending = {
	from: string;
	to: string;
	options: PromotionPiece[];
};

/**
 * UI hint: squares to highlight for the last applied move in the current path.
 * Derived from the current node incoming move (root has no incoming move).
 */
export type LastMoveSquares = { from: string; to: string } | null;

// -----------------------------------------------------------------------------
// Signal bundles
// -----------------------------------------------------------------------------

/**
 * Group of signals that mirror core session state.
 * Updated by `refreshFromCore()` after any successful core mutation.
 */
export type CoreSyncSignals = {
	mode: WritableSignal<ExplorerMode>;
	source: WritableSignal<ExplorerSessionSource>;
	fen: WritableSignal<string>;
	ply: WritableSignal<number>;
	currentNodeId: WritableSignal<string>;

	moveListRows: WritableSignal<ExplorerMoveListRow[]>;
	variationsByNodeId: WritableSignal<Record<string, ExplorerVariationLine[]>>;

	/** Legacy mainline list (kept only if some UI still consumes it). */
	moves: WritableSignal<ExplorerMainlineMove[]>;

	canPrev: WritableSignal<boolean>;
	canNext: WritableSignal<boolean>;

	normalizedFen: WritableSignal<string>;
	positionKey: WritableSignal<string>;
	dbGameSnapshot: WritableSignal<ExplorerGameSnapshot | null>;

	lastMoveSquares: WritableSignal<LastMoveSquares>;

	/**
	 * "Tick" signal used to re-run computed selectors that call into the core session directly.
	 * We do NOT mirror every core selector as a signal; selectors depend on this tick instead.
	 */
	rev: WritableSignal<number>;
};

/**
 * Group of UI-only transient signals.
 * These must be cleared whenever an unrelated intent occurs (navigation, load, etc.).
 */
export type TransientSignals = {
	lastError: WritableSignal<ExplorerError | null>;
	importFenError: WritableSignal<ExplorerError | null>;
	importPgnError: WritableSignal<ExplorerError | null>;
	promotionPending: WritableSignal<PromotionPending | null>;
};

// -----------------------------------------------------------------------------
// Transient errors helpers
// -----------------------------------------------------------------------------

/**
 * Sets an import error and also mirrors it into `lastError` for QA/debug purposes.
 * This ensures a single "most relevant" error remains available for generic UIs.
 */
export function setImportError(
	kind: 'FEN' | 'PGN',
	error: ExplorerError,
	signals: TransientSignals,
): void {
	if (kind === 'FEN') signals.importFenError.set(error);
	else signals.importPgnError.set(error);

	// Keep for QA/debug (and any legacy UI still reading lastError).
	signals.lastError.set(error);
}

/**
 * Clears UI-only transient state (errors and promotion prompt).
 * This must NOT mutate core state.
 */
export function clearTransientUiState(signals: TransientSignals): void {
	signals.lastError.set(null);
	signals.promotionPending.set(null);
	signals.importFenError.set(null);
	signals.importPgnError.set(null);
}

// -----------------------------------------------------------------------------
// Core -> UI sync
// -----------------------------------------------------------------------------

/**
 * Pulls fresh state from the core session into signals.
 * Must be called after any successful action that mutates the core.
 */
export function refreshFromCore(session: ExplorerSession, s: CoreSyncSignals): void {
	// Core state
	s.mode.set(session.getMode());
	s.source.set(session.getSource());
	s.fen.set(session.getCurrentFen());
	s.normalizedFen.set(session.getCurrentNormalizedFen());
	s.positionKey.set(session.getCurrentPositionKey());
	s.dbGameSnapshot.set(session.getDbGameSnapshot());
	s.ply.set(session.getCurrentPly());
	s.currentNodeId.set(session.getCurrentNodeId());

	// MoveList VM (preferred)
	const vm = session.getMoveListViewModel();
	s.moveListRows.set(vm.rows);
	s.variationsByNodeId.set(vm.variationsByNodeId);

	// Legacy mainline list (remove if unused)
	s.moves.set(session.getMainlineMovesWithMeta());

	// Navigation capabilities
	s.canPrev.set(session.canGoPrev());
	s.canNext.set(session.canGoNext());

	// Derived last move squares
	const incoming = session.getCurrentNode().incomingMove;
	s.lastMoveSquares.set(incoming ? { from: incoming.from, to: incoming.to } : null);

	// Notify computed selectors that depend on core (variationInfo, canPrevVariation, ...)
	s.rev.update((v) => v + 1);
}

// -----------------------------------------------------------------------------
// DB-load orientation rule
// -----------------------------------------------------------------------------

/**
 * Applies the DB-load orientation rule:
 * When loading a DB snapshot and it provides myColor, keep that color at the bottom.
 * For non-DB loads (FEN/PGN), we keep the current orientation as-is.
 */
export function applyDbLoadOrientationRule(
	snapshot: ExplorerGameSnapshot,
	setBoardOrientation: (orientation: BoardOrientation) => void,
): void {
	if (snapshot.kind !== 'DB') return;

	const c = snapshot.myColor;
	if (c === 'white' || c === 'black') {
		setBoardOrientation(c);
	}
}

// -----------------------------------------------------------------------------
// Perspective helpers
// -----------------------------------------------------------------------------

/**
 * Returns the perspective color when we are in DB snapshot mode.
 * Used for:
 * - players "isMe" flags
 * - result tone (win/lose)
 */
export function getPerspectiveColor(
	dbSnapshot: ExplorerGameSnapshot | null,
): 'white' | 'black' | undefined {
	return dbSnapshot?.kind === 'DB' ? dbSnapshot.myColor : undefined;
}
