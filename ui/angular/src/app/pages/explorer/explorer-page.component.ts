import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';

import type { ExplorerMoveAttempt } from 'my-chess-opening-core/explorer';

import { ExplorerFacade } from '../../explorer/facade/explorer.facade';
import { BoardControlsComponent } from '../../explorer/components/board-controls/board-controls.component';
import { ChessBoardComponent } from '../../explorer/components/chess-board/chess-board.component';
import { ExplorerImportComponent } from '../../explorer/components/explorer-import/explorer-import.component';
import { ExplorerQaPanelComponent } from '../../explorer/components/explorer-qa-panel/explorer-qa-panel.component';
import { MoveListComponent } from '../../explorer/components/move-list/move-list.component';

@Component({
	selector: 'app-explorer-page',
	standalone: true,
	imports: [
		CommonModule,
		BoardControlsComponent,
		ChessBoardComponent,
		MoveListComponent,
		ExplorerImportComponent,
		ExplorerQaPanelComponent,
		MatTabsModule,
		MatIconModule,
	],
	templateUrl: './explorer-page.component.html',
	styleUrl: './explorer-page.component.scss',
})
export class ExplorerPageComponent {
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly destroyRef = inject(DestroyRef);

	private lastLoggedDbGameId: string | null = null;

	/**
	 * ExplorerPage is a container page:
	 * - It composes the Explorer UI (board + move list + controls).
	 * - It delegates all chess/domain logic to ExplorerFacade (and core).
	 *
	 * UI components must only render facade signals and emit user intentions.
	 */
	constructor(public readonly facade: ExplorerFacade) {
		this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
			const raw = params.get('dbGameId');
			const id = this.normalizeDbGameId(raw);

			// Store as "pending" (will be consumed by IPC wiring in V1.5.0).
			this.facade.setPendingDbGameId(id);

			// Avoid noisy logs on every router emission.
			if (!id) {
				this.lastLoggedDbGameId = null;
				return;
			}

			if (id !== this.lastLoggedDbGameId) {
				this.lastLoggedDbGameId = id;

				// NOTE:
				// We intentionally avoid triggering a snackbar here to prevent UI-side
				// overlay issues while routing. The QA panel already exposes pendingDbGameId.
				// IPC wiring will be implemented in V1.5.0.
				console.info(`[Explorer] DB load requested via URL: ${id}`);
			}
		});
	}

	readonly qaCollapsed = signal<boolean>(false);

	/** Navigate to the selected ply from the move list. */
	onPlySelected(ply: number): void {
		this.facade.goToPly(ply);
	}

	// --- Controls actions (delegated from BoardControlsComponent) ---

	/**
	 * Hard reset the explorer session (returns to CASE1 initial state).
	 *
	 * We also remove dbGameId from the URL to keep route state consistent with CASE1_FREE.
	 */
	onReset(): void {
		this.facade.reset();

		void this.router.navigate([], {
			relativeTo: this.route,
			queryParams: { dbGameId: null }, // remove
			queryParamsHandling: 'merge', // keep other params if any
			replaceUrl: true, // avoid polluting history
		});
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

	onPrevVariationAtPly(ply: number): void {
		// Only reposition if we are not already at that ply.
		if (this.facade.ply() !== ply) {
			this.facade.goToPly(ply);
		}
		this.facade.goPrevVariation();
	}

	onNextVariationAtPly(ply: number): void {
		// Only reposition if we are not already at that ply.
		if (this.facade.ply() !== ply) {
			this.facade.goToPly(ply);
		}
		this.facade.goNextVariation();
	}

	onNodeSelected(nodeId: string): void {
		this.facade.goToNode(nodeId);
	}

	onApplyFen(fen: string): void {
		this.facade.loadFen(fen);
	}

	onApplyPgn(pgn: string): void {
		this.facade.loadPgn(pgn);
	}

	/**
	 * Keep it synchronous: core + facade are synchronous today.
	 * The board adapter can use this to decide whether to "snap back" on failure.
	 */
	readonly validateMoveAttempt = (attempt: ExplorerMoveAttempt): boolean => {
		return this.facade.attemptMove(attempt);
	};

	/** Disable board input while a promotion choice is pending. */
	readonly inputEnabled = computed(() => this.facade.promotionPending() === null);

	readonly getLegalDestinationsFrom = (from: string) => this.facade.getLegalDestinationsFrom(from);

	readonly getLegalCaptureDestinationsFrom = (from: string) =>
		this.facade.getLegalCaptureDestinationsFrom(from);

	private normalizeDbGameId(raw: string | null): string | null {
		const id = (raw ?? '').trim();
		return id.length ? id : null;
	}
}
