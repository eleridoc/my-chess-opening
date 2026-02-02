import { Injectable } from '@angular/core';
import type {
	AccountsListResult,
	AccountsSetEnabledResult,
	AccountsDeleteResult,
	AccountsCreateResult,
	ExternalSite,
} from 'my-chess-opening-core';

/**
 * ChessAccountsService
 *
 * Thin Angular wrapper around Electron IPC (`window.electron.accounts`).
 * This service is intentionally minimal and only deals with IPC calls.
 *
 * Notes:
 * - When running Angular in a browser context (ng serve), `window.electron` is not available.
 * - We return a structured NOT_IMPLEMENTED error in that case.
 */
@Injectable({ providedIn: 'root' })
export class ChessAccountsService {
	async list(): Promise<AccountsListResult> {
		if (!window.electron?.accounts?.list) {
			return this.notImplemented();
		}

		return window.electron.accounts.list();
	}

	async setEnabled(accountId: string, isEnabled: boolean): Promise<AccountsSetEnabledResult> {
		if (!window.electron?.accounts?.setEnabled) {
			return this.notImplemented();
		}

		return window.electron.accounts.setEnabled(accountId, isEnabled);
	}

	/**
	 * Delete an account and all its related DB data (destructive).
	 */
	async delete(accountId: string): Promise<AccountsDeleteResult> {
		if (!window.electron?.accounts?.delete) {
			return this.notImplemented();
		}

		return window.electron.accounts.delete(accountId);
	}

	/**
	 * Create a new account configuration.
	 */
	async create(site: ExternalSite, username: string): Promise<AccountsCreateResult> {
		if (!window.electron?.accounts?.create) {
			return this.notImplemented();
		}

		return window.electron.accounts.create(site, username);
	}

	private notImplemented(): {
		ok: false;
		error: { code: 'NOT_IMPLEMENTED'; message: string };
	} {
		return {
			ok: false,
			error: {
				code: 'NOT_IMPLEMENTED',
				message: 'Electron accounts API is not available (not running inside Electron).',
			},
		};
	}
}
