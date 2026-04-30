import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { firstValueFrom } from 'rxjs';

import type { OpeningBookLichessAuthStatus } from 'my-chess-opening-core';

import { OpeningBookService } from '../../services/opening-book/opening-book.service';
import { ConfirmDialogComponent } from '../../shared/dialogs/confirm-dialog/confirm-dialog.component';
import type { ConfirmDialogData } from '../../shared/dialogs/confirm-dialog/confirm-dialog.component';
import { SectionLoaderComponent } from '../../shared/loading/section-loader/section-loader.component';
import { NotificationService } from '../../shared/notifications/notification.service';
import { ExternalLinkService } from '../../shared/system/external-link.service';
import { LICHESS_LINKS } from '../../shared/system/lichess-links';

@Component({
	selector: 'app-settings-page',
	standalone: true,
	imports: [
		CommonModule,
		FormsModule,
		MatButtonModule,
		MatDialogModule,
		MatFormFieldModule,
		MatIconModule,
		MatInputModule,
		SectionLoaderComponent,
	],
	templateUrl: './settings-page.component.html',
	styleUrl: './settings-page.component.scss',
})
export class SettingsPageComponent implements OnInit {
	private readonly openingBook = inject(OpeningBookService);
	private readonly notify = inject(NotificationService);
	private readonly externalLink = inject(ExternalLinkService);
	private readonly dialog = inject(MatDialog);

	readonly loading = signal(false);
	readonly actionInProgress = signal(false);
	readonly status = signal<OpeningBookLichessAuthStatus | null>(null);
	readonly error = signal<string | null>(null);

	tokenInput = '';

	ngOnInit(): void {
		void this.refreshStatus();
	}

	async refreshStatus(): Promise<void> {
		this.loading.set(true);
		this.error.set(null);

		try {
			const result = await this.openingBook.getLichessAuthStatus();

			if (!result.ok) {
				this.error.set(result.error.message);
				return;
			}

			this.status.set(result.status);
		} catch (error) {
			this.error.set(this.getErrorMessage(error, 'Failed to load Lichess settings.'));
		} finally {
			this.loading.set(false);
		}
	}

	openLichessTokenPage(event?: Event): void {
		this.externalLink.open(LICHESS_LINKS.personalAccessTokenCreate, event);
	}

	openLichessTokenManagement(event?: Event): void {
		this.externalLink.open(LICHESS_LINKS.personalAccessTokenManage, event);
	}

	async saveToken(): Promise<void> {
		const token = this.tokenInput.trim();

		if (!token) {
			this.notify.warn('Paste your Lichess token first.');
			return;
		}

		this.actionInProgress.set(true);
		this.error.set(null);

		try {
			const result = await this.openingBook.saveLichessToken({ token });

			if (!result.ok) {
				this.error.set(result.error.message);
				this.notify.error(result.error.message);
				return;
			}

			this.tokenInput = '';
			this.status.set(result.status);
			this.notify.success('Lichess token saved.');
		} catch (error) {
			const message = this.getErrorMessage(error, 'Failed to save Lichess token.');
			this.error.set(message);
			this.notify.error(message);
		} finally {
			this.actionInProgress.set(false);
		}
	}

	async testToken(): Promise<void> {
		this.actionInProgress.set(true);
		this.error.set(null);

		try {
			const result = await this.openingBook.testLichessToken();

			if (!result.ok) {
				this.error.set(result.error.message);
				this.notify.error(result.error.message);
				return;
			}

			this.status.set(result.status);
			this.notify.success('Lichess token is valid.');
		} catch (error) {
			const message = this.getErrorMessage(error, 'Failed to test Lichess token.');
			this.error.set(message);
			this.notify.error(message);
		} finally {
			this.actionInProgress.set(false);
		}
	}

	async clearToken(): Promise<void> {
		const confirmed = await this.confirmTokenRemoval();

		if (!confirmed) {
			return;
		}

		this.actionInProgress.set(true);
		this.error.set(null);

		try {
			const result = await this.openingBook.clearLichessToken();

			if (!result.ok) {
				this.error.set(result.error.message);
				this.notify.error(result.error.message);
				return;
			}

			this.status.set(result.status);
			this.notify.success('Lichess token removed.');
		} catch (error) {
			const message = this.getErrorMessage(error, 'Failed to remove Lichess token.');
			this.error.set(message);
			this.notify.error(message);
		} finally {
			this.actionInProgress.set(false);
		}
	}

	private async confirmTokenRemoval(): Promise<boolean> {
		const data: ConfirmDialogData = {
			title: 'Remove Lichess token?',
			message: 'Opening Book requests will stop working until you configure a new Lichess token.',
			confirmLabel: 'Remove token',
			cancelLabel: 'Cancel',
			confirmColor: 'warn',
			confirmIcon: 'delete',
		};

		const ref = this.dialog.open(ConfirmDialogComponent, {
			width: '520px',
			data,
			panelClass: 'app-confirm-dialog-panel',
			backdropClass: 'app-confirm-dialog-backdrop',
		});

		return (await firstValueFrom(ref.afterClosed())) === true;
	}

	private getErrorMessage(error: unknown, fallback: string): string {
		if (error instanceof Error && error.message.trim().length > 0) {
			return error.message;
		}

		return fallback;
	}
}
