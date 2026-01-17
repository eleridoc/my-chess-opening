import { InjectionToken } from '@angular/core';

/**
 * ChessBoardAdapter
 *
 * A minimal, UI-friendly chessboard contract.
 * The Angular UI should only depend on this interface so the underlying board
 * implementation can be swapped without changing the feature code.
 *
 * Notes:
 * - The adapter is responsible for rendering and low-level DOM/event handling.
 * - The core (ExplorerSession) remains the source of truth for chess rules.
 */
export interface ChessBoardAdapter {
	/**
	 * Updates the displayed position.
	 * The input is a full FEN string (the adapter forwards it to the board library).
	 */
	setFen(fen: string): void;

	/**
	 * Enables/disables user move input (drag&drop and click-to-move).
	 * When disabled, the board must not emit move attempts.
	 */
	setMoveInputEnabled(enabled: boolean): void;

	/**
	 * Restricts move input to a single color.
	 * Use null to allow both sides (useful for free exploration modes).
	 */
	setMoveInputAllowedColor(color: BoardOrientation | null): void;

	/**
	 * Highlights the last applied move squares (optional feature).
	 * If not implemented by an adapter, the UI should not rely on it.
	 */
	setLastMoveSquares?(lastMove: BoardLastMoveSquares): void;

	/**
	 * Optional hook for board libraries that require a manual refresh/resize
	 * when the host element size changes.
	 */
	onHostResize?(): void;

	/**
	 * Releases DOM/event resources.
	 * Must be safe to call multiple times.
	 */
	destroy(): void;
}

/** Board orientation (and also color labels used by the UI). */
export type BoardOrientation = 'white' | 'black';

/**
 * Represents a raw user move attempt on the board.
 * Coordinates are always algebraic (e.g. "e2", "e4").
 */
export type BoardMoveAttempt = {
	from: string;
	to: string;
};

/**
 * From/to squares to highlight for the last applied move.
 * Use null to clear the highlight.
 */
export type BoardLastMoveSquares = { from: string; to: string } | null;

/**
 * ChessBoardAdapterInit
 *
 * Initialization payload passed to an adapter implementation.
 * It contains:
 * - rendering settings
 * - assets configuration
 * - callbacks for move attempts and optional UI hinting
 */
export interface ChessBoardAdapterInit {
	/** Host element where the board must render. */
	element: HTMLElement;

	/** Initial position (full FEN). */
	fen: string;

	/**
	 * Board orientation (default is typically "white" for the UI).
	 * This controls which side is shown at the bottom.
	 */
	orientation?: BoardOrientation;

	/**
	 * Base URL where the board assets (piece SVGs, etc.) are served.
	 * Example: "assets/cm-chessboard/"
	 */
	assetsUrl: string;

	/**
	 * Called when the user attempts a move on the board.
	 * The adapter should emit this only when move input is enabled.
	 */
	onMoveAttempt?: (attempt: BoardMoveAttempt) => void;

	/**
	 * Optional synchronous validation hook.
	 * Return true to accept the move immediately, false to reject it.
	 *
	 * Note:
	 * - This enables "no-flicker" UX when the core can validate synchronously.
	 * - If omitted, the adapter should emit onMoveAttempt and wait for a FEN update.
	 */
	validateMoveAttempt?: (attempt: BoardMoveAttempt) => boolean;

	/**
	 * Optional synchronous, read-only callback used for UI hinting.
	 * Given an origin square (e.g. "e2"), returns all legal destination squares
	 * (e.g. ["e3", "e4"]).
	 *
	 * This is used to:
	 * - prevent selecting pieces with no legal moves
	 * - draw dots on legal destinations
	 * - highlight hover squares during click-to-move or drag&drop
	 */
	getLegalDestinationsFrom?: (from: string) => string[];

	/**
	 * Optional synchronous, read-only callback used for capture hinting.
	 * Given an origin square, returns destination squares that are captures
	 * (so the adapter can use a ring marker instead of a dot).
	 *
	 * Note:
	 * - This may include en passant targets.
	 */
	getLegalCaptureDestinationsFrom?: (from: string) => string[];
}

/** Factory interface used by Angular DI to create the active board adapter. */
export interface ChessBoardAdapterFactory {
	create(init: ChessBoardAdapterInit): ChessBoardAdapter;
}

/**
 * DI token used by the UI to get the currently selected board adapter implementation.
 */
export const CHESS_BOARD_ADAPTER_FACTORY = new InjectionToken<ChessBoardAdapterFactory>(
	'CHESS_BOARD_ADAPTER_FACTORY',
);
