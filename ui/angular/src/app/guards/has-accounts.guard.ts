import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';

import { AccountsStateService } from '../services/accounts/accounts-state.service';

/**
 * hasAccountsGuard
 *
 * Blocks routes when there is no chess account configured.
 * Relies on AccountsStateService.refresh() which is:
 * - pessimistic in Electron
 * - always true in browser mode
 */
export const hasAccountsGuard: CanMatchFn = async (): Promise<boolean | UrlTree> => {
	const router = inject(Router);
	const accountsState = inject(AccountsStateService);

	await accountsState.refresh();

	if (!accountsState.hasAccounts()) {
		return router.parseUrl('/getting-started');
	}

	return true;
};
