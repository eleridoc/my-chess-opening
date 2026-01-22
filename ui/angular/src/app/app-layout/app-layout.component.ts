import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { signal } from '@angular/core';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { ThemeService } from '../services/theme.service';

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
	readonly theme = inject(ThemeService);

	readonly topNav: TopNavItem[] = [
		{ label: 'Dashboard', path: '/dashboard' },
		{ label: 'Games', path: '/games' },
		{ label: 'Explorer', path: '/explorer' },
		{ label: 'TestMat', path: '/test-mat' },

		{ label: 'Import', path: '/import' },
	];

	isImporting = signal(false);

	async onImportNowClick(): Promise<void> {
		if (!window.electron) return;
		if (this.isImporting()) return;

		this.isImporting.set(true);
		try {
			const res = await window.electron.import.runNow({ maxGamesPerAccount: 1 });
			console.log('[UI] Import result:', res);
		} finally {
			this.isImporting.set(false);
		}
	}
}
