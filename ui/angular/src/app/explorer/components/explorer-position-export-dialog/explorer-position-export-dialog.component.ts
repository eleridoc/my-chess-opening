import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { NotificationService } from '../../../shared/notifications/notification.service';
import { ExplorerPositionExportPngService } from '../../services/explorer-position-export-png.service';

export interface ExplorerPositionExportDialogData {
	/** Optional custom dialog title. */
	title?: string;

	/** Current FEN value. */
	fen?: string | null;

	/** Current PGN value. */
	pgn?: string | null;

	/** Live board host element used for PNG export. */
	boardElement?: HTMLElement | SVGSVGElement | null;

	/** Preferred downloaded PNG file name. */
	pngFileName?: string;

	/** Enable Copy FEN when the action is implemented. */
	canCopyFen?: boolean;

	/** Enable Copy PGN when the action is implemented. */
	canCopyPgn?: boolean;

	/** Enable Export PNG when the action is implemented. */
	canExportPng?: boolean;
}

/**
 * Dialog shell for position export actions.
 *
 * V1.10.6 scope:
 * - display the real current FEN
 * - display the real current PGN
 * - enable FEN / PGN copy actions
 * - enable PNG export from the current rendered board
 */
@Component({
	selector: 'app-explorer-position-export-dialog',
	standalone: true,
	imports: [CommonModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
	templateUrl: './explorer-position-export-dialog.component.html',
	styleUrl: './explorer-position-export-dialog.component.scss',
})
export class ExplorerPositionExportDialogComponent {
	readonly data = inject<ExplorerPositionExportDialogData>(MAT_DIALOG_DATA);

	private readonly ref = inject(MatDialogRef<ExplorerPositionExportDialogComponent, void>);
	private readonly notifications = inject(NotificationService);
	private readonly pngExport = inject(ExplorerPositionExportPngService);

	get title(): string {
		return this.data.title ?? 'Export current position';
	}

	get fenPreview(): string {
		const fen = this.data.fen?.trim();
		return fen && fen.length > 0 ? fen : 'FEN is not available for the current position.';
	}

	get pgnPreview(): string {
		const pgn = this.data.pgn?.trim();
		return pgn && pgn.length > 0 ? pgn : 'PGN is not available for the current position.';
	}

	get canCopyFen(): boolean {
		return (this.data.canCopyFen ?? false) && this.hasCopyableText(this.data.fen);
	}

	get canCopyPgn(): boolean {
		return (this.data.canCopyPgn ?? false) && this.hasCopyableText(this.data.pgn);
	}

	get canExportPng(): boolean {
		return (this.data.canExportPng ?? false) && !!this.data.boardElement;
	}

	onClose(): void {
		this.ref.close();
	}

	async onCopyFen(): Promise<void> {
		const ok = await this.copyText(this.data.fen, 'FEN copied to clipboard.');
		if (!ok) {
			this.notifications.error('Failed to copy FEN.');
		}
	}

	async onCopyPgn(): Promise<void> {
		const ok = await this.copyText(this.data.pgn, 'PGN copied to clipboard.');
		if (!ok) {
			this.notifications.error('Failed to copy PGN.');
		}
	}

	async onExportPng(): Promise<void> {
		if (!this.data.boardElement) {
			this.notifications.error('Failed to export PNG.');
			return;
		}

		try {
			await this.pngExport.exportBoardAsPng({
				element: this.data.boardElement,
				fileName: this.data.pngFileName ?? 'my-chess-opening-position.png',
			});

			this.notifications.success('PNG exported successfully.');
		} catch (error) {
			console.error('[ExplorerPositionExportDialog] Failed to export PNG.', error);
			this.notifications.error('Failed to export PNG.');
		}
	}

	private hasCopyableText(value: string | null | undefined): boolean {
		return (value ?? '').trim().length > 0;
	}

	/**
	 * Copies trimmed text to the clipboard.
	 *
	 * Strategy:
	 * - try the Clipboard API first
	 * - fallback to execCommand for restricted browser/Electron contexts
	 */
	private async copyText(
		text: string | null | undefined,
		successMessage: string,
	): Promise<boolean> {
		const value = (text ?? '').trim();
		if (!value) return false;

		try {
			await navigator.clipboard.writeText(value);
			this.notifications.success(successMessage);
			return true;
		} catch (err) {
			try {
				const ta = document.createElement('textarea');
				ta.value = value;
				ta.style.position = 'fixed';
				ta.style.left = '-9999px';
				ta.style.top = '0';
				document.body.appendChild(ta);
				ta.focus();
				ta.select();
				const ok = document.execCommand('copy');
				document.body.removeChild(ta);

				if (ok) {
					this.notifications.success(successMessage);
					return true;
				}

				return false;
			} catch {
				console.warn('[ExplorerPositionExportDialog] Clipboard copy failed:', err);
				return false;
			}
		}
	}
}
