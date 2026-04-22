import { Injectable, inject } from '@angular/core';

import { MatDialog, type MatDialogConfig, type MatDialogRef } from '@angular/material/dialog';

import {
	ExplorerPositionExportDialogComponent,
	type ExplorerPositionExportDialogData,
} from '../components/explorer-position-export-dialog/explorer-position-export-dialog.component';

/**
 * Centralized dialog opener for the Explorer position export popup.
 */
@Injectable({
	providedIn: 'root',
})
export class ExplorerPositionExportDialogService {
	private readonly dialog = inject(MatDialog);

	openExplorerPositionExportDialog(
		data: ExplorerPositionExportDialogData = {},
		config?: Omit<MatDialogConfig<ExplorerPositionExportDialogData>, 'data'>,
	): MatDialogRef<ExplorerPositionExportDialogComponent, void> {
		return this.dialog.open<
			ExplorerPositionExportDialogComponent,
			ExplorerPositionExportDialogData,
			void
		>(ExplorerPositionExportDialogComponent, {
			width: '1080px',
			maxWidth: '98vw',
			autoFocus: false,
			restoreFocus: true,
			panelClass: 'app-dialog-panel',
			backdropClass: 'app-dialog-backdrop',
			...config,
			data,
		});
	}
}
