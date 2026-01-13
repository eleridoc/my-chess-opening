import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

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
	readonly topNav: TopNavItem[] = [
		{ label: 'Dashboard', path: '/dashboard' },
		{ label: 'Games', path: '/games' },
		{ label: 'Explorer', path: '/explorer' },
		{ label: 'Import', path: '/import' },
	];

	onImportNowClick(): void {
		// Task later: wire IPC call to Electron import
		console.log('[UI] Import now clicked');
	}
}
