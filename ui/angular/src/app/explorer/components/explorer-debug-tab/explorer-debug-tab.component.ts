import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	ViewChild,
	computed,
	signal,
} from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import type { PromotionPiece } from 'my-chess-opening-core/explorer';
import { NotificationService } from '../../../shared/notifications/notification.service';
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
	@ViewChild('snapshotArea') private snapshotArea?: ElementRef<HTMLTextAreaElement>;

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

	/**
	 * Pretty JSON snapshot for diagnostics.
	 * This is intended to be copy/pasted into logs or GitHub issues.
	 */
	readonly snapshotText = computed(() => this.safeStringify(this.facade.snapshot()));

	constructor(
		public readonly facade: ExplorerFacade,
		private readonly notifications: NotificationService,
	) {}

	async copySnapshot(): Promise<void> {
		await this.copyText(this.snapshotText(), 'Snapshot copied to clipboard.');
	}

	async copyFen(): Promise<void> {
		await this.copyText(this.facade.fen(), 'FEN copied to clipboard.');
	}

	async copyNormalizedFen(): Promise<void> {
		await this.copyText(this.facade.normalizedFen(), 'Normalized FEN copied to clipboard.');
	}

	async copyPositionKey(): Promise<void> {
		await this.copyText(this.facade.positionKey(), 'Position key copied to clipboard.');
	}

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

	private async copyText(text: string | null | undefined, successMessage: string): Promise<void> {
		const payload = (text ?? '').trim();
		if (!payload) return;

		try {
			await navigator.clipboard.writeText(payload);
			this.notifications.success(successMessage);
			return;
		} catch {
			// Fallback below.
		}

		// Fallback for environments where Clipboard API is restricted.
		const area = this.snapshotArea?.nativeElement;
		if (!area) {
			this.notifications.error('Copy failed (no clipboard access).');
			return;
		}

		try {
			area.focus();
			area.select();
			const ok = document.execCommand('copy');
			if (ok) {
				this.notifications.success(successMessage);
			} else {
				this.notifications.error('Copy failed (execCommand returned false).');
			}
		} catch {
			this.notifications.error('Copy failed (unexpected error).');
		}
	}

	private safeStringify(value: unknown): string {
		return JSON.stringify(value, this.jsonReplacer, 2);
	}

	private jsonReplacer(_key: string, value: unknown): unknown {
		// Make common non-JSON types readable in diagnostics.
		if (value instanceof Map) return Object.fromEntries(value.entries());
		if (value instanceof Set) return Array.from(value.values());

		if (value instanceof Error) {
			return {
				name: value.name,
				message: value.message,
				stack: value.stack,
			};
		}

		return value;
	}
}
