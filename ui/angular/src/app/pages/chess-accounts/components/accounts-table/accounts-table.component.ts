import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { ChessAccountRowVm } from '../../models/chess-account-row.vm';

@Component({
	standalone: true,
	selector: 'app-accounts-table',
	imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule, MatTooltipModule],
	templateUrl: './accounts-table.component.html',
	styleUrl: './accounts-table.component.scss',
})
export class AccountsTableComponent {
	/**
	 * Rows to render in the table.
	 * The parent owns the source of truth (list loading + updates).
	 */
	@Input({ required: true }) rows: ChessAccountRowVm[] = [];

	/** True while the parent is fetching data from IPC. */
	@Input() loading = false;

	/** Optional error message (already user-friendly) displayed by the template. */
	@Input() error: string | null = null;

	/**
	 * Disable row actions while a state-changing IPC call is in flight.
	 * The parent controls this flag to ensure consistent UX.
	 */
	@Input() actionsDisabled = false;

	/** Emitted when the user requests enabling/disabling an account. */
	@Output() toggleRequested = new EventEmitter<ChessAccountRowVm>();

	/** Emitted when the user requests deleting an account. */
	@Output() deleteRequested = new EventEmitter<ChessAccountRowVm>();

	/**
	 * Keep columns explicit to avoid accidental column drift over time.
	 * This must match the template's matColumnDef declarations.
	 */
	readonly displayedColumns: readonly string[] = [
		'site',
		'username',
		'isEnabled',
		'lastSyncAt',
		'gamesTotal',
		'actions',
	];

	trackById(_: number, row: ChessAccountRowVm): string {
		return row.id;
	}

	requestToggle(row: ChessAccountRowVm): void {
		if (this.loading || this.actionsDisabled) return;
		this.toggleRequested.emit(row);
	}

	requestDelete(row: ChessAccountRowVm): void {
		if (this.loading || this.actionsDisabled) return;
		this.deleteRequested.emit(row);
	}
}
