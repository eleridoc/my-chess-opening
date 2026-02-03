import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AccountsStateService } from '../services/accounts-state.service';
import { ThemeService } from '../services/theme.service';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

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
	],
	templateUrl: './app-layout.component.html',
	styleUrl: './app-layout.component.scss',
})
export class AppLayoutComponent {
	readonly accountsState = inject(AccountsStateService);
	readonly theme = inject(ThemeService);

	readonly hasAccounts = this.accountsState.hasAccounts;
	readonly topNav = computed<TopNavItem[]>(() => {
		if (!this.hasAccounts()) {
			return [
				{ label: 'Getting started', path: '/getting-started' },
				{ label: 'TestMat', path: '/test-mat' },
				{ label: 'Import', path: '/import' },
			];
		}

		return [
			{ label: 'Dashboard', path: '/dashboard' },
			{ label: 'Games', path: '/games' },
			{ label: 'Explorer', path: '/explorer' },
			{ label: 'TestMat', path: '/test-mat' },
			{ label: 'Import', path: '/import' },
		];
	});

	isImporting = signal(false);

	async onImportNowClick(): Promise<void> {
		if (!window.electron) return;
		if (this.isImporting()) return;

		this.isImporting.set(true);
		try {
			const res = await window.electron.import.runNow({ maxGamesPerAccount: 1 });
			//console.log('[UI] Import result:', res);
		} finally {
			this.isImporting.set(false);
		}
	}
}
