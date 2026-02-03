import { Routes } from '@angular/router';
import { AppLayoutComponent } from './app-layout/app-layout.component';
import { hasAccountsGuard } from './guards/has-accounts.guard';

import { HomeRedirectPageComponent } from './pages/home-redirect/home-redirect-page.component';
import { DashboardPageComponent } from './pages/dashboard/dashboard-page.component';
import { GamesPageComponent } from './pages/games/games-page.component';
import { ExplorerPageComponent } from './pages/explorer/explorer-page.component';
import { ImportPageComponent } from './pages/import/import-page.component';
import { SettingsPageComponent } from './pages/settings/settings-page.component';
import { AboutPageComponent } from './pages/about/about-page.component';
import { FaqPageComponent } from './pages/faq/faq-page.component';
import { ChessAccountsPageComponent } from './pages/chess-accounts/chess-accounts-page.component';
import { GettingStartedPageComponent } from './pages/getting-started/getting-started-page.component';

export const routes: Routes = [
	{
		path: '',
		component: AppLayoutComponent,
		children: [
			{ path: '', pathMatch: 'full', component: HomeRedirectPageComponent },

			{ path: 'dashboard', component: DashboardPageComponent, canMatch: [hasAccountsGuard] },
			{ path: 'games', component: GamesPageComponent, canMatch: [hasAccountsGuard] },
			{ path: 'explorer', component: ExplorerPageComponent, canMatch: [hasAccountsGuard] },
			{
				path: 'test-mat',
				loadComponent: () =>
					import('./pages/test/test-mat/test-mat-page.component').then(
						(m) => m.TestMatPageComponent,
					),
			},
			{ path: 'import', component: ImportPageComponent },

			{
				path: 'logs',
				loadComponent: () =>
					import('./pages/logs/logs-page.component').then((m) => m.LogsPageComponent),
				canMatch: [hasAccountsGuard],
			},
			{ path: 'settings', component: SettingsPageComponent, canMatch: [hasAccountsGuard] },
			{ path: 'chess-accounts', component: ChessAccountsPageComponent },
			{ path: 'about', component: AboutPageComponent },
			{ path: 'faq', component: FaqPageComponent },
			{ path: 'getting-started', component: GettingStartedPageComponent },
		],
	},
	{
		path: '**',
		redirectTo: '',
	},
];
