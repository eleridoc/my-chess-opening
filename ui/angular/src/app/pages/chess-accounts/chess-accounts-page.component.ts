import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';

import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { ConfirmDialogComponent } from '../../shared/dialogs/confirm-dialog/confirm-dialog.component';
import type { ConfirmDialogData } from '../../shared/dialogs/confirm-dialog/confirm-dialog.component';
import { NotificationService } from '../../shared/notifications/notification.service';

import { AccountsStateService } from '../../services/accounts-state.service';
import { ChessAccountsService } from '../../services/chess-accounts.service';

import { AccountsTableComponent } from './components/accounts-table/accounts-table.component';
import { AddAccountFormComponent } from './components/add-account-form/add-account-form.component';
import type { ChessAccountRowVm } from './models/chess-account-row.vm';
import type { ExternalSite } from 'my-chess-opening-core';

@Component({
	standalone: true,
	selector: 'app-chess-accounts-page',
	imports: [CommonModule, AddAccountFormComponent, AccountsTableComponent, MatDialogModule],
	templateUrl: './chess-accounts-page.component.html',
	styleUrl: './chess-accounts-page.component.scss',
})
export class ChessAccountsPageComponent implements OnInit {
	private readonly accountsState = inject(AccountsStateService);
	private readonly notify = inject(NotificationService);
	private readonly accounts = inject(ChessAccountsService);
	private readonly dialog = inject(MatDialog);

	@ViewChild(AddAccountFormComponent)
	private addForm?: AddAccountFormComponent;

	/** True while list is being loaded. */
	readonly loading = signal(false);

	/** Optional error message shown by the page (raw, not formatted). */
	readonly error = signal<string | null>(null);

	/** Accounts view-model consumed by the table component. */
	readonly rows = signal<ChessAccountRowVm[]>([]);

	/** Disable destructive / state-changing actions while an IPC call is in flight. */
	readonly actionsDisabled = signal(false);

	ngOnInit(): void {
		void this.refresh();
	}

	/**
	 * Reload accounts from Electron IPC.
	 *
	 * Notes:
	 * - When running in a browser context (ng serve), the service returns NOT_IMPLEMENTED.
	 * - We keep `lastSyncAt` as a raw ISO string (formatting will be done later in UI).
	 */
	async refresh(): Promise<void> {
		this.loading.set(true);
		this.error.set(null);

		try {
			const res = await this.accounts.list();

			if (!res.ok) {
				this.rows.set([]);
				this.error.set(res.error.message);
				this.notify.error(res.error.message);
				return;
			}

			this.rows.set(res.rows.map(this.mapRowToVm));
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error while loading accounts.';
			this.rows.set([]);
			this.error.set(msg);
			this.notify.error(msg);
		} finally {
			this.loading.set(false);
		}
	}

	/**
	 * Create an account (IPC) then refresh the list.
	 */
	async onAddRequested(payload: { site: ExternalSite; username: string }): Promise<void> {
		if (this.actionsDisabled()) return;

		this.actionsDisabled.set(true);

		try {
			const res = await this.accounts.create(payload.site, payload.username);

			if (!res.ok) {
				this.notify.error(res.error.message);
				return;
			}

			this.notify.success('Account added.');

			// Reset the form (best effort) then reload the list from DB.
			this.addForm?.reset();
			await this.refresh();
			await this.accountsState.refresh();
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error while creating account.';
			this.notify.error(msg);
		} finally {
			this.actionsDisabled.set(false);
		}
	}

	/**
	 * Toggle the enabled state of an account.
	 * This is a state-changing operation persisted in DB.
	 */
	async onToggleRequested(row: ChessAccountRowVm): Promise<void> {
		if (this.actionsDisabled()) return;

		this.actionsDisabled.set(true);

		const nextEnabled = !row.isEnabled;

		try {
			const res = await this.accounts.setEnabled(row.id, nextEnabled);

			if (!res.ok) {
				this.notify.error(res.error.message);
				return;
			}

			// Fast UX: update locally. If we ever need to ensure DB sync, we can call refresh().
			this.applyToggleLocal(row.id, nextEnabled);

			this.notify.success(nextEnabled ? 'Account enabled.' : 'Account disabled.');
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error while updating account.';
			this.notify.error(msg);
		} finally {
			this.actionsDisabled.set(false);
		}
	}

	/**
	 * Delete an account (destructive).
	 * Requires user confirmation via ConfirmDialogComponent.
	 */
	async onDeleteRequested(row: ChessAccountRowVm): Promise<void> {
		if (this.actionsDisabled()) return;

		const ref = this.dialog.open(ConfirmDialogComponent, {
			width: '520px',
			data: this.buildDeleteDialogData(row),
		});

		const confirmed = await firstValueFrom(ref.afterClosed());
		if (confirmed !== true) return;

		this.actionsDisabled.set(true);

		try {
			const res = await this.accounts.delete(row.id);

			if (!res.ok) {
				this.notify.error(res.error.message);
				return;
			}

			// Fast UX: remove locally. We can switch to refresh() later if needed.
			this.removeRowLocal(row.id);
			await this.accountsState.refresh();
			this.notify.success('Account deleted.');
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error while deleting account.';
			this.notify.error(msg);
		} finally {
			this.actionsDisabled.set(false);
		}
	}

	private readonly mapRowToVm = (r: {
		id: string;
		site: ChessAccountRowVm['site'];
		username: string;
		isEnabled: boolean;
		lastSyncAt: string | null;
		gamesTotal: number;
	}): ChessAccountRowVm => ({
		id: r.id,
		site: r.site,
		username: r.username,
		isEnabled: r.isEnabled,
		lastSyncAt: r.lastSyncAt,
		gamesTotal: r.gamesTotal,
	});

	private applyToggleLocal(accountId: string, isEnabled: boolean): void {
		this.rows.update((all) => all.map((r) => (r.id === accountId ? { ...r, isEnabled } : r)));
	}

	private removeRowLocal(accountId: string): void {
		this.rows.update((all) => all.filter((r) => r.id !== accountId));
	}

	private buildDeleteDialogData(row: ChessAccountRowVm): ConfirmDialogData {
		return {
			title: 'Delete chess account?',
			message:
				'This will permanently delete the account and all associated data stored in the database ' +
				'(import runs, games, moves, logs, etc.). This action cannot be undone.',
			details: `Site: ${row.site}\nUsername: ${row.username}\nTotal games: ${row.gamesTotal}`,
			confirmLabel: 'Delete',
			cancelLabel: 'Cancel',
			confirmColor: 'warn',
			confirmIcon: 'delete',
			disableClose: true,
		};
	}
}
