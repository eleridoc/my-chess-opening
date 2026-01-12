import { Routes } from '@angular/router';
import { setupCompletedGuard } from './setup/setup.guard';
import { SetupComponent } from './setup/setup.component';
import { AppLayoutComponent } from './app-layout/app-layout.component';

export const routes: Routes = [
	{
		path: 'setup',
		component: SetupComponent,
	},
	{
		path: '',
		component: AppLayoutComponent,
		canMatch: [setupCompletedGuard],
	},
	{
		path: '**',
		redirectTo: '',
	},
];
