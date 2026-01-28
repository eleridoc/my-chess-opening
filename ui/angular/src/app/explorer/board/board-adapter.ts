import { InjectionToken } from '@angular/core';

/**
 * Board adapter contracts (UI layer)
 *
 * Goal:
 * - Keep Angular feature code independent from any specific chessboard library.
 * - Board implementations (cm-chessboard today, something else tomorrow) only need to
 *   implement this interface and can be swapped via Angular DI.
 *
 * Ownership boundaries:
 * - The adapter owns rendering + DOM events + low-level user gestures.
 * - The core (ExplorerSession) remains the single source of truth for rules and legality.
 *
 * Design notes:
 * - We support two modes of move handling:
 *   1) "Authoritative core" (default): adapter emits an attempt, UI applies FEN update.
 *   2) "Optimistic" (optional): adapter asks a synchronous validator to accept/reject
 *      immediately (no flicker), then UI still updates FEN afterwards.
 */

/** Board orientation (also used as the UI label for color restriction). */
export type BoardOrientation = 'white' | 'black';

/** Allowed promotion pieces (UCI-style letters). */
export type BoardPromotionPiece = 'q' | 'r' | 'b' | 'n';

/**
 * Move attempt emitted by the board adapter.
 *
 * Notes:
 * - Squares are always expected in algebraic lowercase ("e2", "a8", ...).
 * - `promotion` is present only when the move requires a promotion piece.
 */
export type BoardMoveAttempt = {
	from: string;
	to: string;
	promotion?: BoardPromotionPiece;
};

/**
 * From/to squares to highlight for the last applied move.
 * Use null to clear the highlight.
 */
export type BoardLastMoveSquares = { from: string; to: string } | null;

/**
 * ChessBoardAdapter
 *
 * Minimal UI-friendly contract implemented by a board library adapter.
 * The Angular UI should depend only on this interface.
 */
export interface ChessBoardAdapter {
	/**
	 * Updates the displayed position.
	 * Input is a full FEN string (forwarded to the underlying board implementation).
	 */
	setFen(fen: string): void;

	/**
	 * Updates the board orientation (optional feature).
	 *
	 * Notes:
	 * - This is a UI/display concern only (which side is at the bottom).
	 * - When implemented, the adapter should preserve the current position and
	 *   re-apply its current UI state (last move highlight, input enabled/allowed color, etc.).
	 */
	setOrientation?(orientation: BoardOrientation): void;

	/**
	 * Enables/disables user move input (drag&drop and click-to-move).
	 * When disabled, the adapter must not emit move attempts.
	 */
	setMoveInputEnabled(enabled: boolean): void;

	/**
	 * Restricts move input to a single side.
	 * Use null to allow both sides (useful for free exploration or analysis modes).
	 */
	setMoveInputAllowedColor(color: BoardOrientation | null): void;

	/**
	 * Highlights the last applied move squares (optional feature).
	 * If not implemented by an adapter, the UI must not rely on it.
	 */
	setLastMoveSquares?(lastMove: BoardLastMoveSquares): void;

	/**
	 * Optional hook for board implementations that require manual refresh/resize
	 * when the host element size changes.
	 */
	onHostResize?(): void;

	/**
	 * Releases DOM/event resources.
	 * Must be safe to call multiple times.
	 */
	destroy(): void;
}

/**
 * ChessBoardAdapterInit
 *
 * Initialization payload passed to an adapter implementation.
 *
 * It contains:
 * - rendering settings
 * - assets configuration
 * - callbacks for move attempts
 * - optional synchronous callbacks for validation and UI hinting
 */
export interface ChessBoardAdapterInit {
	/** Host element where the board must render. */
	element: HTMLElement;

	/** Initial position (full FEN). */
	fen: string;

	/**
	 * Board orientation (default is typically "white" for the UI).
	 * Controls which side is shown at the bottom.
	 */
	orientation?: BoardOrientation;

	/**
	 * Base URL where board assets (piece SVGs, markers, etc.) are served.
	 * Example: "assets/cm-chessboard/"
	 */
	assetsUrl: string;

	/**
	 * Called when the user attempts a move on the board.
	 * The adapter should emit this only when move input is enabled.
	 *
	 * Note:
	 * - For best UX, prefer `validateMoveAttempt` when possible.
	 */
	onMoveAttempt?: (attempt: BoardMoveAttempt) => void;

	/**
	 * Optional synchronous validation hook.
	 * Return true to accept the move immediately, false to reject it.
	 *
	 * Purpose:
	 * - Enables "no-flicker" UX when the core can validate synchronously.
	 *
	 * Important:
	 * - Even in optimistic mode, the UI must still update the board through `setFen()`
	 *   after the core mutates state (authoritative source).
	 */
	validateMoveAttempt?: (attempt: BoardMoveAttempt) => boolean;

	/**
	 * Optional synchronous, read-only callback used for UI hinting.
	 * Given an origin square (e.g. "e2"), returns all legal destination squares (e.g. ["e3", "e4"]).
	 *
	 * Used by some adapters to:
	 * - prevent selecting pieces with no legal moves
	 * - draw dots on legal destinations
	 * - highlight hover squares during click-to-move or drag&drop
	 */
	getLegalDestinationsFrom?: (from: string) => string[];

	/**
	 * Optional synchronous, read-only callback used for capture hinting.
	 * Given an origin square, returns destination squares that are captures
	 * (so the adapter can display a ring marker instead of a dot).
	 *
	 * Note:
	 * - May include en passant targets.
	 */
	getLegalCaptureDestinationsFrom?: (from: string) => string[];
}

/**
 * Factory interface used by Angular DI to create the active board adapter.
 * This avoids directly instantiating a board adapter in Angular components.
 */
export interface ChessBoardAdapterFactory {
	create(init: ChessBoardAdapterInit): ChessBoardAdapter;
}

/**
 * DI token used by the UI to resolve the currently selected board adapter implementation.
 */
export const CHESS_BOARD_ADAPTER_FACTORY = new InjectionToken<ChessBoardAdapterFactory>(
	'CHESS_BOARD_ADAPTER_FACTORY',
);
