import { Component, computed, inject, signal, isDevMode } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AccountsStateService } from '../services/accounts-state.service';
import { ThemeService } from '../services/theme.service';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { GlobalLoaderComponent } from '../shared/loading/global-loader/global-loader.component';

import { LoadingService } from '../shared/loading/loading.service';
import { NotificationService } from '../shared/notifications/notification.service';

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
		GlobalLoaderComponent,
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
	readonly loading = inject(LoadingService);
	private readonly notify = inject(NotificationService);

	readonly isDevBuild = isDevMode();
	readonly globalLoaderLabel = computed(() => (this.isImporting() ? 'Importing…' : 'Loading…'));
	readonly hasAccounts = this.accountsState.hasAccounts;
	readonly topNav = computed<TopNavItem[]>(() => {
		if (!this.hasAccounts()) {
			return [
				{ label: 'Getting started', path: '/getting-started' },
				{ label: 'TestMat', path: '/test-mat' },
				...(this.isDevBuild ? [{ label: 'QA', path: '/qa' }] : []),
				{ label: 'Import', path: '/import' },
			];
		}

		return [
			{ label: 'Dashboard', path: '/dashboard' },
			{ label: 'Games', path: '/games' },
			{ label: 'Explorer', path: '/explorer' },
			{ label: 'TestMat', path: '/test-mat' },
			...(this.isDevBuild ? [{ label: 'QA', path: '/qa' }] : []),
			{ label: 'Import', path: '/import' },
		];
	});

	isImporting = signal(false);

	async onImportNowClick(): Promise<void> {
		const electron = window.electron;
		if (!electron) return;

		if (this.isImporting()) return;

		this.isImporting.set(true);

		try {
			await this.loading.runGlobal(
				() => electron.import.runNow({ maxGamesPerAccount: 1 }),
				'Import now',
			);
		} catch (e) {
			this.notify.error('Import failed. Check Logs for details.');
		} finally {
			this.isImporting.set(false);
		}
	}
}
