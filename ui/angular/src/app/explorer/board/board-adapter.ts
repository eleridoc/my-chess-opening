import { InjectionToken } from '@angular/core';

/**
 * A minimal, UI-friendly chessboard API.
 * This is the only contract the Angular UI should depend on.
 *
 * The goal is to keep the underlying board library swappable.
 */
export interface ChessBoardAdapter {
	/**
	 * Updates the displayed position.
	 * The input is a full FEN string (we forward it to the implementation).
	 */
	setFen(fen: string): void;

	/** Enable/disable user move input (DnD/click). */
	setMoveInputEnabled(enabled: boolean): void;

	/** Restrict move input to a color, or null to allow both. */
	setMoveInputAllowedColor(color: BoardOrientation | null): void;

	/** Highlight from/to squares for the last applied move (optional feature). */
	setLastMoveSquares?(lastMove: BoardLastMoveSquares): void;

	/**
	 * Optional hook for board libraries that need an explicit resize/refresh
	 * when their host element size changes.
	 */
	onHostResize?(): void;

	/** Releases DOM/event resources. Must be safe to call multiple times. */
	destroy(): void;
}

export type BoardOrientation = 'white' | 'black';

export type BoardMoveAttempt = {
	from: string; // e.g. "e2"
	to: string; // e.g. "e4"
};

export type BoardLastMoveSquares = { from: string; to: string } | null;

export interface ChessBoardAdapterInit {
	/** Host element where the board must render. */
	element: HTMLElement;

	/** Initial position. */
	fen: string;

	/** Board orientation (default should be white in the UI). */
	orientation?: BoardOrientation;

	/**
	 * Base URL where the board assets (pieces SVG, etc.) are served.
	 * Example: "assets/cm-chessboard/"
	 */
	assetsUrl: string;

	/** Called when the user attempts a move on the board. */
	onMoveAttempt?: (attempt: BoardMoveAttempt) => void;

	/** Called synchronously to accept/reject a move attempt (true = accept). */
	validateMoveAttempt?: (attempt: BoardMoveAttempt) => boolean;
}

export interface ChessBoardAdapterFactory {
	create(init: ChessBoardAdapterInit): ChessBoardAdapter;
}

/**
 * DI token used by the UI to get the currently selected board adapter implementation.
 */
export const CHESS_BOARD_ADAPTER_FACTORY = new InjectionToken<ChessBoardAdapterFactory>(
	'CHESS_BOARD_ADAPTER_FACTORY',
);
