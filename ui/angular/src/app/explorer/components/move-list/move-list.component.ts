import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';

import type { ExplorerMove } from 'my-chess-opening-core/explorer';

type MoveRow = {
	moveNumber: number;
	white?: ExplorerMove;
	black?: ExplorerMove;
	whitePly?: number;
	blackPly?: number;
};

@Component({
	selector: 'app-move-list',
	standalone: true,
	imports: [CommonModule, MatButtonModule],
	templateUrl: './move-list.component.html',
	styleUrl: './move-list.component.scss',
})
export class MoveListComponent {
	/**
	 * Presentational move list for the Explorer.
	 *
	 * - Displays SAN moves grouped by full-moves (white/black).
	 * - Highlights the current ply.
	 * - Emits "plySelected" when the user clicks a move.
	 */

	private _moves: ExplorerMove[] = [];
	rows: MoveRow[] = [];

	@Input()
	set moves(value: ExplorerMove[]) {
		this._moves = value ?? [];
		this.rows = this.buildRows(this._moves);
	}
	get moves(): ExplorerMove[] {
		return this._moves;
	}

	/** Current ply in the explorer (used to highlight the active move). */
	@Input() currentPly = 0;

	/** Emitted when a move is clicked (ply index starting at 1). */
	@Output() plySelected = new EventEmitter<number>();

	/** Emit the selected ply (UI intent only). */
	selectPly(ply: number): void {
		this.plySelected.emit(ply);
	}

	/**
	 * Convert a flat half-move list into grouped rows:
	 * - row 1: white ply 1, black ply 2
	 * - row 2: white ply 3, black ply 4
	 * etc.
	 */
	private buildRows(moves: ExplorerMove[]): MoveRow[] {
		const out: MoveRow[] = [];
		for (let i = 0; i < moves.length; i += 2) {
			const moveNumber = Math.floor(i / 2) + 1;

			const white = moves[i];
			const black = moves[i + 1];

			out.push({
				moveNumber,
				white,
				black,
				whitePly: i + 1,
				blackPly: black ? i + 2 : undefined,
			});
		}
		return out;
	}
}
