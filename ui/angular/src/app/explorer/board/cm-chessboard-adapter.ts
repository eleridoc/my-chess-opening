import { Chessboard, COLOR, INPUT_EVENT_TYPE } from 'cm-chessboard/src/Chessboard.js';
import { Markers } from 'cm-chessboard/src/extensions/markers/Markers.js';

import type {
	BoardOrientation,
	BoardMoveAttempt,
	ChessBoardAdapter,
	ChessBoardAdapterInit,
	BoardLastMoveSquares,
} from './board-adapter';

const LAST_MOVE_FROM = { class: 'mco-last-move-from', slice: 'markerSquare' };
const LAST_MOVE_TO = { class: 'mco-last-move-to', slice: 'markerSquare' };

/**
 * cm-chessboard implementation of our ChessBoardAdapter contract.
 *
 * V1.2.3:
 * - Enable move input and translate it into BoardMoveAttempt events.
 * - Run in "authoritative core" mode: the board does NOT apply the move by itself.
 */
export class CmChessboardAdapter implements ChessBoardAdapter {
	private board: any | null;
	private lastFen: string;
	private destroyed = false;
	private moveInputEnabled = false;
	private moveInputAllowedColor: BoardOrientation | null = null;

	private lastMoveSquares: BoardLastMoveSquares = null;

	private readonly onMoveAttempt?: (attempt: BoardMoveAttempt) => void;
	private readonly validateMoveAttempt?: (attempt: BoardMoveAttempt) => boolean;

	constructor(private readonly init: ChessBoardAdapterInit) {
		const orientation: BoardOrientation = init.orientation ?? 'white';
		this.lastFen = init.fen;
		this.onMoveAttempt = init.onMoveAttempt;
		this.validateMoveAttempt = init.validateMoveAttempt;

		this.board = new Chessboard(init.element, {
			assetsUrl: init.assetsUrl,
			position: init.fen,
			orientation: orientation === 'black' ? COLOR.black : COLOR.white,
			responsive: true,
			extensions: [{ class: Markers }],
		});
	}

	setFen(fen: string): void {
		if (this.destroyed || !this.board) return;
		if (!fen || fen === this.lastFen) return;

		this.lastFen = fen;
		void this.board.setPosition(fen, false);

		// Re-apply after position updates (safe even if no markers support).
		this.applyLastMoveMarkers();
	}

	setMoveInputEnabled(enabled: boolean): void {
		if (this.destroyed || !this.board) return;
		if (enabled === this.moveInputEnabled) return;

		this.moveInputEnabled = enabled;
		this.applyMoveInputState();
	}

	setMoveInputAllowedColor(color: BoardOrientation | null): void {
		if (this.destroyed || !this.board) return;
		if (color === this.moveInputAllowedColor) return;

		this.moveInputAllowedColor = color;
		this.applyMoveInputState();
	}

	setLastMoveSquares(lastMove: BoardLastMoveSquares): void {
		this.lastMoveSquares = lastMove;
		this.applyLastMoveMarkers();
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;

		try {
			this.board?.destroy();
		} finally {
			this.board = null;
		}
	}

	onHostResize(): void {
		// cm-chessboard handles resizing automatically when `responsive: true`.
		// This hook exists for future board implementations.
	}

	/**
	 * Translate cm-chessboard input events into a simple {from,to} attempt.
	 * We return false on validateMoveInput to keep the board "authoritative":
	 * the core decides, and the UI updates only via FEN changes.
	 */
	private readonly handleMoveInput = (event: any): boolean | void => {
		if (this.destroyed) return;

		switch (event.type) {
			case INPUT_EVENT_TYPE.moveInputStarted:
				// Allow starting a move from any square for now.
				// The core will reject illegal attempts anyway.
				return true;

			case INPUT_EVENT_TYPE.validateMoveInput: {
				const from = event.squareFrom as string | undefined;
				const to = event.squareTo as string | undefined;

				if (!from || !to) return false;

				const attempt: BoardMoveAttempt = { from, to };

				// Preferred path (V1.2.4.1): synchronous validation -> no flicker on legal moves.
				if (this.validateMoveAttempt) {
					return this.validateMoveAttempt(attempt);
				}

				// Fallback path (old V1.2.3): emit and let the core update via FEN (will flicker).
				this.onMoveAttempt?.(attempt);
				return false;
			}
			case INPUT_EVENT_TYPE.moveInputFinished:
				// If autoMarkers cleared everything at the end of the gesture, re-apply ours.
				requestAnimationFrame(() => this.applyLastMoveMarkers());
				return;

			default:
				return;
		}
	};

	private applyMoveInputState(): void {
		if (this.destroyed || !this.board) return;

		this.board.disableMoveInput();

		if (!this.moveInputEnabled) return;

		const cmColor =
			this.moveInputAllowedColor === 'white'
				? COLOR.white
				: this.moveInputAllowedColor === 'black'
					? COLOR.black
					: undefined;

		this.board.enableMoveInput(this.handleMoveInput, cmColor);
	}

	private applyLastMoveMarkers(): void {
		if (this.destroyed || !this.board) return;

		// Markers extension adds these methods. Guard them to keep adapter resilient.
		if (
			typeof this.board.addMarker !== 'function' ||
			typeof this.board.removeMarkers !== 'function'
		)
			return;

		// Remove previous last-move markers (ours only).
		this.board.removeMarkers(LAST_MOVE_FROM);
		this.board.removeMarkers(LAST_MOVE_TO);

		if (!this.lastMoveSquares) return;

		this.board.addMarker(LAST_MOVE_FROM, this.lastMoveSquares.from);
		this.board.addMarker(LAST_MOVE_TO, this.lastMoveSquares.to);
	}
}
