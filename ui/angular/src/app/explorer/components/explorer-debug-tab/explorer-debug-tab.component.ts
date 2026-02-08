import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import type { PromotionPiece } from 'my-chess-opening-core/explorer';
import { ExplorerFacade } from '../../facade/explorer.facade';

/**
 * ExplorerDebugTabComponent
 *
 * Dev-only helpers embedded in the Explorer UI.
 * Keep this component UI-focused: it should only call facade methods.
 */
@Component({
	selector: 'app-explorer-debug-tab',
	standalone: true,
	imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
	templateUrl: './explorer-debug-tab.component.html',
	styleUrl: './explorer-debug-tab.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerDebugTabComponent {
	/**
	 * Default promotion scenario:
	 * White pawn on a7 can promote on a8.
	 */
	private readonly defaultPromotionFen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';

	/**
	 * User-editable FEN used for the promotion scenario.
	 * We intentionally avoid <mat-label> to keep placeholders visible in dense mode.
	 */
	readonly promotionFen = signal<string>(this.defaultPromotionFen);

	constructor(public readonly facade: ExplorerFacade) {}

	resetToInitial(): void {
		this.facade.reset();
	}

	loadDefaultPromotionFen(): void {
		this.facade.reset();
		this.facade.loadFenForCase1(this.defaultPromotionFen);
	}

	applyPromotionFen(): void {
		const fen = (this.promotionFen() ?? '').trim();
		if (!fen) return;

		this.facade.reset();
		this.facade.loadFenForCase1(fen);
	}

	triggerPromotionAttempt(): void {
		// Intentionally missing promotion piece -> should trigger PROMOTION_REQUIRED.
		this.facade.attemptMove({ from: 'a7', to: 'a8' });
	}

	confirmPromotion(piece: PromotionPiece): void {
		this.facade.confirmPromotion(piece);
	}

	prevVariation(): void {
		this.facade.goPrevVariation();
	}

	nextVariation(): void {
		this.facade.goNextVariation();
	}
}
