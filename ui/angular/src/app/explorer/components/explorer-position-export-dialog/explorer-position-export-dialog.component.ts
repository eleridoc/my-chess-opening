import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ExplorerPositionExportDialogData {
	/** Optional custom dialog title. */
	title?: string;

	/** Optional future FEN value. */
	fen?: string | null;

	/** Optional future PGN value. */
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
 * V1.10.2 scope:
 * - provide the dedicated popup UI
 * - expose the future FEN / PGN / PNG sections
 * - keep actions disabled until the next V1.10 tasks wire the real logic
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
		return fen && fen.length > 0 ? fen : 'Current FEN will be wired in V1.10.4.';
	}

	get pgnPreview(): string {
		const pgn = this.data.pgn?.trim();
		return pgn && pgn.length > 0 ? pgn : 'Current PGN will be wired in V1.10.4.';
	}

	onClose(): void {
		this.ref.close();
	}
}
