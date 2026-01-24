import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { ExplorerError } from 'my-chess-opening-core/explorer';
import { formatImportError } from '../../import/import-error';
import { NotificationService } from '../../../shared/notifications/notification.service';

@Component({
	selector: 'app-explorer-import',
	standalone: true,
	imports: [
		CommonModule,
		FormsModule,
		MatFormFieldModule,
		MatInputModule,
		MatButtonModule,
		MatIconModule,
		MatTooltipModule,
	],
	templateUrl: './explorer-import.component.html',
	styleUrl: './explorer-import.component.scss',
})
export class ExplorerImportComponent {
	// -------------------------------------------------------------------------
	// Inputs
	// -------------------------------------------------------------------------

	/** Disables all controls (used while the explorer is not ready / busy). */
	@Input() disabled = false;

	/**
	 * Import errors are provided by the parent (Explorer page / facade).
	 * We display them through the global notification system (snackbar).
	 *
	 * Note: We deduplicate errors to avoid spamming notifications when Angular
	 * re-runs bindings without the error actually changing.
	 */
	private lastFenErrorKey: string | null = null;
	private lastPgnErrorKey: string | null = null;

	@Input() set fenError(v: ExplorerError | null) {
		this.notifyIfNewImportError(v, 'FEN');
	}

	@Input() set pgnError(v: ExplorerError | null) {
		this.notifyIfNewImportError(v, 'PGN');
	}

	// -------------------------------------------------------------------------
	// Outputs
	// -------------------------------------------------------------------------

	/** Emitted when the user applies a (trimmed) FEN value. */
	@Output() applyFen = new EventEmitter<string>();

	/** Emitted when the user applies a (trimmed) PGN value. */
	@Output() applyPgn = new EventEmitter<string>();

	/** Ask the parent to clear the current FEN error as soon as the user edits the field. */
	@Output() clearFenError = new EventEmitter<void>();

	/** Ask the parent to clear the current PGN error as soon as the user edits the field. */
	@Output() clearPgnError = new EventEmitter<void>();

	// -------------------------------------------------------------------------
	// Local UI state (ngModel)
	// -------------------------------------------------------------------------

	/** FEN input text (ngModel). */
	fen = '';

	/** PGN textarea text (ngModel). */
	pgn = '';

	constructor(private readonly notify: NotificationService) {}

	// -------------------------------------------------------------------------
	// Actions — FEN
	// -------------------------------------------------------------------------

	onFenChange(): void {
		// Allow a new error snackbar after the user changed the input.
		this.lastFenErrorKey = null;
		this.clearFenError.emit();
	}

	onFenEmpty(): void {
		this.fen = '';
		this.lastFenErrorKey = null;
		this.clearFenError.emit();
	}

	async onFenCopy(): Promise<void> {
		const ok = await this.copyToClipboard(this.fen);
		if (ok) this.notify.success('FEN copied');
		else this.notify.info('Nothing to copy');
	}

	onFenApply(): void {
		const value = this.fen.trim();
		if (!value) {
			this.notify.info('FEN is empty');
			return;
		}
		this.applyFen.emit(value);
	}

	onFenEnter(e: Event): void {
		(e as KeyboardEvent).preventDefault();
		this.onFenApply();
	}

	// -------------------------------------------------------------------------
	// Actions — PGN
	// -------------------------------------------------------------------------

	onPgnChange(): void {
		this.lastPgnErrorKey = null;
		this.clearPgnError.emit();
	}

	onPgnEmpty(): void {
		this.pgn = '';
		this.lastPgnErrorKey = null;
		this.clearPgnError.emit();
	}

	async onPgnCopy(): Promise<void> {
		const ok = await this.copyToClipboard(this.pgn);
		if (ok) this.notify.success('PGN copied');
		else this.notify.info('Nothing to copy');
	}

	onPgnApply(): void {
		const value = this.pgn.trim();
		if (!value) {
			this.notify.info('PGN is empty');
			return;
		}
		this.applyPgn.emit(value);
	}

	// -------------------------------------------------------------------------
	// Error notification helpers
	// -------------------------------------------------------------------------

	private notifyIfNewImportError(v: ExplorerError | null, kind: 'FEN' | 'PGN'): void {
		if (!v) {
			if (kind === 'FEN') this.lastFenErrorKey = null;
			else this.lastPgnErrorKey = null;
			return;
		}

		const msg = formatImportError(v, kind);
		if (!msg) {
			if (kind === 'FEN') this.lastFenErrorKey = null;
			else this.lastPgnErrorKey = null;
			return;
		}

		// Best-effort stable key for dedup. We intentionally do not rely on object identity.
		const key = `${v.code}:${(v as any).reason ?? ''}:${(v as any).preview ?? ''}`;
		const lastKey = kind === 'FEN' ? this.lastFenErrorKey : this.lastPgnErrorKey;
		if (key === lastKey) return;

		if (kind === 'FEN') this.lastFenErrorKey = key;
		else this.lastPgnErrorKey = key;

		this.notify.error(msg);
	}

	// -------------------------------------------------------------------------
	// Clipboard (UI-only)
	// -------------------------------------------------------------------------

	/**
	 * Copies trimmed text to clipboard.
	 * Returns true if something was copied, false otherwise.
	 */
	private async copyToClipboard(text: string): Promise<boolean> {
		const value = (text ?? '').trim();
		if (!value) return false;

		try {
			await navigator.clipboard.writeText(value);
			return true;
		} catch (err) {
			// Fallback best-effort (some Electron/browser contexts may block clipboard API)
			try {
				const ta = document.createElement('textarea');
				ta.value = value;
				ta.style.position = 'fixed';
				ta.style.left = '-9999px';
				document.body.appendChild(ta);
				ta.focus();
				ta.select();
				const ok = document.execCommand('copy');
				document.body.removeChild(ta);
				return ok;
			} catch {
				console.warn('[ExplorerImport] Clipboard copy failed:', err);
				return false;
			}
		}
	}
}
