import { Routes } from '@angular/router';
import { setupCompletedGuard } from './setup/setup.guard';
import { SetupComponent } from './setup/setup.component';
import { AppLayoutComponent } from './app-layout/app-layout.component';

import { DashboardPageComponent } from './pages/dashboard/dashboard-page.component';
import { GamesPageComponent } from './pages/games/games-page.component';
import { ExplorerPageComponent } from './pages/explorer/explorer-page.component';
import { ImportPageComponent } from './pages/import/import-page.component';
import { LogsPageComponent } from './pages/logs/logs-page.component';
import { SettingsPageComponent } from './pages/settings/settings-page.component';
import { AboutPageComponent } from './pages/about/about-page.component';
import { FaqPageComponent } from './pages/faq/faq-page.component';

export const routes: Routes = [
	{
		path: 'setup',
		component: SetupComponent,
	},
	{
		path: '',
		component: AppLayoutComponent,
		canMatch: [setupCompletedGuard],
		children: [
			{ path: '', pathMatch: 'full', redirectTo: 'dashboard' },

			{ path: 'dashboard', component: DashboardPageComponent },
			{ path: 'games', component: GamesPageComponent },
			{ path: 'explorer', component: ExplorerPageComponent },
			{ path: 'import', component: ImportPageComponent },

			{
				path: 'logs',
				loadComponent: () =>
					import('./pages/logs/logs-page.component').then((m) => m.LogsPageComponent),
			},
			{ path: 'settings', component: SettingsPageComponent },

			{ path: 'about', component: AboutPageComponent },
			{ path: 'faq', component: FaqPageComponent },
		],
	},
	{
		path: '**',
		redirectTo: '',
	},
];
