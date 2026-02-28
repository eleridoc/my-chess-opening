import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AccountsStateService } from '../../services/accounts/accounts-state.service';

/**
 * HomeRedirectPageComponent
 *
 * Entry route component for "/".
 * Redirects users based on whether chess accounts are configured.
 */
@Component({
	selector: 'app-home-redirect-page',
	standalone: true,
	templateUrl: './home-redirect-page.component.html',
	styleUrl: './home-redirect-page.component.scss',
})
export class HomeRedirectPageComponent implements OnInit {
	private readonly router = inject(Router);
	private readonly accountsState = inject(AccountsStateService);

	async ngOnInit(): Promise<void> {
		await this.accountsState.refresh();

		if (!this.accountsState.hasAccounts()) {
			await this.router.navigateByUrl('/getting-started', { replaceUrl: true });
			return;
		}

		await this.router.navigateByUrl('/dashboard', { replaceUrl: true });
	}
}
