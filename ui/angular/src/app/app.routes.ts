import { Routes } from '@angular/router';
import { setupCompletedGuard } from './setup/setup.guard';
import { SetupComponent } from './setup/setup.component';
import { MainShellComponent } from './main-shell/main-shell.component';

export const routes: Routes = [
	{
		path: 'setup',
		component: SetupComponent,
	},
	{
		path: '',
		component: MainShellComponent,
		canMatch: [setupCompletedGuard],
	},
	{
		path: '**',
		redirectTo: '',
	},
];
