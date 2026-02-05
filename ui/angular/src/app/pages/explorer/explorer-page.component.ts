import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { firstValueFrom } from 'rxjs';

import type { ExplorerMoveAttempt } from 'my-chess-opening-core/explorer';

import { ExplorerFacade } from '../../explorer/facade/explorer.facade';

import { BoardControlsComponent } from '../../explorer/components/board-controls/board-controls.component';
import { ChessBoardComponent } from '../../explorer/components/chess-board/chess-board.component';
import { ExplorerImportComponent } from '../../explorer/components/explorer-import/explorer-import.component';
import { MoveListComponent } from '../../explorer/components/move-list/move-list.component';
import { ExplorerGameInfoPanelComponent } from '../../explorer/components/explorer-game-info-panel/explorer-game-info-panel.component';
import { ExplorerDbService } from '../../services/explorer-db.service';

import { NotificationService } from '../../shared/notifications/notification.service';
import {
	ConfirmDialogComponent,
	type ConfirmDialogData,
} from '../../shared/dialogs/confirm-dialog/confirm-dialog.component';

type ResetReason = 'DB_LOAD' | 'PGN_IMPORT' | 'FEN_IMPORT';

@Component({
	selector: 'app-explorer-page',
	standalone: true,
	imports: [
		CommonModule,
		BoardControlsComponent,
		ChessBoardComponent,
		MoveListComponent,
		ExplorerImportComponent,
		ExplorerGameInfoPanelComponent,
		MatTabsModule,
		MatIconModule,
		MatDialogModule,
	],
	templateUrl: './explorer-page.component.html',
	styleUrl: './explorer-page.component.scss',
})
export class ExplorerPageComponent {
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly destroyRef = inject(DestroyRef);
	private readonly explorerDb = inject(ExplorerDbService);
	private readonly dialog = inject(MatDialog);
	private readonly notify = inject(NotificationService);

	/** Prevent opening multiple confirm dialogs concurrently. */
	private resetConfirmOpen = false;

	/** Avoid noisy logs on repeated router emissions. */
	private lastLoggedDbGameId: string | null = null;

	/** Avoid re-prompting for the same dbGameId on repeated router emissions. */
	private lastPromptedDbGameId: string | null = null;

	/**
	 * DB load guards:
	 * - seq: "last wins" token (increments to cancel older in-flight loads)
	 * - inFlightId: prevent duplicate concurrent loads for the same id
	 * - succeededId: prevent re-loading the same game within the current free session
	 */
	private dbLoadSeq = 0;
	private dbLoadInFlightId: string | null = null;
	private dbLoadSucceededId: string | null = null;

	/**
	 * ExplorerPage is a container page:
	 * - It composes the Explorer UI (board + move list + controls).
	 * - It delegates chess/domain logic to ExplorerFacade (and core).
	 *
	 * UI components should only render facade signals and emit user intentions.
	 */
	constructor(public readonly facade: ExplorerFacade) {
		this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
			const id = this.normalizeDbGameId(params.get('dbGameId'));

			// Store as "pending". It will only be consumed when a DB load succeeds.
			this.facade.setPendingDbGameId(id);

			if (!id) {
				// URL no longer requests a DB game → clear guards & log state.
				this.lastLoggedDbGameId = null;
				this.lastPromptedDbGameId = null;
				this.resetDbLoadGuards();
				return;
			}

			this.logDbRequestOnce(id);

			// Fire-and-forget: internal guards prevent redundant calls and dialogs.
			void this.handleDbGameIdFromUrl(id);
		});
	}

	/** Navigate to the selected ply from the move list. */
	onPlySelected(ply: number): void {
		this.facade.goToPly(ply);
	}

	// --- Controls actions (delegated from BoardControlsComponent) ---

	/**
	 * Hard reset the explorer session (returns to CASE1_FREE).
	 * Also removes dbGameId from the URL to keep routing state consistent.
	 */
	onReset(): void {
		this.facade.reset();
		this.lastPromptedDbGameId = null;
		this.resetDbLoadGuards();

		void this.clearDbGameIdInUrl();
	}

	onStart(): void {
		this.facade.goStart();
	}

	onPrev(): void {
		this.facade.goPrev();
	}

	onNext(): void {
		this.facade.goNext();
	}

	onEnd(): void {
		this.facade.goEnd();
	}

	onPrevVariationAtPly(ply: number): void {
		// Only reposition if we are not already at that ply.
		if (this.facade.ply() !== ply) this.facade.goToPly(ply);
		this.facade.goPrevVariation();
	}

	onNextVariationAtPly(ply: number): void {
		// Only reposition if we are not already at that ply.
		if (this.facade.ply() !== ply) this.facade.goToPly(ply);
		this.facade.goNextVariation();
	}

	onNodeSelected(nodeId: string): void {
		this.facade.goToNode(nodeId);
	}

	onApplyFen(fen: string): void {
		void this.applyFenWithResetGuard(fen);
	}

	onApplyPgn(pgn: string): void {
		void this.applyPgnWithResetGuard(pgn);
	}

	onRotateBoard(): void {
		this.facade.toggleBoardOrientation();
	}

	/**
	 * Keep it synchronous: core + facade are synchronous today.
	 * The board adapter can use this return value to decide whether to "snap back".
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

	private logDbRequestOnce(gameId: string): void {
		if (gameId === this.lastLoggedDbGameId) return;
		this.lastLoggedDbGameId = gameId;

		// Avoid snackbars/overlays here to prevent overlay conflicts while routing.
		console.info(`[Explorer] DB load requested via URL: ${gameId}`);
	}

	private resetDbLoadGuards(): void {
		this.dbLoadInFlightId = null;
		this.dbLoadSucceededId = null;

		// Cancels any in-flight promise ("last wins").
		this.dbLoadSeq++;
	}

	private async clearDbGameIdInUrl(): Promise<void> {
		await this.router.navigate([], {
			relativeTo: this.route,
			queryParams: { dbGameId: null },
			queryParamsHandling: 'merge',
			replaceUrl: true,
		});
	}

	private async openResetConfirmDialog(data: ConfirmDialogData): Promise<boolean> {
		if (this.resetConfirmOpen) return false;
		this.resetConfirmOpen = true;

		// Avoid opening overlays in the middle of a synchronous router emission.
		await Promise.resolve();

		try {
			const ref = this.dialog.open(ConfirmDialogComponent, {
				data,
				width: '520px',
			});

			const result = await firstValueFrom(ref.afterClosed());
			return result === true;
		} finally {
			this.resetConfirmOpen = false;
		}
	}

	private async confirmResetIfNeeded(
		reason: ResetReason,
		meta?: { gameId?: string },
	): Promise<boolean> {
		if (this.facade.mode() === 'CASE1_FREE') return true;

		const message = 'This will reset your current work in Explorer. Do you want to continue?';

		let title = 'Reset required';
		let details: string | undefined;

		switch (reason) {
			case 'DB_LOAD':
				title = 'Load DB game?';
				details = meta?.gameId ? `GameId: ${meta.gameId}` : undefined;
				break;
			case 'PGN_IMPORT':
				title = 'Import PGN?';
				break;
			case 'FEN_IMPORT':
				title = 'Load FEN?';
				break;
		}

		return this.openResetConfirmDialog({
			title,
			message,
			details,
			confirmLabel: 'Reset & Continue',
			cancelLabel: 'Cancel',
			confirmColor: 'warn',
			disableClose: true,
		});
	}

	private async handleDbGameIdFromUrl(gameId: string): Promise<void> {
		// If we are free, load immediately.
		if (this.facade.mode() === 'CASE1_FREE') {
			await this.loadDbGame(gameId);
			return;
		}

		// Prevent re-prompting for the same id on repeated router emissions.
		if (this.lastPromptedDbGameId === gameId) return;
		this.lastPromptedDbGameId = gameId;

		const ok = await this.confirmResetIfNeeded('DB_LOAD', { gameId });

		if (!ok) {
			// User canceled: keep current session, remove URL param to avoid loops.
			this.facade.setPendingDbGameId(null);
			await this.clearDbGameIdInUrl();
			this.lastPromptedDbGameId = null;
			return;
		}

		// Confirmed: reset session but keep dbGameId in URL, then load.
		this.facade.reset();
		this.resetDbLoadGuards();

		// reset() clears pending; re-set it so it can be consumed on success.
		this.facade.setPendingDbGameId(gameId);

		await this.loadDbGame(gameId);
	}

	private async loadDbGame(gameId: string): Promise<void> {
		// Only allowed from CASE1_FREE (core rule).
		if (this.facade.mode() !== 'CASE1_FREE') return;

		// Already loaded in the current free session.
		if (this.dbLoadSucceededId === gameId) return;

		// Same request already running.
		if (this.dbLoadInFlightId === gameId) return;

		this.dbLoadInFlightId = gameId;
		const seq = ++this.dbLoadSeq;

		try {
			const res = await this.explorerDb.getGame(gameId);

			// "Last wins" guard.
			if (seq !== this.dbLoadSeq) return;

			if (!res.ok) {
				if (this.facade.pendingDbGameId() === gameId) this.facade.setPendingDbGameId(null);

				this.notify.error(`Failed to load DB game: ${res.error.message}`, {
					actionLabel: 'Retry',
					onAction: () => void this.loadDbGame(gameId),
				});
				return;
			}

			this.facade.loadDbGameSnapshot(res.snapshot);
			this.dbLoadSucceededId = gameId;
		} catch (e) {
			if (this.facade.pendingDbGameId() === gameId) this.facade.setPendingDbGameId(null);

			this.notify.error('Failed to load DB game.', {
				actionLabel: 'Retry',
				onAction: () => void this.loadDbGame(gameId),
			});
		} finally {
			// Always release the in-flight lock.
			if (this.dbLoadInFlightId === gameId) this.dbLoadInFlightId = null;
		}
	}

	private async applyFenWithResetGuard(fen: string): Promise<void> {
		const ok = await this.confirmResetIfNeeded('FEN_IMPORT');
		if (!ok) return;

		// Import is not DB mode → ensure URL is not in DB mode.
		await this.clearDbGameIdInUrl();
		this.facade.setPendingDbGameId(null);

		this.facade.reset();
		this.resetDbLoadGuards();

		this.facade.loadFen(fen);
	}

	private async applyPgnWithResetGuard(pgn: string): Promise<void> {
		const ok = await this.confirmResetIfNeeded('PGN_IMPORT');
		if (!ok) return;

		// Import is not DB mode → ensure URL is not in DB mode.
		await this.clearDbGameIdInUrl();
		this.facade.setPendingDbGameId(null);

		this.facade.reset();
		this.resetDbLoadGuards();

		this.facade.loadPgn(pgn);
	}
}
