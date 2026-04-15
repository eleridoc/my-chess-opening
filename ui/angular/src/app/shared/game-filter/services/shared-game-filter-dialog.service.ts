import { Injectable, inject } from '@angular/core';

import { MatDialog, type MatDialogConfig, type MatDialogRef } from '@angular/material/dialog';

import {
	SharedGameFilterDialogComponent,
	type SharedGameFilterDialogData,
} from '../components/shared-game-filter-dialog/shared-game-filter-dialog.component';

/**
 * Centralized dialog opener for the shared game filter popup mode.
 */
@Injectable({
	providedIn: 'root',
})
export class SharedGameFilterDialogService {
	private readonly dialog = inject(MatDialog);

	openSharedGameFilterDialog(
		data: SharedGameFilterDialogData,
		config?: Omit<MatDialogConfig<SharedGameFilterDialogData>, 'data'>,
	): MatDialogRef<SharedGameFilterDialogComponent, void> {
		return this.dialog.open<SharedGameFilterDialogComponent, SharedGameFilterDialogData, void>(
			SharedGameFilterDialogComponent,
			{
				width: '960px',
				maxWidth: '96vw',
				autoFocus: false,
				restoreFocus: true,
				panelClass: 'app-dialog-panel',
				backdropClass: 'app-dialog-backdrop',
				...config,
				data,
			},
		);
	}
}
