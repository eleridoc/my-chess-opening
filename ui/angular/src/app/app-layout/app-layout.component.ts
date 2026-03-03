import { Component, computed, inject, isDevMode } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AccountsStateService } from '../services/accounts/accounts-state.service';
import { ImportStateService } from '../services/import/import-state.service';
import { ThemeService } from '../services/theme.service';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';

import { GlobalLoaderComponent } from '../shared/loading/global-loader/global-loader.component';
import { ExternalLinkService } from '../shared/system/external-link.service';
import { COMMUNITY_LINKS } from '../shared/system/community-links';

import { APP_VERSION } from '../shared/system/app-version';

type TopNavItem = {
	label: string;
	path: string;
};

@Component({
	selector: 'app-app-layout',
	standalone: true,
	imports: [
		RouterOutlet,
		RouterLink,
		RouterLinkActive,
		MatToolbarModule,
		MatTabsModule,
		MatButtonModule,
		MatIconModule,
		MatMenuModule,
		MatDividerModule,
		GlobalLoaderComponent,
	],
	templateUrl: './app-layout.component.html',
	styleUrl: './app-layout.component.scss',
})
export class AppLayoutComponent {
	private readonly router = inject(Router);

	readonly accountsState = inject(AccountsStateService);
	readonly importState = inject(ImportStateService);
	readonly theme = inject(ThemeService);

	private readonly externalLink = inject(ExternalLinkService);

	readonly appVersion = APP_VERSION;

	/**
	 * Build-time flag.
	 * Evaluated once and used to optionally expose dev-only routes in the top navigation.
	 */
	readonly isDevBuild = isDevMode();

	/**
	 * Whether at least one chess account exists (drives onboarding vs. main app nav).
	 */
	readonly hasAccounts = this.accountsState.hasAccounts;

	private readonly importNavItem: TopNavItem = { label: 'Import', path: '/import' };

	/**
	 * Primary navigation.
	 *
	 * Notes:
	 * - We keep the list small and predictable.
	 * - Dev-only entries are appended only in dev builds.
	 */
	readonly topNav = computed<TopNavItem[]>(() => {
		const devItems: TopNavItem[] = this.isDevBuild
			? [
					{ label: 'QA', path: '/qa' },
					{ label: 'QA-Mat', path: '/qa-mat' },
				]
			: [];

		if (!this.hasAccounts()) {
			return [{ label: 'Getting started', path: '/getting-started' }, ...devItems];
		}

		return [
			{ label: 'Dashboard', path: '/dashboard' },
			{ label: 'Games', path: '/games' },
			{ label: 'Explorer', path: '/explorer' },
			...devItems,
		];
	});

	onDiscordClick(): void {
		// Open in the system browser (never inside Electron).
		this.externalLink.open(COMMUNITY_LINKS.discordInvite);
	}

	/**
	 * Import CTA:
	 * - Redirect to the Import page (where progress is visible).
	 * - Auto-start an "import all accounts" run via query param when not already importing.
	 *
	 * Note:
	 * - Concurrency is enforced in the main process: only one import may run at a time.
	 */
	async onImportNowClick(): Promise<void> {
		// If an import is already running, just bring the user to the import page.
		if (this.importState.isImporting()) {
			await this.router.navigate(['/import']);
			return;
		}

		// Navigate to the import page and let it autostart the batch.
		await this.router.navigate(['/import'], {
			queryParams: { autostart: '1' },
		});
	}
}
