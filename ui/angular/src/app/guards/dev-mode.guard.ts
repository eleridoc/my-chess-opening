import { inject, isDevMode } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';

/**
 * devModeGuard
 *
 * Prevents dev-only routes from being accessible in production builds.
 * In production, it redirects to the home route.
 */
export const devModeGuard: CanMatchFn = (): boolean | UrlTree => {
	const router = inject(Router);

	if (!isDevMode()) {
		return router.parseUrl('/');
	}

	return true;
};
