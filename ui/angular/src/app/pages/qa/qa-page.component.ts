import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { ConfirmDialogComponent } from '../../shared/dialogs/confirm-dialog/confirm-dialog.component';
import type { ConfirmDialogData } from '../../shared/dialogs/confirm-dialog/confirm-dialog.component';

import { NotificationService } from '../../shared/notifications/notification.service';
import { LoadingService, type LoadingToken } from '../../shared/loading/loading.service';
import {
	SectionLoaderComponent,
	type SectionLoaderMode,
} from '../../shared/loading/section-loader/section-loader.component';

/**
 * QaPageComponent
 *
 * Dev-only playground to validate:
 * - Confirm dialog variants
 * - Notifications variants
 * - Global and section loaders
 */
@Component({
	selector: 'app-qa-page',
	standalone: true,
	imports: [CommonModule, MatButtonModule, MatDialogModule, SectionLoaderComponent],
	templateUrl: './qa-page.component.html',
	styleUrl: './qa-page.component.scss',
})
export class QaPageComponent implements OnDestroy {
	private readonly dialog = inject(MatDialog);
	private readonly notify = inject(NotificationService);
	private readonly loading = inject(LoadingService);

	readonly sectionLoading = signal(false);
	readonly sectionMode = signal<SectionLoaderMode>('overlay');
	readonly sectionMask = signal(false);
	readonly sectionBlocking = signal(true);

	/** Track global loader tokens created by this QA page. */
	private globalTokens: LoadingToken[] = [];

	private globalTimer: ReturnType<typeof setTimeout> | null = null;
	private sectionTimer: ReturnType<typeof setTimeout> | null = null;

	ngOnDestroy(): void {
		this.stopAll();
	}

	// ---------------------------------------------------------------------
	// Confirm dialog tests
	// ---------------------------------------------------------------------

	openConfirmBasic(): void {
		this.openConfirm({
			title: 'Confirm action',
			message: 'Do you want to continue?',
			confirmLabel: 'Confirm',
			cancelLabel: 'Cancel',
			confirmVariant: 'flat',
			confirmColor: 'primary',
		});
	}

	openConfirmDestructive(): void {
		this.openConfirm({
			title: 'Delete account',
			message: 'This action cannot be undone. Do you want to delete this account?',
			confirmLabel: 'Delete',
			cancelLabel: 'Cancel',
			confirmVariant: 'flat',
			confirmColor: 'warn',
			confirmIcon: 'delete',
			cancelIcon: 'close',
		});
	}

	openConfirmWithDetails(): void {
		this.openConfirm({
			title: 'Import failed',
			message: 'The import failed with a diagnostic payload.',
			details: JSON.stringify(
				{
					code: 'IMPORT_FAILED',
					hint: 'Invalid PGN tags',
					example: { tag: 'Site', value: 'https://...' },
				},
				null,
				2,
			),
			confirmLabel: 'OK',
			cancelLabel: 'Cancel',
			confirmVariant: 'text',
			confirmColor: 'primary',
		});
	}

	openConfirmTextVariant(): void {
		this.openConfirm({
			title: 'Text confirm',
			message: 'This uses the text button variant for the confirm action.',
			confirmLabel: 'Yes',
			cancelLabel: 'No',
			confirmVariant: 'text',
			confirmColor: 'primary',
		});
	}

	openConfirmDisableClose(): void {
		this.openConfirm({
			title: 'Disable close',
			message: 'Backdrop click and ESC are disabled for this dialog.',
			confirmLabel: 'OK',
			cancelLabel: 'Cancel',
			confirmVariant: 'flat',
			confirmColor: 'primary',
			disableClose: true,
		});
	}

	openConfirmWithBlur(): void {
		this.openConfirm(
			{
				title: 'Confirm (blur/radius)',
				message: 'This dialog should use the confirm-specific overlay classes.',
				confirmLabel: 'Confirm',
				cancelLabel: 'Cancel',
				confirmVariant: 'flat',
				confirmColor: 'primary',
			},
			{ withBlur: true },
		);
	}

	private openConfirm(data: ConfirmDialogData, opts?: { withBlur?: boolean }): void {
		const ref = this.dialog.open(ConfirmDialogComponent, {
			width: '520px',
			data,
			// Confirm dialog overlay styling is opt-in.
			panelClass: opts?.withBlur ? 'app-confirm-dialog-panel' : undefined,
			backdropClass: opts?.withBlur ? 'app-confirm-dialog-backdrop' : undefined,
		});

		ref.afterClosed().subscribe((confirmed) => {
			// confirmed can be true/false/undefined (ESC/backdrop).
			if (confirmed === true) this.notify.success('Confirm: confirmed.');
			else if (confirmed === false) this.notify.info('Confirm: cancelled.');
			else this.notify.info('Confirm: closed.');
		});
	}

	// ---------------------------------------------------------------------
	// Notifications tests
	// ---------------------------------------------------------------------

	notifySuccess(): void {
		this.notify.success('Success notification.');
	}

	notifyInfo(): void {
		this.notify.info('Info notification.');
	}

	notifyWarn(): void {
		this.notify.warn('Warning notification.');
	}

	notifyError(): void {
		this.notify.error('Error notification.');
	}

	notifyWithAction(): void {
		this.notify.error('Error with action (Retry).', {
			actionLabel: 'Retry',
			onAction: () => this.notify.info('Action clicked: Retry'),
		});
	}

	notifyLong(): void {
		this.notify.info(
			'Long notification message for layout testing: ' +
				'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
				'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
			{ durationMs: 8000 },
		);
	}

	notifyLastWinsSameTick(): void {
		// Your service is "last wins" within the same tick, this is intentional.
		for (let i = 1; i <= 5; i++) {
			this.notify.info(`Burst (same tick) #${i}`);
		}
	}

	notifyStaggered(): void {
		// Staggered notifications to actually see multiple ones.
		for (let i = 1; i <= 5; i++) {
			setTimeout(() => this.notify.info(`Burst (staggered) #${i}`), i * 250);
		}
	}

	// ---------------------------------------------------------------------
	// Loading tests
	// ---------------------------------------------------------------------

	runGlobalLoader10s(): void {
		this.stopGlobalOnly();

		this.globalTokens.push(this.loading.startGlobal('QA global loader (10s)'));

		this.globalTimer = setTimeout(() => this.stopGlobalOnly(), 10_000);
	}

	runGlobalLoaderStacked10s(): void {
		this.stopGlobalOnly();

		// Start multiple tokens to validate token-based API.
		this.globalTokens.push(this.loading.startGlobal('QA token A'));
		this.globalTokens.push(this.loading.startGlobal('QA token B'));
		this.globalTokens.push(this.loading.startGlobal('QA token C'));

		this.globalTimer = setTimeout(() => this.stopGlobalOnly(), 10_000);
	}

	runSectionLoader10s(mode: SectionLoaderMode, mask: boolean, blocking: boolean): void {
		this.stopSectionOnly();

		this.sectionMode.set(mode);
		this.sectionMask.set(mask);
		this.sectionBlocking.set(blocking);

		this.sectionLoading.set(true);

		this.sectionTimer = setTimeout(() => this.sectionLoading.set(false), 10_000);
	}

	stopAll(): void {
		this.stopGlobalOnly();
		this.stopSectionOnly();
	}

	private stopGlobalOnly(): void {
		if (this.globalTimer) {
			clearTimeout(this.globalTimer);
			this.globalTimer = null;
		}

		// Stop all tokens created by this page.
		for (const t of this.globalTokens) {
			this.loading.stopGlobal(t);
		}
		this.globalTokens = [];
	}

	private stopSectionOnly(): void {
		if (this.sectionTimer) {
			clearTimeout(this.sectionTimer);
			this.sectionTimer = null;
		}

		this.sectionLoading.set(false);
	}
}
