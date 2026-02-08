import {
	ApplicationConfig,
	provideBrowserGlobalErrorListeners,
	importProvidersFrom,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';

import { provideChessBoardAdapter } from './explorer/board/board.providers';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideRouter(routes),
		provideChessBoardAdapter(),
		importProvidersFrom(MatSnackBarModule),
		// Global MatDialog styling hooks (panel + backdrop).
		// Individual dialogs can still override these per `dialog.open(...)` if needed.
		{
			provide: MAT_DIALOG_DEFAULT_OPTIONS,
			useValue: {
				panelClass: 'app-dialog-panel',
				backdropClass: 'app-dialog-backdrop',
			},
		},
	],
};
