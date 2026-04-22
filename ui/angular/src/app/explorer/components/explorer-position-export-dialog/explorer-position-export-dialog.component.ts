import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ExplorerPositionExportDialogData {
	/** Optional custom dialog title. */
	title?: string;

	/** Current FEN value. */
	fen?: string | null;

	/** Current PGN value. */
	pgn?: string | null;

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
 * V1.10.4 scope:
 * - display the real current FEN
 * - display the real current PGN
 * - keep actions disabled until copy / PNG tasks are implemented
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

	onClose(): void {
		this.ref.close();
	}
}
