import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { ImportStateService } from '../services/import/import-state.service';

/**
 * Medium blocking strategy:
 * - While an import is running, keep the user on the Import page.
 * - Allow a small set of "informational" pages to remain accessible.
 */
export const importInProgressGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
	const router = inject(Router);
	const importState = inject(ImportStateService);

	// Ensure the event subscription is active (safe to call multiple times).
	importState.ensureInitialized();

	const isImporting = importState.isImporting();

	const allowedDuringImport = ['/import', '/about', '/faq', '/getting-started', '/chess-accounts'];
	const isAllowedDuringImport = allowedDuringImport.some((p) => state.url.startsWith(p));

	if (!isImporting || isAllowedDuringImport) {
		return true;
	}

	return router.parseUrl('/import');
};
