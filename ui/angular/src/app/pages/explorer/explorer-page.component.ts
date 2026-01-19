import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ExplorerFacade } from '../../explorer/facade/explorer.facade';
import type { ExplorerMoveAttempt } from 'my-chess-opening-core/explorer';
import { BoardControlsComponent } from '../../explorer/components/board-controls/board-controls.component';
import { ChessBoardComponent } from '../../explorer/components/chess-board/chess-board.component';
import { MoveListComponent } from '../../explorer/components/move-list/move-list.component';
import { ExplorerQaPanelComponent } from '../../explorer/components/explorer-qa-panel/explorer-qa-panel.component';

@Component({
	selector: 'app-explorer-page',
	standalone: true,
	imports: [
		CommonModule,
		BoardControlsComponent,
		ChessBoardComponent,
		MoveListComponent,
		ExplorerQaPanelComponent,
	],
	templateUrl: './explorer-page.component.html',
	styleUrl: './explorer-page.component.scss',
})
export class ExplorerPageComponent {
	/**
	 * ExplorerPage is a "container" page:
	 * - It composes the Explorer UI (board + move list + controls).
	 * - It delegates all chess/domain logic to the ExplorerFacade.
	 *
	 * UI components must only display facade signals and emit user intentions.
	 */
	constructor(public readonly facade: ExplorerFacade) {}

	readonly qaCollapsed = signal<boolean>(false);

	/** Forward a board move attempt to the facade (core validation happens in core). */
	// onMoveAttempt(attempt: ExplorerMoveAttempt): void {
	// 	console.log('onMoveAttempt :', attempt);
	// 	this.facade.attemptMove(attempt);
	// }

	/** Navigate to the selected ply from the move list. */
	onPlySelected(ply: number): void {
		this.facade.goToPly(ply);
	}

	// --- Controls actions (delegated from BoardControlsComponent) ---

	/** Hard reset the explorer session (returns to CASE1 initial state). */
	onReset(): void {
		this.facade.reset();
	}

	/** Jump to the start of the active line. */
	onStart(): void {
		this.facade.goStart();
	}

	/** Go to previous ply. */
	onPrev(): void {
		this.facade.goPrev();
	}

	/** Go to next ply. */
	onNext(): void {
		this.facade.goNext();
	}

	/** Jump to the end of the active line. */
	onEnd(): void {
		this.facade.goEnd();
	}

	// Keep it synchronous: core + facade are synchronous today.
	readonly validateMoveAttempt = (attempt: ExplorerMoveAttempt): boolean => {
		return this.facade.attemptMove(attempt);
	};

	/** Disable board input while a promotion choice is pending. */
	readonly inputEnabled = computed(() => this.facade.promotionPending() === null);

	readonly getLegalDestinationsFrom = (from: string) => this.facade.getLegalDestinationsFrom(from);

	readonly getLegalCaptureDestinationsFrom = (from: string) =>
		this.facade.getLegalCaptureDestinationsFrom(from);
}
