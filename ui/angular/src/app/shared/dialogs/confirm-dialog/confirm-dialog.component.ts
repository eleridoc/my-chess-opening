import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export type ConfirmDialogButtonVariant = 'flat' | 'text';

export type ConfirmDialogData = {
	/** Dialog title (short, action-oriented). */
	title: string;

	/** Main message describing the action and its impact. */
	message: string;

	/** Optional extra context (e.g. identifiers) displayed in a <pre> block. */
	details?: string;

	/** Label for the primary action button (confirm). */
	confirmLabel?: string;

	/** Label for the secondary action button (cancel). */
	cancelLabel?: string;

	/**
	 * Color of the confirm button.
	 * Use "warn" for destructive actions.
	 */
	confirmColor?: 'primary' | 'accent' | 'warn';

	/**
	 * Visual style of the confirm button.
	 * - "flat": mat-flat-button (default)
	 * - "text": mat-button
	 */
	confirmVariant?: ConfirmDialogButtonVariant;

	/** Optional Material icon name (e.g. "delete") for the confirm button. */
	confirmIcon?: string;

	/** Optional Material icon name (e.g. "close") for the cancel button. */
	cancelIcon?: string;

	/**
	 * When true, prevents closing the dialog via ESC/backdrop click.
	 * (Caller can still close via Cancel/Confirm buttons.)
	 */
	disableClose?: boolean;
};

@Component({
	selector: 'app-confirm-dialog',
	standalone: true,
	imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
	templateUrl: './confirm-dialog.component.html',
	styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
	/** Data passed by the caller. */
	readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);

	/**
	 * Dialog reference.
	 * We return a boolean: true = user confirmed, false = user canceled/closed.
	 */
	private readonly ref = inject(MatDialogRef<ConfirmDialogComponent, boolean>);

	constructor() {
		// Apply runtime close behavior to keep the dialog configuration centralized in the data object.
		this.ref.disableClose = !!this.data.disableClose;
	}

	/** Close the dialog and signal "canceled". */
	onCancel(): void {
		this.ref.close(false);
	}

	/** Close the dialog and signal "confirmed". */
	onConfirm(): void {
		this.ref.close(true);
	}

	get confirmColor(): 'primary' | 'accent' | 'warn' {
		return this.data.confirmColor ?? 'warn';
	}

	get confirmVariant(): ConfirmDialogButtonVariant {
		return this.data.confirmVariant ?? 'flat';
	}

	get cancelLabel(): string {
		return this.data.cancelLabel ?? 'Cancel';
	}

	get confirmLabel(): string {
		return this.data.confirmLabel ?? 'Confirm';
	}
}
