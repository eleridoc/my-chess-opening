import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AccountsStateService } from '../../services/accounts-state.service';

/**
 * GettingStartedPageComponent
 *
 * Lightweight onboarding page displayed when no chess accounts are configured.
 * This page must remain simple and action-oriented.
 */
@Component({
	selector: 'app-getting-started-page',
	standalone: true,
	imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule],
	templateUrl: './getting-started-page.component.html',
	styleUrl: './getting-started-page.component.scss',
})
export class GettingStartedPageComponent {
	private readonly accountsState = inject(AccountsStateService);

	/** Re-exposed for templates if we want to show/hide sections later. */
	protected readonly hasAccounts = this.accountsState.hasAccounts;
}
