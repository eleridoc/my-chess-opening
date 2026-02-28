import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AccountsStateService } from '../../services/accounts/accounts-state.service';
import { GamesService } from '../../services/games/games.service';

/**
 * GettingStartedPageComponent
 *
 * Onboarding page guiding the user through:
 * 1) Configure at least one account
 * 2) Import games
 * 3) Use Explorer
 *
 * The UI enables steps progressively:
 * - Step 2 requires at least one account.
 * - Step 3 requires at least one imported game.
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
	private readonly games = inject(GamesService);

	/** Global state: at least one account exists. */
	protected readonly hasAccounts = this.accountsState.hasAccounts;

	/** True when at least one game exists in DB (checked lazily). */
	protected readonly hasGames = signal(false);

	/** True once we have performed the "has games?" check. */
	protected readonly gamesChecked = signal(false);

	/** Optional check error (kept silent by default). */
	protected readonly gamesCheckError = signal<string | null>(null);

	/** Step gating. */
	protected readonly canGoToImport = computed(() => this.hasAccounts());
	protected readonly canGoToExplorer = computed(() => this.hasAccounts() && this.hasGames());

	/** Bottom message states. */
	protected readonly shouldShowImportHint = computed(
		() => this.hasAccounts() && this.gamesChecked() && !this.hasGames(),
	);

	protected readonly shouldShowReadyHint = computed(
		() => this.hasAccounts() && this.gamesChecked() && this.hasGames(),
	);

	constructor() {
		// Fire-and-forget bootstrap: the page remains usable even if checks fail.
		void this.bootstrap();
	}

	private async bootstrap(): Promise<void> {
		// Ensure we have the latest accounts state (important when the user navigates here manually).
		try {
			await this.accountsState.refresh();
		} catch {
			// AccountsStateService already stores lastError; we keep this page non-blocking.
		}

		await this.checkHasGames();
	}

	private async checkHasGames(): Promise<void> {
		const isElectronRuntime =
			!!window.electron || navigator.userAgent.toLowerCase().includes('electron');

		// Browser mode: keep dev workflow simple.
		if (!isElectronRuntime) {
			this.hasGames.set(true);
			this.gamesChecked.set(true);
			this.gamesCheckError.set(null);
			return;
		}

		this.gamesCheckError.set(null);

		try {
			// Ultra-light query: we only need the total count, not the full list.
			const res = await this.games.list({ page: 1, pageSize: 1 });
			this.hasGames.set(res.total > 0);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error while checking games.';
			this.hasGames.set(false);
			this.gamesCheckError.set(msg);
		} finally {
			this.gamesChecked.set(true);
		}
	}
}
