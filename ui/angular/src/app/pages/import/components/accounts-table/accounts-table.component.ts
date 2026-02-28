import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { ImportAccountRowVm } from '../../models/import-account-row.vm';
import { IsoDateTimePipe } from '../../../../shared/dates/pipes';

@Component({
	standalone: true,
	selector: 'app-import-accounts-table',
	imports: [
		CommonModule,
		MatTableModule,
		MatButtonModule,
		MatIconModule,
		MatTooltipModule,
		MatProgressBarModule,
		MatProgressSpinnerModule,
		IsoDateTimePipe,
	],
	templateUrl: './accounts-table.component.html',
	styleUrl: './accounts-table.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportAccountsTableComponent {
	/**
	 * Table rows (already merged with live ImportStateService state by the parent page).
	 */
	@Input({ required: true }) rows: ImportAccountRowVm[] = [];

	/**
	 * Column list (switches between BASE_COLUMNS and IMPORT_COLUMNS).
	 */
	@Input({ required: true }) displayedColumns: readonly string[] = [];

	/**
	 * Whether a batch is currently running (used for tooltips + waiting states).
	 */
	@Input() isImporting = false;

	/**
	 * Global action guard (e.g. loading() || isImporting()) from the parent page.
	 */
	@Input() actionsDisabled = false;

	/**
	 * Row-level import action.
	 * The parent page keeps the orchestration (startOne + notifications).
	 */
	@Output() importRequested = new EventEmitter<string>();

	readonly trackById = (_: number, r: ImportAccountRowVm): string => r.id;

	requestImport(accountId: string): void {
		this.importRequested.emit(accountId);
	}
}
