import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';
import { SetupService } from './setup.service';

export const setupCompletedGuard: CanMatchFn = async (): Promise<boolean | UrlTree> => {
	const setupService = inject(SetupService);
	const router = inject(Router);

	// In pure browser mode, SetupService already returns "completed"
	const state = await setupService.getState();

	if (!state.hasAccounts) {
		return router.parseUrl('/setup');
	}

	return true;
};
