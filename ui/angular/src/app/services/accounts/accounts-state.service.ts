import { Injectable, signal } from '@angular/core';

import { ChessAccountsService } from './chess-accounts.service';

/**
 * AccountsStateService
 *
 * Global state: "does the user have at least one chess account configured?"
 *
 * Key rule:
 * - refresh() must be de-duplicated: if a refresh is already running, callers must await the same promise.
 */
@Injectable({ providedIn: 'root' })
export class AccountsStateService {
	/** True when at least one account exists. Default false (pessimistic). */
	readonly hasAccounts = signal(false);

	/** True while the state is being refreshed. */
	readonly loading = signal(false);

	/** Optional debug info to understand why state is false. */
	readonly lastError = signal<string | null>(null);

	private inFlight: Promise<void> | null = null;

	constructor(private readonly chessAccounts: ChessAccountsService) {}

	refresh(): Promise<void> {
		// If a refresh is already running, await the same work.
		if (this.inFlight) return this.inFlight;

		this.inFlight = this.doRefresh().finally(() => {
			this.inFlight = null;
		});

		return this.inFlight;
	}

	private async doRefresh(): Promise<void> {
		const isElectronRuntime =
			!!window.electron || navigator.userAgent.toLowerCase().includes('electron');

		// Browser mode: keep dev workflow simple.
		if (!isElectronRuntime) {
			this.hasAccounts.set(true);
			this.lastError.set(null);
			return;
		}

		this.loading.set(true);
		this.lastError.set(null);

		try {
			const res = await this.chessAccounts.list();

			// Debug (temporary): remove after validation
			// console.log('[AccountsStateService] list response:', res);

			if (!res.ok) {
				// In Electron runtime, if IPC/db fails, treat as "no accounts" (gated UX).
				this.hasAccounts.set(false);
				this.lastError.set(res.error.message);
				return;
			}

			this.hasAccounts.set(res.rows.length > 0);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error while reading accounts.';
			this.hasAccounts.set(false);
			this.lastError.set(msg);
		} finally {
			this.loading.set(false);
		}
	}
}
