import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import type { ExplorerMoveListRow, ExplorerVariationLine } from 'my-chess-opening-core/explorer';

@Component({
	selector: 'app-move-list',
	standalone: true,
	imports: [CommonModule, MatButtonModule, MatIconModule],
	templateUrl: './move-list.component.html',
	styleUrl: './move-list.component.scss',
})
export class MoveListComponent {
	/**
	 * MoveListComponent (Explorer / UI)
	 *
	 * Single move list that renders:
	 * - Mainline rows (1 row = 1 full move: white + black)
	 * - Variation blocks rendered under the move that has alternative continuations
	 *
	 * Interaction model:
	 * - Selection/navigation is **node-based** (nodeId), not ply-based.
	 * - The component is presentational: it emits intents, the parent decides actions.
	 */

	// ---------------------------------------------------------------------------
	// Inputs
	// ---------------------------------------------------------------------------

	/** Mainline rows (already grouped by full-move number). */
	@Input({ required: true }) rows: ExplorerMoveListRow[] = [];

	/**
	 * Variations indexed by nodeId.
	 *
	 * Key: nodeId representing the position AFTER the move token.
	 * Value: variation lines that start from alternative children of that node.
	 */
	@Input() variationsByNodeId: Record<string, ExplorerVariationLine[]> = {};

	/** Currently selected node id (for highlighting). */
	@Input() currentNodeId = '';

	// ---------------------------------------------------------------------------
	// Outputs (UI intents)
	// ---------------------------------------------------------------------------

	/** Emitted when a move token is clicked (nodeId). */
	@Output() nodeSelected = new EventEmitter<string>();

	/**
	 * Optional variation cycling intents (kept for future use / debugging).
	 * Note: current UI mostly uses direct clicking inside variation lines.
	 */
	@Output() prevVariationAtNode = new EventEmitter<string>();
	@Output() nextVariationAtNode = new EventEmitter<string>();

	// ---------------------------------------------------------------------------
	// UI actions
	// ---------------------------------------------------------------------------

	/** UI intent: navigate to a specific node. */
	selectNode(nodeId: string): void {
		this.nodeSelected.emit(nodeId);
	}

	/** UI intent: cycle to previous variation at a given node. */
	cyclePrevVariation(nodeId: string): void {
		this.prevVariationAtNode.emit(nodeId);
	}

	/** UI intent: cycle to next variation at a given node. */
	cycleNextVariation(nodeId: string): void {
		this.nextVariationAtNode.emit(nodeId);
	}

	// ---------------------------------------------------------------------------
	// Rendering helpers
	// ---------------------------------------------------------------------------

	/**
	 * When a white move has variations AND the currently active continuation
	 * after that white move is NOT the mainline continuation, we render the black
	 * mainline move as a split continuation:
	 *
	 * - mainline row shows: "white | …"
	 * - variations are displayed under the row
	 * - then we render: "… | blackMainlineMove"
	 */
	shouldSplitBlack(row: ExplorerMoveListRow): boolean {
		const w = row.white;
		return Boolean(w && row.black && w.variationCount > 0 && w.activeChildIsMainline === false);
	}

	/**
	 * Used to decide whether a variation block should be anchored as full-width
	 * (under white) or right-side (under black).
	 *
	 * Convention:
	 * - ply 1 = white move (odd)
	 * - ply 2 = black move (even)
	 */
	variationStartsWithWhite(lines: ExplorerVariationLine[]): boolean {
		const first = lines?.[0]?.tokens?.[0];
		if (!first) return true;
		return first.ply % 2 === 1;
	}

	/** Returns variation lines attached to a given node. */
	getVariations(nodeId: string): ExplorerVariationLine[] {
		return this.variationsByNodeId[nodeId] ?? [];
	}
}
