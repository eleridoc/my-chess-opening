import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AccountsStateService } from './services/accounts-state.service';
import { ImportStateService } from './services/import/import-state.service';

@Component({
	selector: 'app-root',
	imports: [RouterOutlet],
	templateUrl: './app.html',
	styleUrl: './app.scss',
})
export class App implements OnInit {
	private readonly accountsState = inject(AccountsStateService);
	private readonly importState = inject(ImportStateService);

	/**
	 * App bootstrap:
	 * - Refresh account presence state early (used by guards/menus).
	 * - Initialize import event subscription early so the app can track running imports.
	 * - In Electron, run a lightweight ping to validate IPC wiring.
	 */
	async ngOnInit(): Promise<void> {
		// Ensure global state is populated as early as possible.
		await this.accountsState.refresh();

		// Safe to call multiple times; it only attaches listeners once.
		this.importState.ensureInitialized();

		// In browser mode, `window.electron` is not present.
		if (!window.electron) {
			console.log('[Angular] window.electron is not available (browser mode)');
			return;
		}

		try {
			const res = await window.electron.ping();
			console.log('[Angular] ping result:', res);
		} catch (err) {
			console.error('[Angular] ping failed:', err);
		}
	}
}
