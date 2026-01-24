import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

import type { NotificationData, NotificationKind } from './notification.model';

@Component({
	selector: 'app-snackbar',
	standalone: true,
	imports: [CommonModule, MatIconModule, MatButtonModule],
	templateUrl: './app-snackbar.component.html',
	styleUrl: './app-snackbar.component.scss',
})
export class AppSnackbarComponent {
	constructor(
		@Inject(MAT_SNACK_BAR_DATA) public readonly data: NotificationData,
		private readonly ref: MatSnackBarRef<AppSnackbarComponent>,
	) {}

	/**
	 * Maps a notification kind to a Material icon name.
	 * Keep this list minimal and consistent across the app.
	 */
	iconFor(kind: NotificationKind): string {
		switch (kind) {
			case 'success':
				return 'check_circle';
			case 'warn':
				return 'warning';
			case 'error':
				return 'error';
			case 'info':
			default:
				return 'info';
		}
	}

	/**
	 * Dismisses the snackbar while marking it as "action clicked".
	 * The NotificationService can subscribe to `onAction()` to react.
	 */
	onActionClick(): void {
		this.ref.dismissWithAction();
	}

	/** Dismisses the snackbar without triggering the action callback. */
	onCloseClick(): void {
		this.ref.dismiss();
	}
}
