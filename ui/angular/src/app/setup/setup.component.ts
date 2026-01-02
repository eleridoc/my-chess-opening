import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SetupService } from './setup.service';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
	selector: 'app-setup',
	standalone: true,
	imports: [
		CommonModule,
		ReactiveFormsModule,
		MatCardModule,
		MatFormFieldModule,
		MatInputModule,
		MatButtonModule,
	],
	templateUrl: './setup.component.html',
	styleUrl: './setup.component.scss',
})
export class SetupComponent {
	form: FormGroup;
	error: string | null = null;
	isSubmitting = false;

	constructor(
		private readonly fb: FormBuilder,
		private readonly setupService: SetupService,
		private readonly router: Router,
	) {
		this.form = this.fb.group({
			lichessUsername: [''],
			chesscomUsername: [''],
		});
	}

	async onSubmit(): Promise<void> {
		this.error = null;

		const { lichessUsername, chesscomUsername } = this.form.value;

		const lichess = (lichessUsername ?? '').trim();
		const chesscom = (chesscomUsername ?? '').trim();

		if (!lichess && !chesscom) {
			this.error = 'Please provide at least one account (Lichess or Chess.com).';
			return;
		}

		this.isSubmitting = true;

		try {
			await this.setupService.saveAccounts({
				lichessUsername: lichess || null,
				chesscomUsername: chesscom || null,
			});

			// After successful setup, go to main shell
			await this.router.navigateByUrl('/');
		} catch (err: any) {
			console.error('[SetupComponent] saveAccounts failed:', err);
			this.error = err?.message ?? 'An unexpected error occurred.';
		} finally {
			this.isSubmitting = false;
		}
	}
}
