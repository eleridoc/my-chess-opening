import { CommonModule } from '@angular/common';
import { Component, ViewChild, inject } from '@angular/core';

import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

import type {
	SharedGameFilter,
	SharedGameFilterContext,
	SharedGameFilterContextConfig,
} from 'my-chess-opening-core/filters';

import { SharedGameFilterComponent } from '../shared-game-filter/shared-game-filter.component';

export interface SharedGameFilterDialogData {
	/** Dialog title displayed in the header. */
	title?: string;

	/** Filter context used for storage and base configuration. */
	context: SharedGameFilterContext;

	/** Optional runtime context overrides layered on top of the context base config. */
	contextConfig?: SharedGameFilterContextConfig | null;

	/** Optional initial value used on first hydration. */
	initialValue?: SharedGameFilter | null;

	/** Disable the embedded filter and actions. */
	disabled?: boolean;

	/** Whether Apply / Reset should persist values in localStorage. */
	persistInStorage?: boolean;

	/** Label for the dialog Apply button. */
	applyButtonLabel?: string;

	/** Label for the dialog Reset button. */
	resetButtonLabel?: string;

	/** Label for the dialog Cancel button. */
	cancelButtonLabel?: string;

	/**
	 * When true, prevents closing the dialog via ESC/backdrop click.
	 * The user can still close it with the Cancel button.
	 */
	disableClose?: boolean;
}

/**
 * Dialog wrapper for the shared game filter component.
 *
 * The embedded filter component remains the single source of truth for:
 * - form state
 * - normalization
 * - Apply / Reset behavior
 *
 * This wrapper only provides dialog presentation and a Cancel action.
 */
@Component({
	selector: 'app-shared-game-filter-dialog',
	standalone: true,
	imports: [CommonModule, MatDialogModule, MatButtonModule, SharedGameFilterComponent],
	templateUrl: './shared-game-filter-dialog.component.html',
	styleUrl: './shared-game-filter-dialog.component.scss',
})
export class SharedGameFilterDialogComponent {
	readonly data = inject<SharedGameFilterDialogData>(MAT_DIALOG_DATA);

	private readonly ref = inject(
		MatDialogRef<SharedGameFilterDialogComponent, SharedGameFilter | undefined>,
	);

	@ViewChild(SharedGameFilterComponent)
	private filterComponent?: SharedGameFilterComponent;

	constructor() {
		this.ref.disableClose = !!this.data.disableClose;
	}

	get title(): string {
		return this.data.title ?? 'Game filters';
	}

	get cancelButtonLabel(): string {
		return this.data.cancelButtonLabel ?? 'Cancel';
	}

	get resetButtonLabel(): string {
		return this.data.resetButtonLabel ?? 'Reset';
	}

	get applyButtonLabel(): string {
		return this.data.applyButtonLabel ?? 'Apply';
	}

	get applyDisabled(): boolean {
		if (this.data.disabled) {
			return true;
		}

		return this.filterComponent?.form.invalid ?? false;
	}

	onCancel(): void {
		this.ref.close(undefined);
	}

	onReset(): void {
		this.filterComponent?.onReset();
	}

	onApply(): void {
		this.filterComponent?.onApply();
	}

	onFilterApplied(filter: SharedGameFilter): void {
		this.ref.close(filter);
	}
}
