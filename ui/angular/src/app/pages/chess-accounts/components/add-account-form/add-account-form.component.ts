import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import type { ExternalSite } from 'my-chess-opening-core';

/**
 * AddAccountFormComponent
 *
 * UI-only form for creating a chess account configuration.
 * V1.5.9.0: form + validation only (no IPC call here).
 *
 * Important:
 * - Keep core imports as type-only in Angular.
 *   The core package contains Node-only code (e.g. node:crypto), which must not be bundled in the UI.
 */
@Component({
	standalone: true,
	selector: 'app-add-account-form',
	imports: [
		CommonModule,
		ReactiveFormsModule,
		MatFormFieldModule,
		MatInputModule,
		MatSelectModule,
		MatButtonModule,
	],
	templateUrl: './add-account-form.component.html',
	styleUrl: './add-account-form.component.scss',
})
export class AddAccountFormComponent {
	/** Disable the entire form while a parent action is in flight. */
	@Input() disabled = false;

	/**
	 * Emitted when the user submits the form.
	 * V1.5.9.0: the parent shows a "not implemented" notification.
	 * V1.5.9.1+: this will be wired to IPC.
	 */
	@Output() addRequested = new EventEmitter<{ site: ExternalSite; username: string }>();

	readonly form = new FormGroup({
		site: new FormControl<ExternalSite | null>(null, {
			nonNullable: false,
			validators: [Validators.required],
		}),
		username: new FormControl<string>('', {
			nonNullable: true,
			validators: [Validators.required, Validators.maxLength(40)],
		}),
	});

	/**
	 * We cannot reference the core enum values at runtime in Angular
	 * (would pull Node-only modules into the browser bundle).
	 * So we keep the values as string literals and cast them to ExternalSite.
	 */
	private readonly SITE_LICHESS = 'LICHESS' as unknown as ExternalSite;
	private readonly SITE_CHESSCOM = 'CHESSCOM' as unknown as ExternalSite;

	readonly sites: ReadonlyArray<{ value: ExternalSite; label: string }> = [
		{ value: this.SITE_LICHESS, label: 'Lichess' },
		{ value: this.SITE_CHESSCOM, label: 'Chess.com' },
	];

	/** Trimmed username used for validation and submission. */
	readonly usernameTrimmed = signal('');

	constructor() {
		this.form.controls.username.valueChanges.subscribe((v) => {
			this.usernameTrimmed.set((v ?? '').trim());
		});
	}

	get canSubmit(): boolean {
		if (this.disabled) return false;
		if (this.form.controls.site.invalid) return false;
		if (this.usernameTrimmed().length === 0) return false;
		return true;
	}

	onSubmit(): void {
		const site = this.form.controls.site.value;
		const username = this.usernameTrimmed();

		if (!site || username.length === 0) return;

		this.addRequested.emit({ site, username });
	}

	reset(): void {
		this.form.reset();
		this.usernameTrimmed.set('');
	}
}
