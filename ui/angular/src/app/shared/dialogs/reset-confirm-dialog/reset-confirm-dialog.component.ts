import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export type ResetConfirmDialogData = {
	/** Dialog title (short, action-oriented). */
	title: string;

	/** Main message describing what will be reset. */
	message: string;

	/** Optional extra context (e.g. GameId) displayed in a <pre> block. */
	details?: string;

	/** Label for the primary action button (confirm). */
	confirmLabel?: string;

	/** Label for the secondary action button (cancel). */
	cancelLabel?: string;
};

@Component({
	selector: 'app-reset-confirm-dialog',
	standalone: true,
	imports: [CommonModule, MatDialogModule, MatButtonModule],
	templateUrl: './reset-confirm-dialog.component.html',
	styleUrl: './reset-confirm-dialog.component.scss',
})
export class ResetConfirmDialogComponent {
	/** Data passed by the caller (ExplorerPage, import actions, etc.). */
	readonly data = inject<ResetConfirmDialogData>(MAT_DIALOG_DATA);

	/**
	 * Dialog reference.
	 * We return a boolean: true = user confirmed, false = user canceled/closed.
	 */
	private readonly ref = inject(MatDialogRef<ResetConfirmDialogComponent, boolean>);

	/** Close the dialog and signal "canceled". */
	onCancel(): void {
		this.ref.close(false);
	}

	/** Close the dialog and signal "confirmed". */
	onConfirm(): void {
		this.ref.close(true);
	}
}
