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
 * Goals:
 * - Keep ExplorerFacade focused on the public API.
 * - Centralize core-to-signal synchronization and transient UI state handling.
 * - Preserve behavior: this is a direct extraction from ExplorerFacade.
 */

export type PromotionPending = {
	from: string;
	to: string;
	options: PromotionPiece[];
};

export type LastMoveSquares = { from: string; to: string } | null;

export type CoreSyncSignals = {
	mode: WritableSignal<ExplorerMode>;
	source: WritableSignal<ExplorerSessionSource>;
	fen: WritableSignal<string>;
	ply: WritableSignal<number>;
	currentNodeId: WritableSignal<string>;

	moveListRows: WritableSignal<ExplorerMoveListRow[]>;
	variationsByNodeId: WritableSignal<Record<string, ExplorerVariationLine[]>>;

	// legacy
	moves: WritableSignal<ExplorerMainlineMove[]>;

	canPrev: WritableSignal<boolean>;
	canNext: WritableSignal<boolean>;

	normalizedFen: WritableSignal<string>;
	positionKey: WritableSignal<string>;
	dbGameSnapshot: WritableSignal<ExplorerGameSnapshot | null>;

	lastMoveSquares: WritableSignal<LastMoveSquares>;
	rev: WritableSignal<number>;
};

export type TransientSignals = {
	lastError: WritableSignal<ExplorerError | null>;
	importFenError: WritableSignal<ExplorerError | null>;
	importPgnError: WritableSignal<ExplorerError | null>;
	promotionPending: WritableSignal<PromotionPending | null>;
};

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
